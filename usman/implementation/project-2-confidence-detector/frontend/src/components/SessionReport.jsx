import { useRef } from 'react'
import { Link } from 'react-router-dom'
import ScoreGauge from './ScoreGauge'
import SignalInfoTooltip from './SignalInfoTooltip'
import SessionGraph from './SessionGraph'
import TranscriptView from './TranscriptView'
import ProgressChart from './ProgressChart'
import ScoreBreakdownPanel from './ScoreBreakdownPanel'
import CoachingPanel from './CoachingPanel'
import { API_BASE, apiFetch, mediaUrl } from '../config'

export default function SessionReport({
  report,
  onDownloadJSON,
  onCopyTranscript,
  showRecording = false,
  playerHandleRef = null,
}) {
  const videoElRef = useRef(null)

  if (playerHandleRef) {
    playerHandleRef.current = {
      getCurrentTime() {
        return videoElRef.current?.currentTime || 0
      },
      seekAndPlay(startS, endS) {
        const video = videoElRef.current
        if (!video) return
        video.currentTime = Math.max(0, Number(startS) || 0)
        video.play().catch(() => {})
        if (endS != null && Number(endS) > Number(startS)) {
          if (video._cdRangePauseHandler) {
            video.removeEventListener('timeupdate', video._cdRangePauseHandler)
          }
          const handler = () => {
            if (video.currentTime >= Number(endS)) {
              video.pause()
              video.removeEventListener('timeupdate', handler)
              video._cdRangePauseHandler = null
            }
          }
          video._cdRangePauseHandler = handler
          video.addEventListener('timeupdate', handler)
        }
      },
    }
  }

  if (!report) return null
  if (report.error) {
    return (
      <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2">
        {report.error}
      </div>
    )
  }

  const {
    avg_score, peak_score, lowest_score, grade, grade_label,
    signal_averages, signal_stderrs, signal_reasons, filler_breakdown,
    total_fillers, acoustic_fillers, pace, insights, action_items,
    timeline, transcript, duration_s, session_id,
    recording, kind, topic,
    signal_baseline_adjusted, user_baseline, baseline_note,
    insufficient_speech, unsupported_language, status_message,
    coaching, coaching_status, coaching_skip_reason,
    wins: reportWins, improvements: reportImprovements,
    transcript_confidence,
  } = report

  // Title-vs-transcript mismatch banner. The llm_coach module flags
  // this with skip_reason="topic_mismatch" (keyword pre-filter) or
  // "model_topic_mismatch" (Gemini itself returned null for the
  // off-topic transcript). Either way the user typed a topic and we
  // detected the recording didn't actually cover it — surface that
  // clearly instead of letting the rule-based fallback render
  // silently as if everything was fine.
  const topicMismatch = (
    coaching_status === 'skipped' &&
    (coaching_skip_reason === 'topic_mismatch' ||
     coaching_skip_reason === 'model_topic_mismatch')
  )

  // LLM-generated coaching takes priority over the rule-based
  // insights/action_items card. When coaching_status is "skipped" /
  // "failed" / undefined we fall back to the rule-based card so users
  // still get something actionable.
  const hasLLMCoaching = coaching_status === 'ready' && coaching

  // Always-rendered fallback content. Prefer top-level `wins` /
  // `improvements` (the merged Gemini output OR the rule-based
  // defaults populated by report_generator), then fall back to
  // insights / action_items for older reports without those keys.
  const fallbackWins =
    Array.isArray(reportWins) && reportWins.length > 0
      ? reportWins
      : Array.isArray(insights) ? insights : []
  const fallbackImprovements =
    Array.isArray(reportImprovements) && reportImprovements.length > 0
      ? reportImprovements
      : Array.isArray(action_items) ? action_items : []

  if (insufficient_speech || unsupported_language || avg_score == null) {
    return (
      <div className="glass-card p-8 text-center max-w-xl mx-auto my-6">
        <div className="text-4xl mb-3">⚠️</div>
        <h3 className="text-text-primary mb-3">We couldn&apos;t score this recording</h3>
        <p className="text-text-secondary mb-6">
          {status_message || 'Not enough speech to score. Try recording again and speak for at least a few seconds.'}
        </p>
        <Link to="/live" className="btn btn-primary">Try again</Link>
      </div>
    )
  }

  const faceUnavailable = kind === 'analyzer_audio'

  const recordingVideoUrl = recording?.video_url
    ? mediaUrl(recording.video_url)
    : null

  const graphHistory = (timeline || []).map((t) => ({
    time: t.t_s,
    score: t.total,
  }))

  const scoreColorClass = (s) => {
    if (s == null) return 'text-text-muted'
    return s >= 71 ? 'text-success' : s >= 41 ? 'text-warning' : 'text-danger'
  }

  return (
    <div className="space-y-6">
      {/* Score hero */}
      <div className="glass-card p-8 flex flex-col sm:flex-row items-center gap-8">
        <ScoreGauge score={avg_score} size={200} />
        <div className="flex-1 space-y-2 text-center sm:text-left">
          <div className="flex items-center gap-3 justify-center sm:justify-start flex-wrap">
            <span className="text-6xl font-display font-extrabold text-text-primary leading-none">
              {Math.round(avg_score)}
            </span>
            <span className={`text-3xl font-display font-bold ${scoreColorClass(avg_score)}`}>
              {grade}
            </span>
          </div>
          <p className="text-text-secondary">{grade_label}</p>
          <div className="flex items-center gap-2 flex-wrap justify-center sm:justify-start pt-2">
            <span className="badge badge-muted">Peak: {peak_score}</span>
            <span className="badge badge-muted">Lowest: {lowest_score}</span>
            <span className="badge badge-muted">{formatDuration(duration_s)}</span>
          </div>
        </div>
      </div>

      {/* Topic-mismatch banner — only when the user typed a title AND
          the transcript didn't cover it (per Gemini or the keyword
          pre-filter). Shown ABOVE the coaching card so the user
          understands why detailed AI coaching wasn't generated. */}
      {topicMismatch && (
        <div className="glass-card p-5 border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.08)]">
          <p className="text-sm font-semibold text-warning uppercase tracking-wider mb-2">
            ⚠ Transcript didn’t match the topic
          </p>
          <p className="text-sm text-text-secondary leading-relaxed">
            {topic ? (
              <>The transcript of this recording didn’t cover <strong className="text-text-primary">“{topic}”</strong>.</>
            ) : (
              <>The transcript of this recording didn’t cover the topic you set.</>
            )}{' '}
            We’re showing rule-based feedback below instead of detailed AI coaching.
            Re-record with a transcript that talks about the topic, or leave the title blank, to get the right kind of coaching.
          </p>
        </div>
      )}

      {/* Coaching — Gemini-powered when available, rule-based fallback otherwise.
          The fallback card ALWAYS renders so the user sees a "What went well"
          + "What to Improve" pair on every scoreable session, even when the
          LLM was skipped or returned empty arrays. */}
      {hasLLMCoaching ? (
        <CoachingPanel coaching={coaching} status={coaching_status} />
      ) : (
        <div className="glass-card p-6 border border-border-accent">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
            ✦ Coaching Insights
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-success text-sm font-semibold mb-2">✅ What went well</p>
              {fallbackWins.length > 0 ? (
                <ul className="space-y-1.5">
                  {fallbackWins.map((insight, i) => (
                    <li key={i} className="text-sm text-text-secondary flex gap-2">
                      <span className="text-text-muted">·</span><span>{insight}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted italic">
                  Nothing specific stood out as a win this session.
                </p>
              )}
            </div>
            <div>
              <p className="text-warning text-sm font-semibold mb-2">↗ What to improve</p>
              {fallbackImprovements.length > 0 ? (
                <ul className="space-y-1.5">
                  {fallbackImprovements.map((item, i) => (
                    <li key={i} className="text-sm text-text-secondary flex gap-2">
                      <span className="text-text-muted">·</span><span>{item}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-muted italic">
                  No specific improvements flagged. Pick a practice topic next time for AI coaching.
                </p>
              )}
            </div>
          </div>
          {coaching_status !== 'ready' && (
            <p className="text-xs text-text-muted italic mt-3 pt-3 border-t border-border">
              💡 Pick a practice topic before recording for detailed AI-powered coaching.
            </p>
          )}
        </div>
      )}

      {/* Practice Again CTA */}
      <Link to="/live" className="btn btn-primary btn-full btn-lg">
        Practice Again →
      </Link>

      <hr className="border-border" />

      {showRecording && recordingVideoUrl && (
        <div className="glass-card p-4">
          <video
            ref={videoElRef}
            src={recordingVideoUrl}
            controls
            playsInline
            preload="metadata"
            className="w-full rounded-md bg-black"
          />
        </div>
      )}

      {/* Signal bars */}
      <div className="glass-card p-5">
        <h3 className="mb-4">Signal Breakdown</h3>
        <ReportSignalBars
          signals={signal_averages}
          stderrs={signal_stderrs}
          reasons={signal_reasons}
          faceUnavailable={faceUnavailable}
        />
      </div>

      <ScoreBreakdownPanel
        avgScore={avg_score}
        signalAverages={signal_averages}
        signalReasons={signal_reasons}
        signalBaselineAdjusted={signal_baseline_adjusted}
        userBaseline={user_baseline}
        baselineNote={baseline_note}
        transcriptConfidence={transcript_confidence}
      />

      {/* Score timeline */}
      {graphHistory.length > 2 && (
        <div className="glass-card p-5">
          <SessionGraph history={graphHistory} />
          {session_id && (
            <div className="mt-2 text-right">
              <button
                type="button"
                onClick={() => downloadCsv(session_id)}
                className="text-text-accent text-xs hover:underline"
              >
                ⬇ Download raw scores (CSV)
              </button>
            </div>
          )}
        </div>
      )}

      {/* Progress across sessions */}
      {session_id && (
        <div className="glass-card p-5">
          <ProgressChart
            topic={topic || undefined}
            currentSessionId={session_id}
            limit={10}
          />
        </div>
      )}

      {/* Filler breakdown */}
      {total_fillers > 0 && (
        <div className="glass-card p-5">
          <h3 className="mb-4">Filler Words</h3>
          <p className="text-sm text-text-secondary mb-3">
            <span className="text-warning font-display font-bold text-xl">{total_fillers}</span> total fillers
            {acoustic_fillers > 0 && (
              <span className="ml-2 text-text-muted">({acoustic_fillers} detected from audio sounds)</span>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(filler_breakdown || {}).map(([word, count]) => (
              <span key={word} className="badge badge-warning">{word} ({count})</span>
            ))}
          </div>
        </div>
      )}

      {pace && (
        <div className="glass-card p-5">
          <h3 className="mb-4">Pace Analysis</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-elevated rounded-md p-3 text-center">
              <p className="text-xl font-display font-bold text-text-primary">{pace.avg_wpm}</p>
              <p className="text-xs text-text-muted">Avg WPM</p>
            </div>
            <div className="bg-elevated rounded-md p-3 text-center">
              <p className="text-xl font-display font-bold text-success">{pace.ideal_pct}%</p>
              <p className="text-xs text-text-muted">Ideal pace</p>
            </div>
            <div className="bg-elevated rounded-md p-3 text-center">
              <p className="text-xl font-display font-bold text-warning">{pace.too_fast_pct}%</p>
              <p className="text-xs text-text-muted">Too fast</p>
            </div>
            <div className="bg-elevated rounded-md p-3 text-center">
              <p className="text-xl font-display font-bold text-warning">{pace.too_slow_pct}%</p>
              <p className="text-xs text-text-muted">Too slow</p>
            </div>
          </div>
        </div>
      )}

      {transcript && transcript.length > 0 && (
        <div className="glass-card p-5">
          <h3 className="mb-4">Transcript</h3>
          <TranscriptView words={transcript} />
        </div>
      )}

      {(onDownloadJSON || onCopyTranscript) && (
        <div className="flex gap-3 justify-center pt-2">
          {onDownloadJSON && (
            <button className="btn btn-primary" onClick={onDownloadJSON}>
              Download Report JSON
            </button>
          )}
          {onCopyTranscript && (
            <button className="btn btn-secondary" onClick={onCopyTranscript}>
              Copy Transcript
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function ReportSignalBars({ signals, stderrs, reasons, faceUnavailable }) {
  if (!signals) return null
  const items = [
    { key: 'voice_steadiness', label: 'Voice Steadiness', face: false },
    { key: 'eye_contact',      label: 'Eye Contact',      face: true  },
    { key: 'speech_pace',      label: 'Speech Pace',      face: false },
    { key: 'filler_words',     label: 'Filler Words',     face: false },
    { key: 'vocal_variety',    label: 'Vocal Variety',    face: false },
    { key: 'expression',       label: 'Expression',       face: true  },
  ]

  const fillClass = (v) => {
    if (v >= 75) return 'bg-gradient-to-r from-success to-cyan'
    if (v >= 50) return 'bg-gradient-to-r from-warning to-amber-400'
    return 'bg-gradient-to-r from-danger to-orange-500'
  }

  return (
    <div className="space-y-4">
      {items.map(({ key, label, face }) => {
        const rawValue = signals[key]
        const noData = rawValue === null || rawValue === undefined
        const faceMissing = face && faceUnavailable
        const hide = noData || faceMissing
        const value = noData ? 0 : Number(rawValue)
        const raw = stderrs?.[key]
        const se = typeof raw === 'number' ? Math.round(raw) : null
        const reason = reasons?.[key]
        let unavailableNote = null
        if (faceMissing) unavailableNote = 'No face data available for this recording.'
        else if (noData) unavailableNote = 'No data available for this signal.'
        return (
          <div key={key} className={`space-y-1.5 ${hide ? 'opacity-40' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-text-primary">{label}</span>
                  {!hide && <SignalInfoTooltip signal={key} />}
                </div>
                {reason && !hide && (
                  <p className="text-xs text-text-muted mt-0.5">{reason}</p>
                )}
                {hide && unavailableNote && (
                  <p className="text-xs text-text-muted mt-0.5">{unavailableNote}</p>
                )}
              </div>
              <span className="text-sm font-bold font-display tabular-nums text-text-primary flex-shrink-0">
                {hide ? '—' : Math.round(value)}
                {!hide && se !== null && se >= 1 && (
                  <span className="text-text-muted text-xs ml-1">± {se}</span>
                )}
              </span>
            </div>
            <div className="h-1.5 bg-elevated rounded-full overflow-hidden">
              {!hide && (
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${fillClass(value)}`}
                  style={{ width: `${value}%` }}
                />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

async function downloadCsv(sessionId) {
  try {
    const res = await apiFetch(`${API_BASE}/api/report/${sessionId}/csv`)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${sessionId}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  } catch (e) {
    // Surface inline by triggering a hosted alert is removed in this revamp;
    // the download fail path is rare. Console-log instead.
    console.error('CSV download failed', e)
  }
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
