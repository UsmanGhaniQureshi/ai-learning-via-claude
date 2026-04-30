import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { API_BASE, apiFetch, mediaUrl } from '../config'
import { pollMediaStatus } from '../utils/mediaStatus'
import ScoreGauge from '../components/ScoreGauge'
import SignalBars from '../components/SignalBars'
import TimelineModal from '../components/TimelineModal'
import SessionReport from '../components/SessionReport'
import MetadataEditor from '../components/MetadataEditor'
import CommentsThread from '../components/CommentsThread'
import ShareModal from '../components/ShareModal'
import ScoreBreakdownPanel from '../components/ScoreBreakdownPanel'

export default function Result() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [statusInfo, setStatusInfo] = useState(null)
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
      const destination = data.kind === 'analyzer_audio'
        ? '/analyzer'
        : data.kind === 'session'
          ? '/live'
          : '/upload'
      navigate(destination, { replace: true })
    } catch (err) {
      setDiscardError(`Discard failed: ${err.message}`)
      setDiscardBusy(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    setStatusInfo(null)
    setData(null)

    async function fetchStatus() {
      try {
        const res = await apiFetch(`${API_BASE}/api/media/${id}/status`)
        if (!res.ok) return null
        return await res.json()
      } catch {
        return null
      }
    }

    async function fetchReport() {
      try {
        const res = await apiFetch(`${API_BASE}/api/report/${id}`)
        if (res.status === 404) {
          const status = await fetchStatus()
          if (cancelled) return
          if (!status) {
            setError({ type: 'not_found' })
            setLoading(false)
            return
          }
          if (status.status === 'pending' || status.status === 'processing') {
            setStatusInfo(status)
            setLoading(false)
            const final = await pollMediaStatus(id, {
              onProgress: (_next, payload) => {
                if (!cancelled) setStatusInfo(payload || status)
              },
            })
            if (cancelled) return
            if (final.status === 'completed') {
              setLoading(true)
              setStatusInfo(final)
              await fetchReport()
              return
            }
            setError({
              type: 'failed',
              message: final.error || 'Analysis failed.',
              kind: final.kind || status.kind,
            })
            setStatusInfo(final)
            setLoading(false)
            return
          }
          if (status.status === 'failed') {
            setError({
              type: 'failed',
              message: status.error || 'Analysis failed.',
              kind: status.kind,
            })
            setStatusInfo(status)
            setLoading(false)
            return
          }
          setError({ type: 'not_found' })
          setLoading(false)
          return
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const json = await res.json()
        if (!cancelled) {
          setData(json)
          setLoading(false)
          setStatusInfo(null)
        }
      } catch (err) {
        console.error('[Result] fetchReport failed:', err)
        if (!cancelled) {
          setError({ type: 'load', message: err.message || 'Failed to load result' })
          setLoading(false)
        }
      }
    }

    fetchReport()
    return () => { cancelled = true }
  }, [id])

  if (loading) {
    return (
      <div className="glass-card p-12 text-center max-w-md mx-auto space-y-3">
        <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-text-primary">Loading result...</p>
      </div>
    )
  }

  if (!data && (statusInfo?.status === 'pending' || statusInfo?.status === 'processing')) {
    return <UploadProcessingState id={id} statusInfo={statusInfo} />
  }

  if (error?.type === 'not_found') {
    return (
      <div className="text-center py-16 space-y-4">
        <h2>Result not found</h2>
        <p className="text-text-secondary">
          No analysis with id <code className="bg-elevated px-2 py-0.5 rounded text-sm">{id}</code>. It may have been deleted, or the link is wrong.
        </p>
        <Link to="/library" className="btn btn-primary">Back to Library</Link>
      </div>
    )
  }

  if (error?.type === 'failed') {
    return (
      <UploadFailureState
        id={id}
        kind={error.kind || statusInfo?.kind}
        reason={error.message}
      />
    )
  }

  if (error) {
    return (
      <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2">
        Failed to load result: {error.message}
      </div>
    )
  }

  if (!data) return null

  const isUploadedMedia = (
    data.kind === 'upload' ||
    data.kind === 'analyzer_audio'
  )

  if (isUploadedMedia) {
    return (
      <UploadedMediaResult
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
        <ResultBreadcrumbs />
        <h2>Partial record</h2>
        <p className="text-text-secondary">
          This entry was saved by an older version of the app and does not have a full report. You can still browse the raw JSON below.
        </p>
        <pre className="bg-page/60 border border-border rounded-md p-4 text-xs overflow-auto max-h-96">
          {JSON.stringify(data, null, 2)}
        </pre>
        <Link to="/library" className="btn btn-primary">Back to Library</Link>
      </div>
    )
  }

  const isOwner = data.is_owner !== false

  return (
    <div>
      <ResultBreadcrumbs />

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

      <SessionReport
        report={data}
        showRecording
        playerHandleRef={playerRef}
      />

      <CommentsThread
        mediaId={data.media_id || id}
        isMediaOwner={isOwner}
        playerRef={playerRef}
      />

      <div className="flex items-center justify-between pt-6 border-t border-border mt-8 flex-wrap gap-3">
        {isOwner ? (
          <button
            type="button"
            onClick={discardAndRetake}
            disabled={discardBusy}
            className="text-danger text-sm hover:underline transition-colors disabled:opacity-50"
          >
            {discardBusy ? 'Discarding...' : 'Discard'}
          </button>
        ) : <span />}
        <div className="flex items-center gap-3 flex-wrap">
          <Link to="/library" className="btn btn-secondary btn-sm">Back to Library</Link>
          {isOwner && (
            <button
              type="button"
              onClick={() => setShareOpen(true)}
              className="btn btn-secondary btn-sm"
            >
              Share
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

function UploadedMediaResult({
  data,
  mediaId,
  onUpdated,
  onDiscard,
  discardBusy,
  discardError,
  isOwner = true,
  sharedBy = null,
  onOpenShare,
  shareModalOpen,
  onCloseShare,
  playerRef = null,
}) {
  const [modalEntry, setModalEntry] = useState(null)

  const mode = getUploadMode(data)
  const uploadPath = mode === 'audio' ? '/analyzer' : '/upload'
  const practicePath = mode === 'audio' ? '/analyzer?mode=live' : '/live'
  const score = getHeadlineScore(data, mode)
  const isUnscoreable = (
    score == null ||
    data.insufficient_speech ||
    data.unsupported_language
  )
  const processedVideoUrl = data.recording?.video_url
    ? mediaUrl(data.recording.video_url)
    : data.processed_video
      ? mediaUrl(`/api/video/${data.processed_video}`)
      : null
  const playerSrc = mode === 'audio'
    ? mediaUrl(data.recording?.audio_url)
    : processedVideoUrl

  const transcript = useMemo(() => getTranscriptContent(data, mode), [data, mode])
  const signalBarScores = useMemo(() => getSignalBarScores(data, mode), [data, mode])
  const signalAverages = useMemo(() => getSignalAverages(data, mode), [data, mode])
  const signalReasons = useMemo(() => getSignalReasons(data, mode), [data, mode])
  const coachingMetrics = useMemo(() => getCoachingMetrics(data, mode), [data, mode])
  const strongestMetric = useMemo(() => (
    coachingMetrics.length
      ? [...coachingMetrics].sort((a, b) => b.score - a.score)[0]
      : null
  ), [coachingMetrics])
  const weakestMetric = useMemo(() => (
    coachingMetrics.length
      ? [...coachingMetrics].sort((a, b) => a.score - b.score)[0]
      : null
  ), [coachingMetrics])
  const actionItems = useMemo(
    () => buildActionItems(data, mode, weakestMetric),
    [data, mode, weakestMetric]
  )
  const nextFocus = useMemo(
    () => buildNextFocusCard(data, mode, weakestMetric, actionItems[0]),
    [data, mode, weakestMetric, actionItems]
  )
  const detailStats = useMemo(() => buildDetailStats(data, mode), [data, mode])
  const notices = useMemo(() => buildUploadNotices(data, mode), [data, mode])
  const title = getUploadTitle(data, mode)
  const subtitle = getUploadSubtitle(data)
  const summaryText = buildHeroSummary(score, strongestMetric, weakestMetric)
  const allWords = transcript.words

  return (
    <div>
      <ResultBreadcrumbs />

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

      {notices.map((notice) => (
        <div
          key={notice.text}
          className={`mb-4 rounded-md border px-4 py-2 text-sm ${notice.className}`}
        >
          {notice.text}
        </div>
      ))}

      {/* Title-vs-transcript mismatch banner. The llm_coach module
          flags this with skip_reason="topic_mismatch" (keyword pre-
          filter) or "model_topic_mismatch" (Gemini itself returned
          null for the off-topic transcript). The user typed a topic
          and the recording didn't cover it. */}
      {data.coaching_status === 'skipped' &&
        (data.coaching_skip_reason === 'topic_mismatch' ||
         data.coaching_skip_reason === 'model_topic_mismatch') && (
        <div className="mb-4 rounded-md border border-[rgba(245,158,11,0.4)] bg-[rgba(245,158,11,0.08)] px-4 py-3 text-sm">
          <p className="font-semibold text-warning uppercase tracking-wider mb-1">
            ⚠ Transcript didn’t match the topic
          </p>
          <p className="text-text-secondary leading-relaxed">
            {data.topic ? (
              <>The transcript of this recording didn’t cover <strong className="text-text-primary">“{data.topic}”</strong>.</>
            ) : (
              <>The transcript of this recording didn’t cover the topic you set.</>
            )}{' '}
            We’re showing rule-based feedback below instead of detailed AI coaching.
            Re-record with a transcript that talks about the topic, or leave the title blank, to get the right kind of coaching.
          </p>
        </div>
      )}

      {isUnscoreable ? (
        <>
          <UnscoreableUploadState
            data={data}
            mode={mode}
            title={title}
            uploadPath={uploadPath}
            practicePath={practicePath}
          />
          {isOwner && (
            <MetadataEditor
              mediaId={mediaId}
              initial={{ title: data.title, topic: data.topic, tags: data.tags }}
              onUpdated={onUpdated}
            />
          )}
          <ResultFooterActions
            mode={mode}
            uploadPath={uploadPath}
            practicePath={practicePath}
            isOwner={isOwner}
            onOpenShare={onOpenShare}
          />
          {isOwner && (
            <DangerZone
              discardBusy={discardBusy}
              onDiscard={onDiscard}
            />
          )}
          {shareModalOpen && (
            <ShareModal mediaId={mediaId} onClose={onCloseShare} />
          )}
        </>
      ) : (
        <>
          <section className="result-hero">
            <div className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="badge badge-accent">
                  {mode === 'audio' ? 'Audio Upload' : 'Video Upload'}
                </span>
                {subtitle && <span className="badge badge-muted">{subtitle}</span>}
              </div>
              <div className="space-y-2">
                <h2>{title}</h2>
                <p className="text-text-secondary">
                  {summaryText}
                </p>
                <p className="text-sm text-text-muted">
                  {getScoreLabel(score)}
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
                <Link to={uploadPath} className="btn btn-primary">Upload Another</Link>
                <Link to="/library" className="btn btn-secondary">Back to Library</Link>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <ScoreGauge score={score} size={176} />
              <div className="space-y-1">
                <p className="text-2xl font-display font-bold text-text-primary">
                  Grade {getGrade(score)}
                </p>
                <p className="text-sm text-text-secondary">
                  Overall confidence score {Math.round(score)}
                </p>
              </div>
            </div>
          </section>

          <section className="mb-6">
            <div className="mb-4">
              <h3>Coaching Summary</h3>
              <p className="text-sm text-text-secondary mt-1">
                Start here before replaying the recording.
              </p>
            </div>
            <div className="result-summary-grid">
              {strongestMetric && (
                <CoachingCard
                  title="Strongest area"
                  metric={strongestMetric}
                  body={getMetricNarrative(strongestMetric, data, mode, 'strong')}
                />
              )}
              {weakestMetric && (
                <CoachingCard
                  title="Weakest area"
                  metric={weakestMetric}
                  body={getMetricNarrative(weakestMetric, data, mode, 'weak')}
                />
              )}
              {nextFocus && (
                <CoachingCard
                  title="Next improvement focus"
                  metric={nextFocus.metric}
                  body={nextFocus.body}
                />
              )}
            </div>
          </section>

          <section className="action-items">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
              <div>
                <h3>Action Items</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Focus on the next one or two changes, then record again.
                </p>
              </div>
            </div>
            <ol className="space-y-3">
              {actionItems.map((item, index) => (
                <li key={item} className="flex gap-3 text-sm text-text-secondary leading-relaxed">
                  <span className="badge badge-accent flex-shrink-0">{index + 1}</span>
                  <span>{item}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="media-review-card">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
              <div>
                <h3>Media Review</h3>
                <p className="text-sm text-text-secondary mt-1">
                  Review the recording after reading the coaching above.
                </p>
              </div>
              <span className="badge badge-muted">{formatDuration(getDurationSeconds(data, mode))}</span>
            </div>

            {playerSrc ? (
              <UploadedMediaPlayer
                ref={playerRef}
                mode={mode}
                src={playerSrc}
                transcript={transcript}
              />
            ) : (
              <div className="transcript-empty">
                Media playback was not available for this recording.
              </div>
            )}
          </section>

          <details className="details-section">
            <summary>Detailed Breakdown</summary>
            <div className="mt-5 space-y-6">
              {signalBarScores && (
                <div>
                  <h3 className="mb-3">Signal Breakdown</h3>
                  <SignalBars
                    scores={signalBarScores}
                    faceUnavailable={!!data.no_face_detected}
                    omitFaceSignals={mode === 'audio'}
                  />
                </div>
              )}

              {signalAverages && (
                <ScoreBreakdownPanel
                  avgScore={score}
                  signalAverages={signalAverages}
                  signalReasons={signalReasons}
                  signalBaselineAdjusted={data.signal_baseline_adjusted}
                  userBaseline={data.user_baseline}
                  baselineNote={data.baseline_note}
                  hiddenSignals={mode === 'audio' ? ['eye_contact', 'expression'] : []}
                />
              )}

              {detailStats.length > 0 && (
                <div>
                  <h3 className="mb-3">Technical Details</h3>
                  <div className="detail-stat-grid">
                    {detailStats.map((item) => (
                      <div key={item.label} className="detail-stat">
                        <p className="text-xs uppercase tracking-wider text-text-muted">{item.label}</p>
                        <p className={`mt-2 text-xl font-display font-bold ${item.valueClass || 'text-text-primary'}`}>
                          {item.value}
                        </p>
                        {item.note && (
                          <p className="mt-2 text-xs text-text-secondary">{item.note}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {mode === 'video' && Array.isArray(data.face_timeline) && data.face_timeline.length > 0 && (
                <div>
                  <h3 className="mb-3">Frame Review</h3>
                  <div className="space-y-3">
                    {data.face_timeline.slice(0, 10).map((entry, index) => (
                      <button
                        key={`${entry.timestamp}-${index}`}
                        type="button"
                        onClick={() => setModalEntry(entry)}
                        className="detail-stat w-full text-left flex gap-3 items-start hover:border-border-accent transition-colors"
                      >
                        {entry.thumb ? (
                          <img
                            src={entry.thumb}
                            alt={`Frame at ${entry.time_display || formatDuration(entry.timestamp)}`}
                            className="w-24 h-14 rounded-md border border-border object-cover flex-shrink-0"
                          />
                        ) : (
                          <div className="w-24 h-14 rounded-md border border-border bg-elevated flex-shrink-0" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="badge badge-muted">
                              {entry.time_display || formatDuration(entry.timestamp)}
                            </span>
                            <span className={getScoreBadgeClass(entry.face_confidence)}>
                              Face {safeRound(entry.face_confidence)}
                            </span>
                            {entry.eye_contact_pct != null && (
                              <span className="text-xs text-text-muted">
                                Eye contact {safeRound(entry.eye_contact_pct)}%
                              </span>
                            )}
                          </div>
                          <p className="mt-2 text-sm text-text-secondary">
                            {entry.expression || 'No expression label was available for this frame.'}
                          </p>
                        </div>
                      </button>
                    ))}
                    {data.face_timeline.length > 10 && (
                      <p className="text-xs text-text-muted">
                        Showing the first 10 snapshots in this summary view.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </details>

          {isOwner && (
            <MetadataEditor
              mediaId={mediaId}
              initial={{ title: data.title, topic: data.topic, tags: data.tags }}
              onUpdated={onUpdated}
            />
          )}

          {playerSrc && (
            <CommentsThread
              mediaId={mediaId}
              isMediaOwner={isOwner}
              playerRef={playerRef}
            />
          )}

          <ResultFooterActions
            mode={mode}
            uploadPath={uploadPath}
            practicePath={practicePath}
            isOwner={isOwner}
            onOpenShare={onOpenShare}
          />

          {isOwner && (
            <DangerZone
              discardBusy={discardBusy}
              onDiscard={onDiscard}
            />
          )}

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
        </>
      )}
    </div>
  )
}

const UploadedMediaPlayer = forwardRef(function UploadedMediaPlayer(
  { mode, src, transcript },
  ref,
) {
  const mediaRef = useRef(null)
  const transcriptContainerRef = useRef(null)
  const activeWordRef = useRef(null)
  const [currentWordIdx, setCurrentWordIdx] = useState(-1)

  const words = useMemo(() => transcript.words || [], [transcript])
  const segments = useMemo(() => transcript.segments || [], [transcript])

  useImperativeHandle(ref, () => ({
    getCurrentTime() {
      return mediaRef.current?.currentTime || 0
    },
    seekAndPlay(startS, endS) {
      const media = mediaRef.current
      if (!media) return
      media.currentTime = Math.max(0, Number(startS) || 0)
      media.play().catch(() => {})
      if (endS != null && Number(endS) > Number(startS)) {
        if (media._cdRangePauseHandler) {
          media.removeEventListener('timeupdate', media._cdRangePauseHandler)
        }
        const handler = () => {
          if (media.currentTime >= Number(endS)) {
            media.pause()
            media.removeEventListener('timeupdate', handler)
            media._cdRangePauseHandler = null
          }
        }
        media._cdRangePauseHandler = handler
        media.addEventListener('timeupdate', handler)
      }
    },
  }), [])

  useEffect(() => {
    const media = mediaRef.current
    if (!media || words.length === 0) return

    const onTimeUpdate = () => {
      const currentMs = media.currentTime * 1000
      let idx = -1
      for (let i = 0; i < words.length; i += 1) {
        const word = words[i]
        const startMs = word.start_ms ?? 0
        const nextWord = words[i + 1]
        const endMs = word.end_ms ?? (nextWord?.start_ms ?? (startMs + 500))
        if (startMs <= currentMs && currentMs < endMs) {
          idx = i
          break
        }
        if (startMs > currentMs) break
      }
      setCurrentWordIdx(idx)
    }

    media.addEventListener('timeupdate', onTimeUpdate)
    return () => media.removeEventListener('timeupdate', onTimeUpdate)
  }, [words])

  useEffect(() => {
    if (activeWordRef.current && transcriptContainerRef.current) {
      const container = transcriptContainerRef.current
      const activeWord = activeWordRef.current
      const containerRect = container.getBoundingClientRect()
      const wordRect = activeWord.getBoundingClientRect()
      if (wordRect.top < containerRect.top || wordRect.bottom > containerRect.bottom) {
        activeWord.scrollIntoView({ block: 'center', behavior: 'smooth' })
      }
    }
  }, [currentWordIdx])

  function jumpToWord(word) {
    const media = mediaRef.current
    if (!media || word.start_ms == null) return
    media.currentTime = word.start_ms / 1000
    media.play().catch(() => {})
  }

  return (
    <div className="space-y-4">
      {mode === 'video' ? (
        <video
          ref={mediaRef}
          src={src}
          controls
          playsInline
          preload="metadata"
          className="w-full rounded-md bg-black"
        />
      ) : (
        <audio
          ref={mediaRef}
          src={src}
          controls
          preload="metadata"
          className="w-full"
        />
      )}

      <div>
        <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
          <h3>Transcript</h3>
          {words.length > 0 && (
            <p className="text-xs text-text-muted">Click a word to jump to that moment.</p>
          )}
        </div>

        {words.length > 0 ? (
          <div
            ref={transcriptContainerRef}
            className="bg-page/60 border border-border rounded-md p-4 max-h-56 overflow-y-auto text-sm leading-relaxed text-text-secondary"
          >
            {words.map((word, index) => {
              const isActive = index === currentWordIdx
              const className = [
                'cursor-pointer rounded px-1 py-0.5 transition-colors',
                isActive ? 'bg-accent text-white' : 'hover:bg-elevated hover:text-text-primary',
                word.is_filler ? 'text-warning italic' : '',
                isActive && word.is_filler ? 'bg-warning text-white' : '',
              ].join(' ')
              return (
                <span
                  key={`${word.word}-${index}`}
                  ref={isActive ? activeWordRef : null}
                  className={className}
                  onClick={() => jumpToWord(word)}
                >
                  {word.word}{' '}
                </span>
              )
            })}
          </div>
        ) : segments.length > 0 ? (
          <div className="space-y-3">
            {segments.map((segment, index) => (
              <div key={`${segment.timestamp}-${index}`} className="detail-stat">
                <p className="text-xs text-text-muted uppercase tracking-wider">
                  {formatDuration(segment.timestamp)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-text-secondary">
                  {segment.text}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="transcript-empty">
            Transcript was not available for this recording.
          </div>
        )}
      </div>
    </div>
  )
})

function UploadProcessingState({ id, statusInfo }) {
  const mode = getKindMode(statusInfo?.kind, id)
  const uploadPath = mode === 'audio' ? '/analyzer' : '/upload'
  const activeStep = statusInfo?.status === 'processing' ? 2 : 1

  return (
    <div>
      <ResultBreadcrumbs />
      <div className="result-state-card">
        <span className="badge badge-accent">
          {mode === 'audio' ? 'Audio Upload' : 'Video Upload'}
        </span>
        <h2 className="mt-4 mb-2">Analyzing your recording...</h2>
        <p className="text-text-secondary">
          We are extracting speech, measuring confidence signals, and preparing feedback.
        </p>

        <div className="result-process-steps">
          {[
            'Extracting speech',
            'Measuring confidence signals',
            'Preparing feedback',
          ].map((label, index) => {
            const stepNumber = index + 1
            const stateClass = stepNumber < activeStep
              ? 'is-complete'
              : stepNumber === activeStep
                ? 'is-active'
                : ''
            return (
              <div key={label} className={`result-process-step ${stateClass}`.trim()}>
                <span className="badge badge-muted">{stepNumber}</span>
                <span className="text-sm text-text-primary">{label}</span>
              </div>
            )
          })}
        </div>

        <div className="mt-6 flex justify-center gap-3 flex-wrap">
          <Link to="/library" className="btn btn-secondary">Back to Library</Link>
          <Link to={uploadPath} className="btn btn-ghost">Upload Another</Link>
        </div>
      </div>
    </div>
  )
}

function UploadFailureState({ id, kind, reason }) {
  const mode = getKindMode(kind, id)
  const uploadPath = mode === 'audio' ? '/analyzer' : '/upload'

  return (
    <div>
      <ResultBreadcrumbs />
      <div className="result-state-card">
        <span className="badge badge-danger">Failed Analysis</span>
        <h2 className="mt-4 mb-2">We could not finish this recording</h2>
        <p className="text-text-secondary max-w-2xl mx-auto">
          {reason || 'The upload did not produce a usable analysis result.'}
        </p>

        <div className="mt-6 flex justify-center gap-3 flex-wrap">
          <Link to={uploadPath} className="btn btn-primary">Retry Upload</Link>
          <Link to={uploadPath} className="btn btn-secondary">
            {mode === 'audio' ? 'Back to Audio Upload' : 'Back to Upload'}
          </Link>
          <Link to="/library" className="btn btn-ghost">Back to Library</Link>
        </div>
      </div>
    </div>
  )
}

function UnscoreableUploadState({ data, mode, title, uploadPath, practicePath }) {
  const fixes = [
    'Make sure your voice is clear and easy to hear.',
    'Record at least 20-30 seconds of real speech.',
  ]
  if (mode === 'video') {
    fixes.push('Keep your face visible and centered in the frame.')
  }

  return (
    <div className="result-state-card mb-6">
      <span className="badge badge-warning">
        {mode === 'audio' ? 'Audio Upload' : 'Video Upload'}
      </span>
      <h2 className="mt-4 mb-2">{title}</h2>
      <p className="text-text-secondary max-w-2xl mx-auto">
        {data.status_message || 'We did not have enough usable signal to produce a reliable score for this recording.'}
      </p>

      <div className="result-summary-grid mt-6">
        <div className="coaching-card text-left">
          <p className="text-xs uppercase tracking-wider text-text-muted">What happened</p>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            The analysis could not produce a reliable score, so the coaching summary is withheld instead of showing a misleading number.
          </p>
        </div>
        <div className="coaching-card text-left">
          <p className="text-xs uppercase tracking-wider text-text-muted">Try another recording</p>
          <p className="mt-3 text-sm leading-relaxed text-text-secondary">
            A slightly longer answer with clearer audio usually gives the scorer enough signal to work with.
          </p>
        </div>
        <div className="coaching-card text-left">
          <p className="text-xs uppercase tracking-wider text-text-muted">Fix before the next try</p>
          <ul className="mt-3 space-y-2 text-sm text-text-secondary">
            {fixes.map((fix) => (
              <li key={fix}>{fix}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-6 flex justify-center gap-3 flex-wrap">
        <Link to={uploadPath} className="btn btn-primary">Try Another Recording</Link>
        <Link to={practicePath} className="btn btn-secondary">Practice Live</Link>
        <Link to="/library" className="btn btn-ghost">Back to Library</Link>
      </div>
    </div>
  )
}

function CoachingCard({ title, metric, body }) {
  return (
    <div className="coaching-card">
      <p className="text-xs uppercase tracking-wider text-text-muted">{title}</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-display font-bold text-text-primary">
            {metric.label}
          </p>
          <p className="text-sm text-text-muted">{getScoreLabel(metric.score)}</p>
        </div>
        <span className={getScoreBadgeClass(metric.score)}>
          {safeRound(metric.score)}
        </span>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-text-secondary">
        {body}
      </p>
    </div>
  )
}

function ResultFooterActions({ mode, uploadPath, practicePath, isOwner, onOpenShare }) {
  return (
    <div className="result-footer-actions">
      <div>
        <h3>What Next</h3>
        <p className="mt-1 text-sm text-text-secondary">
          The fastest way to improve is to run another take with one clear focus.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link to={uploadPath} className="btn btn-primary">Upload Another</Link>
        <Link to={practicePath} className="btn btn-secondary">
          {mode === 'audio' ? 'Practice Live Mic' : 'Practice Live'}
        </Link>
        <Link to="/library" className="btn btn-secondary">Back to Library</Link>
        {isOwner && (
          <button type="button" onClick={onOpenShare} className="btn btn-ghost">
            Share
          </button>
        )}
      </div>
    </div>
  )
}

function DangerZone({ discardBusy, onDiscard }) {
  return (
    <div className="danger-zone">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3>Danger Zone</h3>
          <p className="mt-1 text-sm text-text-secondary">
            Remove this recording if you do not want it kept in your library.
          </p>
        </div>
        <button
          type="button"
          onClick={onDiscard}
          disabled={discardBusy}
          className="btn btn-danger"
        >
          {discardBusy ? 'Discarding...' : 'Delete / Discard'}
        </button>
      </div>
    </div>
  )
}

function ResultBreadcrumbs() {
  return (
    <p className="text-sm text-text-muted mb-6">
      <Link to="/" className="hover:text-text-accent transition-colors">Home</Link>
      {' / '}
      <Link to="/library" className="hover:text-text-accent transition-colors">Library</Link>
      {' / '}
      <span className="text-text-secondary">Result</span>
    </p>
  )
}

function getUploadMode(data) {
  if (data.kind === 'analyzer_audio' || data.recording?.audio_url) return 'audio'
  return 'video'
}

function getKindMode(kind, fallbackId = '') {
  if (kind === 'analyzer_audio' || String(fallbackId).startsWith('analyzer_')) return 'audio'
  return 'video'
}

function getHeadlineScore(data, mode) {
  return mode === 'audio' ? data.avg_score : data.overall_confidence
}

function getUploadTitle(data, mode) {
  return (
    data.title ||
    data.topic ||
    data.filename ||
    (mode === 'audio' ? 'Audio analysis' : 'Video analysis')
  )
}

function getUploadSubtitle(data) {
  if (data.topic && data.title && data.topic !== data.title) return data.topic
  return null
}

function getSignalBarScores(data, mode) {
  if (mode === 'audio') {
    const averages = data.signal_averages || {}
    return {
      voiceSteadiness: averages.voice_steadiness,
      eyeContact: averages.eye_contact,
      speechPace: averages.speech_pace,
      fillerWords: averages.filler_words,
      vocalVariety: averages.vocal_variety,
      expression: averages.expression,
    }
  }
  return data.sub_scores || null
}

function getSignalAverages(data, mode) {
  if (mode === 'audio') return data.signal_averages || null
  if (!data.sub_scores) return null
  return {
    voice_steadiness: data.sub_scores.voiceSteadiness,
    eye_contact: data.sub_scores.eyeContact,
    speech_pace: data.sub_scores.speechPace,
    filler_words: data.sub_scores.fillerWords,
    vocal_variety: data.sub_scores.vocalVariety,
    expression: data.sub_scores.expression,
  }
}

function getSignalReasons(data, mode) {
  if (mode === 'audio') return data.signal_reasons || {}
  return data.signal_reasons || {}
}

function getTranscriptContent(data, mode) {
  if (mode === 'audio') {
    if (Array.isArray(data.speech_timeline) && data.speech_timeline.length > 0) {
      const words = data.speech_timeline.flatMap((segment) => segment.words || [])
      if (words.length > 0) {
        return { words, segments: [] }
      }
    }
    return {
      words: Array.isArray(data.transcript) ? data.transcript : [],
      segments: [],
    }
  }

  const speechTimeline = Array.isArray(data.speech_timeline) ? data.speech_timeline : []
  const words = speechTimeline.flatMap((segment) => segment.words || [])
  const segments = speechTimeline
    .filter((segment) => segment.text)
    .map((segment) => ({
      timestamp: Number(segment.timestamp) || 0,
      text: segment.text,
    }))

  return { words, segments }
}

function getCoachingMetrics(data, mode) {
  const metrics = []
  const signalBars = getSignalBarScores(data, mode) || {}

  if (mode === 'video' && isNumber(data.face_confidence)) {
    metrics.push({ key: 'face', label: 'Camera confidence', score: Number(data.face_confidence) })
  }

  if (isNumber(signalBars.voiceSteadiness)) {
    metrics.push({ key: 'voice', label: 'Vocal confidence', score: Number(signalBars.voiceSteadiness) })
  }

  if (isNumber(signalBars.speechPace)) {
    metrics.push({ key: 'pace', label: 'Pacing', score: Number(signalBars.speechPace) })
  }

  if (isNumber(signalBars.fillerWords)) {
    metrics.push({ key: 'fillers', label: 'Filler control', score: Number(signalBars.fillerWords) })
  }

  return metrics
}

function buildActionItems(data, mode, weakestMetric) {
  const items = []
  const seeded = [
    ...(Array.isArray(data.improvements) ? data.improvements : []),
    ...(Array.isArray(data.action_items) ? data.action_items : []),
  ]
  const nextSession = data.coaching?.next_session
  if (typeof nextSession === 'string' && nextSession.trim()) {
    seeded.push(nextSession.trim())
  }

  seeded.forEach((item) => {
    const cleaned = String(item || '').trim()
    if (cleaned && !items.includes(cleaned)) {
      items.push(cleaned)
    }
  })

  const paceWpm = data.pace?.avg_wpm ?? data.speech_summary?.average_wpm
  const totalFillers = data.total_fillers ?? data.speech_summary?.total_fillers ?? 0
  const vocalVariety = data.signal_averages?.vocal_variety ?? data.sub_scores?.vocalVariety

  if (items.length < 3 && weakestMetric?.key === 'pace') {
    if (isNumber(paceWpm) && paceWpm > 160) {
      pushUnique(items, 'Slow down slightly during longer answers.')
    } else if (isNumber(paceWpm) && paceWpm < 130) {
      pushUnique(items, 'Add a little more pace so the answer keeps moving.')
    } else {
      pushUnique(items, 'Keep your pace steady from the start of the answer to the end.')
    }
  }

  if (items.length < 3 && (weakestMetric?.key === 'fillers' || totalFillers > 0)) {
    pushUnique(items, 'Pause before the next sentence instead of filling the gap with filler words.')
  }

  if (items.length < 3 && mode === 'video' && (data.no_face_detected || (isNumber(data.face_confidence) && data.face_confidence < 60))) {
    pushUnique(items, 'Keep your face centered and well lit so the camera can read your expression.')
  }

  if (items.length < 3 && weakestMetric?.key === 'voice') {
    pushUnique(items, 'Start key answers with a calmer breath and a firmer first sentence.')
  }

  if (items.length < 3 && isNumber(vocalVariety) && vocalVariety < 50) {
    pushUnique(items, 'Add more pitch changes to highlight the most important words.')
  }

  if (items.length < 2) {
    pushUnique(items, 'Record one more take while focusing on a single improvement only.')
  }
  if (items.length < 2) {
    pushUnique(items, 'Try a slightly different framing or angle on your next attempt.')
  }

  return items.slice(0, 3)
}

function buildNextFocusCard(data, mode, weakestMetric, firstAction) {
  if (firstAction) {
    return {
      metric: weakestMetric || { label: mode === 'audio' ? 'Next take' : 'Next take', score: getHeadlineScore(data, mode) || 0 },
      body: firstAction,
    }
  }

  if (weakestMetric) {
    return {
      metric: weakestMetric,
      body: getMetricNarrative(weakestMetric, data, mode, 'next'),
    }
  }

  return null
}

function buildDetailStats(data, mode) {
  const stats = []
  const duration = getDurationSeconds(data, mode)
  if (isNumber(duration)) {
    stats.push({ label: 'Duration', value: formatDuration(duration) })
  }

  if (mode === 'audio') {
    if (isNumber(data.pace?.avg_wpm)) {
      stats.push({ label: 'Average pace', value: `${safeRound(data.pace.avg_wpm)} WPM` })
    }
    if (isNumber(data.total_fillers)) {
      stats.push({
        label: 'Fillers',
        value: safeRound(data.total_fillers),
        valueClass: data.total_fillers > 6 ? 'text-warning' : 'text-text-primary',
      })
    }
    if (Array.isArray(data.transcript)) {
      stats.push({ label: 'Transcript words', value: data.transcript.length })
    }
    if (data.signal_reasons?.voice_steadiness) {
      stats.push({
        label: 'Voice signal',
        value: 'Ready',
        note: data.signal_reasons.voice_steadiness,
      })
    }
    return stats
  }

  const speechSummary = data.speech_summary || {}
  if (isNumber(speechSummary.total_words)) {
    stats.push({ label: 'Total words', value: speechSummary.total_words })
  }
  if (isNumber(speechSummary.average_wpm)) {
    stats.push({ label: 'Average pace', value: `${safeRound(speechSummary.average_wpm)} WPM` })
  }
  if (isNumber(speechSummary.total_fillers)) {
    stats.push({
      label: 'Fillers',
      value: safeRound(speechSummary.total_fillers),
      valueClass: speechSummary.total_fillers > 6 ? 'text-warning' : 'text-text-primary',
    })
  }
  if (isNumber(data.face_confidence)) {
    stats.push({ label: 'Face confidence', value: safeRound(data.face_confidence) })
  }
  const blinkRate = data.signal_averages?.blink_rate
  if (isNumber(blinkRate)) {
    stats.push({
      label: 'Blink rate',
      value: `${safeRound(blinkRate)} / min`,
      note: 'Insight (not scored)',
    })
  }
  const tension = data.signal_averages?.tension_score
  if (isNumber(tension)) {
    stats.push({
      label: 'Facial tension',
      value: `${safeRound(tension)} / 100`,
      valueClass: tension > 60 ? 'text-warning' : 'text-text-primary',
      note: 'Insight (not scored)',
    })
  }
  return stats
}

function buildUploadNotices(data, mode) {
  const notices = []

  if (mode === 'video' && data.no_face_detected) {
    notices.push({
      text: 'Face-based coaching was unavailable for this upload, so the summary focuses on speech and pacing.',
      className: 'border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] text-warning',
    })
  }
  if (data.multi_face_warning || (mode === 'video' && isNumber(data.looked_away_pct) && data.looked_away_pct >= 10)) {
    const parts = []
    if (data.multi_face_warning) parts.push(data.multi_face_warning)
    if (mode === 'video' && isNumber(data.looked_away_pct) && data.looked_away_pct >= 10) {
      parts.push(`Face was turned away ${data.looked_away_pct}% of the time.`)
    }
    notices.push({
      text: parts.join(' '),
      className: 'border-[rgba(245,158,11,0.3)] bg-[rgba(245,158,11,0.08)] text-warning',
    })
  }
  if (data.audio_extraction_error) {
    notices.push({
      text: `Audio extraction issue: ${data.audio_extraction_error}`,
      className: 'border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-danger',
    })
  }
  if (data.video_encode_error) {
    notices.push({
      text: `Video processing issue: ${data.video_encode_error}`,
      className: 'border-[rgba(239,68,68,0.3)] bg-[rgba(239,68,68,0.08)] text-danger',
    })
  }

  return notices
}

function buildHeroSummary(score, strongestMetric, weakestMetric) {
  if (!strongestMetric || !weakestMetric || !isNumber(score)) {
    return 'Your upload has been analyzed. Start with the coaching summary, then replay the recording lower on the page.'
  }

  if (score >= 80) {
    return `${strongestMetric.label} stood out here. Keep that strength, and tighten ${weakestMetric.label.toLowerCase()} on the next take.`
  }
  if (score >= 60) {
    return `This is a solid foundation. ${strongestMetric.label} is helping you, while ${weakestMetric.label.toLowerCase()} is the clearest next lift.`
  }
  return `The foundation is there, but this take still feels tentative. Focus on ${weakestMetric.label.toLowerCase()} first, then record again.`
}

function getMetricNarrative(metric, data, mode, tone) {
  const paceWpm = data.pace?.avg_wpm ?? data.speech_summary?.average_wpm
  const totalFillers = data.total_fillers ?? data.speech_summary?.total_fillers ?? 0

  switch (metric.key) {
    case 'face':
      if (tone === 'strong') return 'Your face stayed readable and engaged across most of the clip.'
      if (tone === 'next') return 'Keep your face centered and well lit so the camera can keep reading your reactions.'
      return 'Your on-camera presence dropped in parts of the answer. Keep your face centered and visible.'
    case 'voice':
      if (tone === 'strong') return 'Your voice sounded steady and controlled, which helps the whole answer feel more confident.'
      if (tone === 'next') return 'Reset your breathing before longer answers so your voice stays steady all the way through.'
      return 'Your voice lost some steadiness. A calmer first breath will make the delivery sound more settled.'
    case 'pace':
      if (tone === 'strong') {
        return isNumber(paceWpm)
          ? `Your pacing stayed close to target at about ${safeRound(paceWpm)} words per minute.`
          : 'Your pacing stayed close to the target range.'
      }
      if (tone === 'next') {
        return isNumber(paceWpm) && paceWpm > 160
          ? 'Slow down slightly during longer answers so the message has more space to land.'
          : 'Keep your pace steadier from the start of the answer to the end.'
      }
      return isNumber(paceWpm) && paceWpm > 160
        ? `You ran fast at roughly ${safeRound(paceWpm)} words per minute. Slow down slightly to sound more deliberate.`
        : 'Your pace drifted away from the target range. Keep the answer moving, but do not rush the transitions.'
    case 'fillers':
      if (tone === 'strong') {
        return totalFillers > 0
          ? `You kept fillers relatively contained, which helps the answer sound cleaner.`
          : 'You kept filler words out of the way, so the answer sounded clean and direct.'
      }
      if (tone === 'next') return 'Pause before the next sentence instead of filling the gap with a sound or filler phrase.'
      return totalFillers > 0
        ? `Fillers interrupted the flow of the answer. Replace them with a short pause before the next sentence.`
        : 'This is the easiest area to tighten on the next take. Aim for cleaner transitions between ideas.'
    default:
      return 'Use this as the next focus for your next recording.'
  }
}

function getScoreLabel(score) {
  if (!isNumber(score)) return 'Score unavailable'
  if (score >= 85) return 'Highly confident'
  if (score >= 70) return 'Confident'
  if (score >= 55) return 'Developing'
  return 'Needs another pass'
}

function getGrade(score) {
  if (!isNumber(score)) return '-'
  if (score >= 85) return 'A'
  if (score >= 70) return 'B'
  if (score >= 55) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function getScoreBadgeClass(score) {
  if (!isNumber(score)) return 'badge badge-muted'
  if (score >= 75) return 'badge badge-success'
  if (score >= 50) return 'badge badge-warning'
  return 'badge badge-danger'
}

function getDurationSeconds(data, mode) {
  if (mode === 'audio') return data.duration_s_current ?? data.duration_s
  return data.duration_s_current ?? data.duration
}

function formatDuration(seconds) {
  if (!isNumber(seconds)) return '-'
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const secs = totalSeconds % 60
  return `${minutes}:${String(secs).padStart(2, '0')}`
}

function isNumber(value) {
  return typeof value === 'number' && !Number.isNaN(value)
}

function safeRound(value) {
  return isNumber(value) ? Math.round(value) : '-'
}

function pushUnique(items, value) {
  if (value && !items.includes(value)) {
    items.push(value)
  }
}
