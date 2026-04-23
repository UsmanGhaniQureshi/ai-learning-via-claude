import { useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { API_BASE } from '../config'
import ScoreGauge from '../components/ScoreGauge'
import SignalBars from '../components/SignalBars'
import FeedbackTips from '../components/FeedbackTips'
import PlaybackReview from '../components/PlaybackReview'
import TimelineModal from '../components/TimelineModal'
import SessionReport from '../components/SessionReport'

/**
 * Result — shared page for every analysis result.
 *
 * URL: /result/:id
 *
 * Fetches /api/report/:id which returns the stored Media.report_json plus
 * a top-level `kind` field ('upload' | 'session' | 'analyzer_audio') added
 * by the backend so we can branch cleanly between shapes here.
 */
export default function Result() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setData(null)
    ;(async () => {
      try {
        const res = await fetch(`${API_BASE}/api/report/${id}`)
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
      <div className="processing">
        <div className="spinner"></div>
        <p>Loading result…</p>
      </div>
    )
  }

  if (error === 'not_found') {
    return (
      <div className="section">
        <h2>Result not found</h2>
        <p className="subtitle">
          No analysis with id <code>{id}</code>. It may have been deleted, or
          the link is wrong.
        </p>
        <Link to="/library" className="report-btn">← Back to Library</Link>
      </div>
    )
  }

  if (error) {
    return <div className="session-error">Failed to load result: {error}</div>
  }

  if (!data) return null

  // Prefer the explicit `kind` when the backend supplied it. For older
  // records (rows stored before the backend started stamping kind), fall
  // back to shape-sniffing: upload responses have overall_confidence /
  // sub_scores / face_timeline; session/analyzer reports have avg_score /
  // signal_averages. Without this, an old upload row lands in the session
  // branch and SessionReport renders all zeros because it's looking for
  // fields that never existed on an upload payload.
  const looksLikeUpload =
    data.kind === 'upload' ||
    data.overall_confidence != null ||
    data.sub_scores != null ||
    Array.isArray(data.face_timeline)

  if (looksLikeUpload) {
    return <UploadResult data={data} />
  }

  const looksLikeSessionReport =
    data.avg_score != null || data.signal_averages != null

  if (!looksLikeSessionReport) {
    // Very old / partial row — report_json existed but no recognisable fields.
    return (
      <div className="section">
        <h2>Partial record</h2>
        <p className="subtitle">
          This entry was saved by an older version of the app and doesn't
          have a full report. You can still browse the raw JSON below.
        </p>
        <pre style={{
          background: '#0f0f18', padding: 16, borderRadius: 8,
          overflow: 'auto', maxHeight: 400, fontSize: '0.8rem',
        }}>
          {JSON.stringify(data, null, 2)}
        </pre>
        <Link to="/library" className="report-btn" style={{ marginTop: 16 }}>
          ← Back to Library
        </Link>
      </div>
    )
  }

  // Session / analyzer_audio: SessionReport renders scores + transcript
  // + video/audio via recording.video_url or recording.audio_url.
  return (
    <div className="section">
      <SessionReport report={data} showRecording={true} />
      <Link to="/library" className="report-btn" style={{ marginTop: 16 }}>
        ← Back to Library
      </Link>
    </div>
  )
}

// ── Upload-result view (same markup the old inline App.jsx block rendered) ──
function UploadResult({ data }) {
  const [modalEntry, setModalEntry] = useState(null)
  const playbackRef = useRef(null)

  const processedVideoUrl = data.processed_video
    ? `${API_BASE}/api/video/${data.processed_video}`
    : null

  const allWords = (data.speech_timeline || []).flatMap(
    (chunk) => chunk.words || []
  )

  const scoreColor = (s) => {
    if (s === null || s === undefined) return '#888'
    return s >= 71 ? '#00c853' : s >= 41 ? '#ffd600' : '#ff1744'
  }
  const scoreLabel = (s) => {
    if (s === null || s === undefined) return 'N/A'
    if (s >= 85) return 'Highly Confident'
    if (s >= 71) return 'Confident'
    if (s >= 50) return 'Moderate'
    if (s >= 25) return 'Developing'
    return 'Low Confidence'
  }

  return (
    <div className="section">
      <div className="results">
        {data.no_face_detected && (
          <div className="session-error">
            No face was detected in this video. Face-based scores
            (eye contact, expression) defaulted to neutral and may not
            reflect the speaker.
          </div>
        )}
        {data.audio_extraction_error && (
          <div className="session-error">
            Audio could not be extracted: {data.audio_extraction_error}
          </div>
        )}
        {data.video_encode_error && (
          <div className="session-error">
            Video re-encode failed: {data.video_encode_error}
          </div>
        )}

        {/* Overall Score Gauge */}
        <div className="upload-score-section">
          <ScoreGauge
            score={data.overall_confidence}
            label={scoreLabel(data.overall_confidence)}
            size={220}
          />
          <div className="score-note">
            Based on face signals + speech patterns. Uses weighted sub-scores.
          </div>
        </div>

        {data.sub_scores && <SignalBars scores={data.sub_scores} />}

        {data.tips && <FeedbackTips tips={data.tips} />}

        {/* Score Breakdown Cards */}
        <div className="score-breakdown">
          <div className="breakdown-card">
            <strong style={{ color: scoreColor(data.face_confidence) }}>{data.face_confidence}</strong>
            <span>Face</span>
          </div>
          {data.speech_score !== null && (
            <div className="breakdown-card">
              <strong style={{ color: scoreColor(data.speech_score) }}>{data.speech_score}</strong>
              <span>Speech</span>
            </div>
          )}
          {data.pace_score !== null && (
            <div className="breakdown-card">
              <strong style={{ color: scoreColor(data.pace_score) }}>{data.pace_score}</strong>
              <span>Pace</span>
            </div>
          )}
          <div className="breakdown-card">
            <strong>{Math.floor((data.duration || 0) / 60)}:{String(Math.floor((data.duration || 0) % 60)).padStart(2, '0')}</strong>
            <span>Duration</span>
          </div>
        </div>

        {/* Speech Summary */}
        {data.speech_summary && (
          <div className="speech-summary">
            <h3>Speech Analysis</h3>
            <div className="speech-stats">
              <div className="speech-stat">
                <strong>{data.speech_summary.total_words}</strong>
                <span>Total Words</span>
              </div>
              <div className="speech-stat" style={{ color: data.speech_summary.filler_rate > 5 ? '#ff1744' : '#00c853' }}>
                <strong>{data.speech_summary.total_fillers}</strong>
                <span>Fillers ({data.speech_summary.filler_rate}%)</span>
              </div>
              <div className="speech-stat" style={{ color: data.speech_summary.total_hedges > 3 ? '#ff6d00' : '#00c853' }}>
                <strong>{data.speech_summary.total_hedges}</strong>
                <span>Hedging Phrases</span>
              </div>
              <div className="speech-stat">
                <strong>{data.speech_summary.average_wpm}</strong>
                <span>Words/Min</span>
              </div>
            </div>
            {data.speech_summary.filler_words && data.speech_summary.filler_words.length > 0 && (
              <div className="filler-list">
                <span className="filler-label">Fillers found: </span>
                {[...new Set(data.speech_summary.filler_words)].map((w, i) => (
                  <span key={i} className="filler-tag">{w} ({data.speech_summary.filler_words.filter(x => x === w).length})</span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Synced playback */}
        {data.processed_video && (
          <PlaybackReview
            ref={playbackRef}
            processedVideo={data.processed_video}
            faceTimeline={data.face_timeline}
            speechTimeline={data.speech_timeline}
          />
        )}

        {/* Face Timeline */}
        {data.face_timeline && data.face_timeline.length > 0 && (
          <div className="timeline-section">
            <h3>Timeline — Confidence Over Time</h3>
            {data.face_timeline.map((entry, i) => (
              <button
                key={i}
                type="button"
                className="timeline-card"
                style={{ borderLeft: `4px solid ${scoreColor(entry.face_confidence)}` }}
                onClick={() => setModalEntry(entry)}
                title={`Open ${entry.time_display} window`}
              >
                <div className="timeline-top">
                  {entry.thumb ? (
                    <img
                      src={entry.thumb}
                      alt={`Frame at ${entry.time_display}`}
                      className="timeline-thumb"
                    />
                  ) : (
                    <div className="timeline-thumb timeline-thumb-placeholder" />
                  )}
                  <span className="time">{entry.time_display}</span>
                  <span className="expression">{entry.expression}</span>
                  <span className="timeline-score" style={{ color: scoreColor(entry.face_confidence) }}>
                    Face: {entry.face_confidence}/100
                  </span>
                  <span className="eye-contact">Eye: {entry.eye_contact_pct}%</span>
                  <span className="timeline-open-hint">▶ Open</span>
                </div>
              </button>
            ))}
          </div>
        )}

        <Link to="/library" className="upload-another">← Back to Library</Link>

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
    </div>
  )
}
