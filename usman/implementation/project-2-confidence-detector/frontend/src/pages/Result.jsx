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
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [discardBusy, setDiscardBusy] = useState(false)
  // Share modal toggle. Only renders for owners; recipients see a
  // "Shared by X" banner instead.
  const [shareOpen, setShareOpen] = useState(false)
  // Imperative handle to whichever media player is currently rendered
  // (audio for analyzer_audio, video for session/upload). Populated by
  // the player's forwardRef / playerHandleRef on mount, consumed by
  // CommentsThread to seek + auto-pause for ranged comments.
  const playerRef = useRef(null)

  // Discard + re-take: hard-deletes the recording then sends the user
  // back to the live page. Same backend path as DELETE — the framing
  // here is "I want to redo this", not "GDPR delete forever". Uses
  // confirm() because the action is irreversible and a stray click
  // shouldn't trash a recording.
  async function discardAndRetake() {
    if (!data) return
    if (!window.confirm(
      'Discard this recording and start over? This cannot be undone.'
    )) return
    setDiscardBusy(true)
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${id}/discard`, {
        method: 'POST',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      // Route back to the originating mode. analyzer_audio came from
      // /analyzer (live audio); session from /live; upload from /upload.
      const dest = data.kind === 'analyzer_audio' ? '/analyzer'
                 : data.kind === 'session' ? '/live'
                 : '/upload'
      navigate(dest, { replace: true })
    } catch (e) {
      alert(`Discard failed: ${e.message}`)
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
    return (
      <UploadResult
        data={data}
        mediaId={data.media_id || id}
        onUpdated={(saved) => setData((prev) => ({ ...prev, ...saved }))}
        onDiscard={discardAndRetake}
        discardBusy={discardBusy}
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

  // Analyzer audio: audio playback synced to scores + transcript, then the
  // full SessionReport underneath for the static numbers.
  const isAnalyzerAudio =
    data.kind === 'analyzer_audio' || data?.recording?.audio_url != null

  // Owner vs recipient view. Backend sends `is_owner` and `shared_by`;
  // recipients only see the read+comment surface.
  const isOwner = data.is_owner !== false  // default true for legacy records

  return (
    <div className="section">
      {data.language_warning && (
        <div
          className="session-error"
          style={{
            background: '#3b2f00',
            border: '1px solid #8a7100',
            color: '#ffd95a',
            marginBottom: 16,
          }}
        >
          <strong>Language warning:</strong> {data.language_warning}
        </div>
      )}

      {!isOwner && data.shared_by && (
        <div
          style={{
            background: '#1a2438',
            border: '1px solid #2a3850',
            color: '#cfe1ff',
            padding: '10px 14px',
            borderRadius: 6,
            marginBottom: 16,
            fontSize: '0.9em',
          }}
        >
          <strong>Shared by</strong> {data.shared_by.name || data.shared_by.email}.
          You can read and comment, but only the owner can edit, trim,
          or delete this recording.
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
        // Only attach playerHandleRef to SessionReport when it's
        // actually showing the recording video. Without that condition
        // the audio-branch and video-branch would race to overwrite
        // playerRef with each other's API.
        playerHandleRef={!isAnalyzerAudio ? playerRef : null}
      />

      <CommentsThread
        mediaId={data.media_id || id}
        isMediaOwner={isOwner}
        playerRef={playerRef}
      />

      <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
        <Link to="/library" className="report-btn">
          ← Back to Library
        </Link>
        {isOwner && (
          <>
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="report-btn"
              style={{ background: '#2a3850' }}
            >
              Share this recording
            </button>
            <button
              type="button"
              onClick={discardAndRetake}
              disabled={discardBusy}
              style={{
                background: 'transparent',
                border: '1px solid #6a1b1b',
                color: '#ff7a7a',
                padding: '8px 14px',
                borderRadius: 6,
                cursor: discardBusy ? 'wait' : 'pointer',
              }}
            >
              {discardBusy ? 'Discarding…' : 'Discard & re-take'}
            </button>
          </>
        )}
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

// ── Upload-result view (same markup the old inline App.jsx block rendered) ──
function UploadResult({
  data, mediaId, onUpdated, onDiscard, discardBusy,
  isOwner = true, sharedBy = null,
  onOpenShare, shareModalOpen, onCloseShare,
  // From parent — single ref used by both PlaybackReview (for its
  // exposed seekAndPlay/getCurrentTime API) and CommentsThread (for
  // ranged-comment seek + auto-pause).
  playerRef = null,
}) {
  const [modalEntry, setModalEntry] = useState(null)

  // Prefer the backend-signed `recording.video_url` — the bare-filename
  // fallback is left for older report payloads written before the
  // upload handler started emitting a signed URL, but those URLs need
  // a valid signature to play (the legacy ?token= flow is gone).
  const processedVideoUrl = data.recording?.video_url
    ? mediaUrl(data.recording.video_url)
    : data.processed_video
      ? mediaUrl(`/api/video/${data.processed_video}`)
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
        {!isOwner && sharedBy && (
          <div
            style={{
              background: '#1a2438',
              border: '1px solid #2a3850',
              color: '#cfe1ff',
              padding: '10px 14px',
              borderRadius: 6,
              marginBottom: 16,
              fontSize: '0.9em',
            }}
          >
            <strong>Shared by</strong> {sharedBy.name || sharedBy.email}.
            You can read and comment, but only the owner can edit, trim,
            or delete this recording.
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
          <div className="session-error">
            No face was detected in this video. Face-based scores
            (eye contact, expression) defaulted to neutral and may not
            reflect the speaker.
          </div>
        )}
        {data.multi_face_warning && (
          <div
            className="session-error"
            style={{
              background: '#3b2f00',
              border: '1px solid #8a7100',
              color: '#ffd95a',
            }}
          >
            <strong>Multiple faces:</strong> {data.multi_face_warning}
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

        {data.sub_scores && (
          <SignalBars
            scores={data.sub_scores}
            faceUnavailable={!!data.no_face_detected}
          />
        )}

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
        {(processedVideoUrl || data.processed_video) && (
          <PlaybackReview
            // Pass the parent's ref directly. forwardRef +
            // useImperativeHandle in PlaybackReview attaches the
            // {getCurrentTime, seekAndPlay, seekTo} API to it on
            // mount. CommentsThread reads the same ref to capture
            // playback time when the user clicks Set start / Add end.
            ref={playerRef}
            processedVideo={data.processed_video}
            processedVideoUrl={processedVideoUrl}
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

        <CommentsThread
          mediaId={mediaId}
          isMediaOwner={isOwner}
          playerRef={playerRef}
        />

        <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
          <Link to="/library" className="report-btn">← Back to Library</Link>
          {isOwner && (
            <>
              <button
                type="button"
                onClick={onOpenShare}
                className="report-btn"
                style={{ background: '#2a3850' }}
              >
                Share this recording
              </button>
              <button
                type="button"
                onClick={onDiscard}
                disabled={discardBusy}
                style={{
                  background: 'transparent',
                  border: '1px solid #6a1b1b',
                  color: '#ff7a7a',
                  padding: '8px 14px',
                  borderRadius: 6,
                  cursor: discardBusy ? 'wait' : 'pointer',
                }}
              >
                {discardBusy ? 'Discarding…' : 'Discard & re-take'}
              </button>
            </>
          )}
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
    </div>
  )
}
