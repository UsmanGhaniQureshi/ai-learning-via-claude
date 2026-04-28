import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import { API_BASE, apiFetch, mediaUrl } from '../config'
import ScoreGauge from '../components/ScoreGauge'
import SignalBars from '../components/SignalBars'
import FeedbackTips from '../components/FeedbackTips'
import PlaybackReview from '../components/PlaybackReview'
import AudioPlaybackReview from '../components/AudioPlaybackReview'
import TimelineModal from '../components/TimelineModal'
import SessionReport from '../components/SessionReport'
import MetadataEditor from '../components/MetadataEditor'
import CommentsThread from '../components/CommentsThread'
import ShareModal from '../components/ShareModal'
import ScoreBreakdownPanel from '../components/ScoreBreakdownPanel'
import CoachingPanel from '../components/CoachingPanel'

export default function Result() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [discardBusy, setDiscardBusy] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [discardError, setDiscardError] = useState(null)
  const playerRef = useRef(null)

  async function discardAndRetake() {
    if (!data) return
    if (!window.confirm('Discard this recording and start over? This cannot be undone.')) return
    setDiscardBusy(true)
    setDiscardError(null)
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${id}/discard`, { method: 'POST' })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const dest = data.kind === 'analyzer_audio' ? '/analyzer'
                 : data.kind === 'session' ? '/live'
                 : '/upload'
      navigate(dest, { replace: true })
    } catch (e) {
      setDiscardError(`Discard failed: ${e.message}`)
      setDiscardBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    ;(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/api/report/${id}`)
        if (res.status === 404) {
          if (!cancelled) {
            setError('not_found')
            setLoading(false)
          }
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e.message || 'Failed to load result')
          setLoading(false)
        }
      }
    })()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="glass-card p-12 text-center max-w-md mx-auto space-y-3">
        <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-primary">Loading result…</p>
      </div>
    )
  }

  if (error === 'not_found') {
    return (
      <div className="text-center py-16 space-y-4">
        <h2>Result not found</h2>
        <p className="text-text-secondary">
          No analysis with id <code className="bg-elevated px-2 py-0.5 rounded text-sm">{id}</code>. It may have been deleted, or the link is wrong.
        </p>
        <Link to="/library" className="btn btn-primary">← Back to Library</Link>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2">
        Failed to load result: {error}
      </div>
    )
  }

  if (!data) return null

  const looksLikeUpload =
    data.kind === 'upload' ||
    data.overall_confidence != null ||
    data.sub_scores != null ||
    Array.isArray(data.face_timeline)

  if (looksLikeUpload) {
    return (
      <UploadResult
        data={data}
        mediaId={data.media_id || id}
        onUpdated={(saved) => setData((prev) => ({ ...prev, ...saved }))}
        onDiscard={discardAndRetake}
        discardBusy={discardBusy}
        discardError={discardError}
        isOwner={data.is_owner !== false}
        sharedBy={data.shared_by}
        onOpenShare={() => setShareOpen(true)}
        shareModalOpen={shareOpen}
        onCloseShare={() => setShareOpen(false)}
        playerRef={playerRef}
      />
    )
  }

  const looksLikeSessionReport =
    data.avg_score != null || data.signal_averages != null

  if (!looksLikeSessionReport) {
    return (
      <div className="space-y-4">
        <h2>Partial record</h2>
        <p className="text-text-secondary">
          This entry was saved by an older version of the app and doesn&apos;t have a full report. You can still browse the raw JSON below.
        </p>
        <pre className="bg-page/60 border border-border rounded-md p-4 text-xs overflow-auto max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
        <Link to="/library" className="btn btn-primary">← Back to Library</Link>
      </div>
    )
  }

  const isAnalyzerAudio =
    data.kind === 'analyzer_audio' || data?.recording?.audio_url != null

  const isOwner = data.is_owner !== false

  return (
    <div>
      <p className="text-sm text-text-muted mb-6">
        <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
        {' / '}
        <Link to="/library" className="hover:text-text-accent transition-colors">Library</Link>
        {' / '}
        <span className="text-text-secondary">Result</span>
      </p>

      {!isOwner && data.shared_by && (
        <div className="bg-[rgba(6,182,212,0.1)] border border-[rgba(6,182,212,0.3)] text-cyan text-sm rounded-md px-4 py-2 mb-4">
          <strong>Shared by</strong> {data.shared_by.name || data.shared_by.email}. You can read and comment, but only the owner can edit, trim, or delete this recording.
        </div>
      )}

      {discardError && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-4">
          {discardError}
        </div>
      )}

      {isOwner && (
        <MetadataEditor
          mediaId={data.media_id || id}
          initial={{ title: data.title, topic: data.topic, tags: data.tags }}
          onUpdated={(saved) => setData((prev) => ({ ...prev, ...saved }))}
        />
      )}

      {isAnalyzerAudio && <AudioPlaybackReview ref={playerRef} report={data} />}
      <SessionReport
        report={data}
        showRecording={!isAnalyzerAudio}
        playerHandleRef={!isAnalyzerAudio ? playerRef : null}
      />

      <CommentsThread
        mediaId={data.media_id || id}
        isMediaOwner={isOwner}
        playerRef={playerRef}
      />

      {/* Result footer — destructive isolated left, safe right */}
      <div className="flex items-center justify-between pt-6 border-t border-border mt-8 flex-wrap gap-3">
        {isOwner ? (
          <button
            type="button"
            onClick={discardAndRetake}
            disabled={discardBusy}
            className="text-danger text-sm hover:underline transition-colors disabled:opacity-50"
          >
            {discardBusy ? 'Discarding…' : 'Discard'}
          </button>
        ) : <span />}
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/library" className="btn btn-secondary btn-sm">← Library</Link>
          {isOwner && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="btn btn-secondary btn-sm"
            >
              ↗ Share
            </button>
          )}
        </div>
      </div>

      {shareOpen && (
        <ShareModal
          mediaId={data.media_id || id}
          onClose={() => setShareOpen(false)}
        />
      )}
    </div>
  )
}

function UploadResult({
  data, mediaId, onUpdated, onDiscard, discardBusy, discardError,
  isOwner = true, sharedBy = null,
  onOpenShare, shareModalOpen, onCloseShare,
  playerRef = null,
}) {
  const [modalEntry, setModalEntry] = useState(null)

  const processedVideoUrl = data.recording?.video_url
    ? mediaUrl(data.recording.video_url)
    : data.processed_video
      ? mediaUrl(`/api/video/${data.processed_video}`)
      : null

  const allWords = (data.speech_timeline || []).flatMap(
    (chunk) => chunk.words || []
  )

  const scoreColor = (s) => {
    if (s === null || s === undefined) return 'text-text-muted'
    return s >= 71 ? 'text-success' : s >= 41 ? 'text-warning' : 'text-danger'
  }
  const scoreLabel = (s) => {
    if (s === null || s === undefined) return 'N/A'
    if (s >= 85) return 'Highly Confident'
    if (s >= 71) return 'Confident'
    if (s >= 50) return 'Moderate'
    if (s >= 25) return 'Developing'
    return 'Low Confidence'
  }
  const grade = (s) => {
    if (s == null) return ''
    if (s >= 85) return 'A'
    if (s >= 71) return 'B'
    if (s >= 50) return 'C'
    if (s >= 25) return 'D'
    return 'F'
  }

  if (data.insufficient_speech || data.unsupported_language || data.overall_confidence == null) {
    return (
      <div>
        <p className="text-sm text-text-muted mb-6">
          <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
          {' / '}
          <Link to="/library" className="hover:text-text-accent transition-colors">Library</Link>
          {' / '}
          <span className="text-text-secondary">Result</span>
        </p>

        <div className="glass-card p-8 text-center max-w-xl mx-auto">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="text-text-primary mb-3">We couldn&apos;t score this recording</h3>
          <p className="text-text-secondary mb-6">
            {data.status_message || 'Not enough speech to score. Try recording again and speak for at least a few seconds.'}
          </p>
          <Link to="/upload" className="btn btn-primary">Upload another recording</Link>
        </div>
      </div>
    )
  }

  const score = data.overall_confidence
  const wins = (data.tips || []).filter((t) => /great|good|nice|keep|excellent|strong/i.test(t))
  const improvements = (data.tips || []).filter((t) => !wins.includes(t))

  return (
    <div>
      <p className="text-sm text-text-muted mb-6">
        <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
        {' / '}
        <Link to="/library" className="hover:text-text-accent transition-colors">Library</Link>
        {' / '}
        <span className="text-text-secondary">Result</span>
      </p>

      {!isOwner && sharedBy && (
        <div className="bg-[rgba(6,182,212,0.1)] border border-[rgba(6,182,212,0.3)] text-cyan text-sm rounded-md px-4 py-2 mb-4">
          <strong>Shared by</strong> {sharedBy.name || sharedBy.email}. You can read and comment, but only the owner can edit, trim, or delete this recording.
        </div>
      )}

      {discardError && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-4">
          {discardError}
        </div>
      )}

      {isOwner && (
        <MetadataEditor
          mediaId={mediaId}
          initial={{ title: data.title, topic: data.topic, tags: data.tags }}
          onUpdated={onUpdated}
        />
      )}

      {data.no_face_detected && (
        <div className="bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-warning text-sm rounded-md px-4 py-2 mb-4">
          No face was detected in this video. Face-based scores (eye contact, expression) are marked unavailable and were excluded from the headline score.
        </div>
      )}
      {data.multi_face_warning && (
        <div className="bg-[rgba(245,158,11,0.1)] border border-[rgba(245,158,11,0.3)] text-warning text-sm rounded-md px-4 py-2 mb-4">
          <strong>Multiple faces:</strong> {data.multi_face_warning}
        </div>
      )}
      {data.audio_extraction_error && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-4">
          Audio could not be extracted: {data.audio_extraction_error}
        </div>
      )}
      {data.video_encode_error && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2 mb-4">
          Video re-encode failed: {data.video_encode_error}
        </div>
      )}

      {/* Score hero */}
      <div className="glass-card p-8 flex flex-col sm:flex-row items-center gap-8 mb-6">
        <ScoreGauge score={score} size={200} />
        <div className="flex-1 space-y-2 text-center sm:text-left">
          <div className="flex items-center gap-3 justify-center sm:justify-start flex-wrap">
            <span className="text-6xl font-display font-extrabold text-text-primary leading-none">
              {Math.round(score)}
            </span>
            <span className={`text-3xl font-display font-bold ${scoreColor(score)}`}>
              {grade(score)}
            </span>
          </div>
          <p className="text-text-secondary">{scoreLabel(score)}</p>
        </div>
      </div>

      {/* Coaching — Gemini-powered when topic was set, rule-based fallback otherwise */}
      {data.coaching_status === 'ready' && data.coaching ? (
        <div className="mb-6">
          <CoachingPanel coaching={data.coaching} status={data.coaching_status} />
        </div>
      ) : (
        (wins.length > 0 || improvements.length > 0) && (
          <div className="glass-card p-6 mb-6 border border-border-accent">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wider mb-4">
              ✦ Coaching Insights
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {wins.length > 0 && (
                <div>
                  <p className="text-success text-sm font-semibold mb-2">✅ What went well</p>
                  <ul className="space-y-1.5">
                    {wins.map((w, i) => (
                      <li key={i} className="text-sm text-text-secondary flex gap-2">
                        <span className="text-text-muted">·</span><span>{w}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {improvements.length > 0 && (
                <div>
                  <p className="text-warning text-sm font-semibold mb-2">↗ Work on next</p>
                  <ul className="space-y-1.5">
                    {improvements.map((imp, i) => (
                      <li key={i} className="text-sm text-text-secondary flex gap-2">
                        <span className="text-text-muted">·</span><span>{imp}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )
      )}

      {/* Practice Again CTA */}
      <Link to="/upload" className="btn btn-primary btn-full btn-lg mb-8">
        Analyze another →
      </Link>

      <hr className="border-border mb-8" />

      {data.sub_scores && (
        <div className="glass-card p-5 mb-6">
          <h3 className="mb-4">Signal Breakdown</h3>
          <SignalBars
            scores={data.sub_scores}
            faceUnavailable={!!data.no_face_detected}
          />
        </div>
      )}

      {data.sub_scores && (
        <ScoreBreakdownPanel
          avgScore={data.overall_confidence}
          signalAverages={{
            voice_steadiness: data.sub_scores.voiceSteadiness,
            eye_contact: data.sub_scores.eyeContact,
            speech_pace: data.sub_scores.speechPace,
            filler_words: data.sub_scores.fillerWords,
            vocal_variety: data.sub_scores.vocalVariety,
            expression: data.sub_scores.expression,
          }}
          signalReasons={data.signal_reasons}
        />
      )}

      {data.tips && wins.length === 0 && improvements.length === 0 && (
        <FeedbackTips tips={data.tips} />
      )}

      {/* Speech summary */}
      {data.speech_summary && (
        <div className="glass-card p-5 mb-6">
          <h3 className="mb-4">Speech Analysis</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-elevated rounded-md p-3 text-center">
              <p className="text-xl font-display font-bold text-text-primary">{data.speech_summary.total_words}</p>
              <p className="text-xs text-text-muted">Total Words</p>
            </div>
            <div className="bg-elevated rounded-md p-3 text-center">
              <p className={`text-xl font-display font-bold ${data.speech_summary.filler_rate > 5 ? 'text-danger' : 'text-success'}`}>
                {data.speech_summary.total_fillers}
              </p>
              <p className="text-xs text-text-muted">Fillers ({data.speech_summary.filler_rate}%)</p>
            </div>
            <div className="bg-elevated rounded-md p-3 text-center">
              <p className={`text-xl font-display font-bold ${data.speech_summary.total_hedges > 3 ? 'text-warning' : 'text-success'}`}>
                {data.speech_summary.total_hedges}
              </p>
              <p className="text-xs text-text-muted">Hedging Phrases</p>
            </div>
            <div className="bg-elevated rounded-md p-3 text-center">
              <p className="text-xl font-display font-bold text-text-primary">{data.speech_summary.average_wpm}</p>
              <p className="text-xs text-text-muted">Words/Min</p>
            </div>
          </div>
          {data.speech_summary.filler_words && data.speech_summary.filler_words.length > 0 && (
            <div className="mt-4 text-sm text-text-secondary">
              <span className="text-warning font-semibold">Fillers found:</span>{' '}
              {[...new Set(data.speech_summary.filler_words)].map((w) => (
                <span key={w} className="badge badge-warning ml-1">
                  {w} ({data.speech_summary.filler_words.filter((x) => x === w).length})
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {(processedVideoUrl || data.processed_video) && (
        <PlaybackReview
          ref={playerRef}
          processedVideo={data.processed_video}
          processedVideoUrl={processedVideoUrl}
          faceTimeline={data.face_timeline}
          speechTimeline={data.speech_timeline}
        />
      )}

      {data.face_timeline && data.face_timeline.length > 0 && (
        <div className="glass-card p-5 mt-6">
          <h3 className="mb-4">Timeline — Confidence Over Time</h3>
          <details className="bg-page/60 border border-border rounded-md p-3 mb-4 text-sm">
            <summary className="cursor-pointer font-semibold text-text-primary select-none">What am I looking at?</summary>
            <div className="mt-2 text-text-secondary leading-relaxed space-y-2">
              <p>Every 2 seconds during the recording, the app took a quick snapshot of your face and noted what it saw. Each row below is one of those snapshots.</p>
              <ul className="list-disc pl-5 space-y-1">
                <li><strong className="text-text-primary">Time</strong> — when in the recording this snapshot was taken (minutes:seconds from the start).</li>
                <li><strong className="text-text-primary">Expression</strong> — what your face was doing: smiling, focused, neutral, and so on. You&apos;ll see <em>calibrating</em> at the very start.</li>
                <li><strong className="text-text-primary">Face: X/100</strong> — overall score for this 2-second window. <span className="text-success">Green</span> 71+, <span className="text-warning">yellow</span> 40–70, <span className="text-danger">red</span> needs work.</li>
                <li><strong className="text-text-primary">Eye: X%</strong> — how much of this window you spent looking at the camera.</li>
              </ul>
              <p className="opacity-85">Click any row to see the actual video frame the numbers came from.</p>
            </div>
          </details>
          <div className="space-y-2">
            {data.face_timeline.map((entry, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setModalEntry(entry)}
                className={`w-full glass-card p-3 text-left flex items-center gap-3 hover:border-border-accent transition-all border-l-4`}
                style={{
                  borderLeftColor:
                    entry.face_confidence >= 71 ? '#10b981'
                    : entry.face_confidence >= 41 ? '#f59e0b'
                    : '#ef4444',
                }}
                title={`Open ${entry.time_display} window`}
              >
                {entry.thumb ? (
                  <img
                    src={entry.thumb}
                    alt={`Frame at ${entry.time_display}`}
                    className="w-24 h-14 object-cover rounded border border-border flex-shrink-0"
                  />
                ) : (
                  <div className="w-24 h-14 rounded bg-elevated flex-shrink-0" />
                )}
                <span className="font-mono text-sm text-text-primary">{entry.time_display}</span>
                <span className="text-text-secondary text-sm">{entry.expression}</span>
                <span className={`text-sm font-semibold ${scoreColor(entry.face_confidence)}`}>
                  Face: {entry.face_confidence}/100
                </span>
                <span className="text-text-muted text-sm">Eye: {entry.eye_contact_pct}%</span>
                <span className="ml-auto text-accent text-sm font-semibold">▶ Open</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <CommentsThread
        mediaId={mediaId}
        isMediaOwner={isOwner}
        playerRef={playerRef}
      />

      {/* Result footer */}
      <div className="flex items-center justify-between pt-6 border-t border-border mt-8 flex-wrap gap-3">
        {isOwner ? (
          <button
            type="button"
            onClick={onDiscard}
            disabled={discardBusy}
            className="text-danger text-sm hover:underline transition-colors disabled:opacity-50"
          >
            {discardBusy ? 'Discarding…' : 'Discard'}
          </button>
        ) : <span />}
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/library" className="btn btn-secondary btn-sm">← Library</Link>
          {isOwner && (
            <button
              type="button"
              onClick={onOpenShare}
              className="btn btn-secondary btn-sm"
            >
              ↗ Share
            </button>
          )}
        </div>
      </div>

      {shareModalOpen && (
        <ShareModal mediaId={mediaId} onClose={onCloseShare} />
      )}

      {modalEntry && processedVideoUrl && (
        <TimelineModal
          videoUrl={processedVideoUrl}
          startTime={modalEntry.timestamp}
          duration={2}
          words={allWords}
          expression={modalEntry.expression}
          score={modalEntry.face_confidence}
          onClose={() => setModalEntry(null)}
        />
      )}
    </div>
  )
}
