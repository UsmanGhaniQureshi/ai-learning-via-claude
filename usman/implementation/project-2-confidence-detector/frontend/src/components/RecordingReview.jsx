import { useEffect, useRef, useState } from 'react'
import TrimSegmentsEditor, { validateSegments } from './TrimSegmentsEditor'
import { fmtSecs } from '../utils/timeStr'

/**
 * RecordingReview — single shared preview / trim / title / analyze step.
 *
 * Mounts after every recording mode hits "stop" or after every upload
 * mode hits a file pick. Replaces the four near-duplicate inline
 * preview blocks that lived in:
 *   - LiveSession.jsx (live video)
 *   - LiveAnalyzer.jsx (live audio)
 *   - Upload.jsx       (video upload)
 *   - Analyzer.jsx     (audio upload)
 *
 * Calls onAnalyze({ title, body, trimSegments }) on submit:
 *   - title: free-form string (empty = no LLM coaching, fall back to
 *            rule-based `tips`).
 *   - body:  free-form brief; helps the topic-relevance gate judge
 *            whether the transcript matches the intent.
 *   - trimSegments: [[start_s, end_s], ...] or null when "Use full clip"
 *                   is checked.
 *
 * Calls onDiscard() when the user wants to drop the current recording
 * and start over.
 *
 * Props:
 *   mediaSrc       blob URL or media URL the player should load
 *   mediaKind      'video' | 'audio' — picks <video> vs <audio> + icon
 *   mediaBytes     optional size hint for the metadata strip
 *   initialTitle   prefill (live flows pass setup.promptTitle here)
 *   initialBody    prefill (live flows pass setup.promptBody here)
 *   submitting     parent-controlled flag — disables CTAs while an
 *                  upload + poll is in flight
 *   error          parent-controlled error string (empty = no banner)
 *   submitLabel    optional override (default "Analyze →")
 */
export default function RecordingReview({
  mediaSrc,
  mediaKind = 'video',
  mediaBytes = null,
  initialTitle = '',
  initialBody = '',
  submitting = false,
  error = null,
  submitLabel = 'Analyze →',
  onAnalyze,
  onDiscard,
}) {
  const playerRef = useRef(null)
  const [duration, setDuration] = useState(0)
  const [useFull, setUseFull] = useState(true)
  const [trimSegments, setTrimSegments] = useState([{ start: '', end: '' }])
  const [title, setTitle] = useState(initialTitle || '')
  const [body, setBody] = useState(initialBody || '')
  const [localError, setLocalError] = useState(null)

  // Parent-driven errors should clear our local validation banner so
  // the most recent message is the one in view.
  useEffect(() => {
    if (error) setLocalError(null)
  }, [error])

  function handleSubmit() {
    setLocalError(null)
    let segmentsPayload = null
    if (!useFull) {
      const v = validateSegments(trimSegments, duration)
      if (!v.ok) {
        setLocalError(v.error)
        return
      }
      segmentsPayload = v.segments
    }
    onAnalyze?.({
      title: title.trim(),
      body: body.trim(),
      trimSegments: segmentsPayload,
    })
  }

  const visibleError = error || localError
  const isVideo = mediaKind === 'video'
  const PlayerTag = isVideo ? 'video' : 'audio'

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h2 className="m-0">Review &amp; Analyze</h2>
        <span className="badge badge-muted">
          {isVideo ? '🎥 Video' : '🎤 Audio'}
        </span>
      </div>
      <p className="text-text-secondary text-sm">
        Scrub through your recording. Optionally trim out filler takes
        and add a topic title — if you set a title, the coach will check
        that your transcript actually matches it. Then click{' '}
        <strong>Analyze</strong>.
      </p>

      {visibleError && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2">
          {visibleError}
        </div>
      )}

      {mediaSrc ? (
        <PlayerTag
          ref={playerRef}
          src={mediaSrc}
          controls
          playsInline={isVideo || undefined}
          preload="metadata"
          onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
          className={
            isVideo
              ? 'w-full max-h-[420px] rounded-md bg-black'
              : 'w-full'
          }
        />
      ) : (
        <div className="glass-card p-8 text-center text-text-muted text-sm">
          Finalising recording…
        </div>
      )}

      {(duration > 0 || mediaBytes != null) && (
        <p className="text-xs text-text-muted">
          {duration > 0 && <>Duration: {fmtSecs(duration)}</>}
          {duration > 0 && mediaBytes != null && <> · </>}
          {mediaBytes != null && <>{(mediaBytes / 1024 / 1024).toFixed(1)} MB</>}
        </p>
      )}

      {/* Trim controls */}
      <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer">
        <input
          type="checkbox"
          checked={useFull}
          onChange={(e) => setUseFull(e.target.checked)}
          className="accent-accent"
          disabled={submitting}
        />
        Use full clip (default — analyze the whole recording)
      </label>
      {!useFull && (
        <TrimSegmentsEditor
          segments={trimSegments}
          onChange={setTrimSegments}
          previewDuration={duration}
          getCurrentTime={() => playerRef.current?.currentTime ?? 0}
        />
      )}

      {/* Title + body (optional, drives LLM coaching). */}
      <div className="glass-card p-4 space-y-3">
        <div>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">
              Topic title <span className="opacity-70">(optional — enables AI coaching)</span>
            </div>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Tell me about yourself / Quarterly all-hands intro"
              maxLength={200}
              className="input"
              disabled={submitting}
            />
          </label>
        </div>
        <div>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">
              Brief <span className="opacity-70">(optional — what should you cover?)</span>
            </div>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={2}
              maxLength={1000}
              placeholder="A line or two on what you wanted to cover. Used to judge whether your transcript matches the topic."
              className="input resize-y"
              disabled={submitting}
            />
          </label>
        </div>
        <p className="text-xs text-text-muted italic">
          {title.trim()
            ? '💡 The coach will check your transcript matches this topic. If it doesn’t, your result page will say so.'
            : '💡 No title? You’ll still get a full numeric report with rule-based tips — just no topic-specific AI coaching.'}
        </p>
      </div>

      {/* Action row */}
      <div className="flex flex-col sm:flex-row gap-3 pt-2">
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!mediaSrc || submitting}
          className="btn btn-primary btn-lg flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Analyzing…' : submitLabel}
        </button>
        <button
          type="button"
          onClick={onDiscard}
          disabled={submitting}
          className="btn btn-secondary btn-lg disabled:opacity-50"
        >
          Discard &amp; restart
        </button>
      </div>
    </div>
  )
}
