import { useEffect, useRef, useState } from 'react'
import { API_BASE, apiFetch } from '../config'
import { useAuth } from '../auth/AuthContext'
import { parseTimeStr, fmtSecs } from '../utils/timeStr'

export default function CommentsThread({
  mediaId, isMediaOwner = false, playerRef = null,
}) {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [posting, setPosting] = useState(false)
  const [composerError, setComposerError] = useState(null)
  const [actionError, setActionError] = useState(null)

  const [draft, setDraft] = useState('')
  const [draftStartText, setDraftStartText] = useState('')
  const [draftEndText, setDraftEndText] = useState('')

  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')

  const scrollRef = useRef(null)
  const playerAvailable = Boolean(playerRef)

  const [playerTime, setPlayerTime] = useState(null)
  useEffect(() => {
    if (!playerRef) return
    const id = setInterval(() => {
      const t = playerRef.current?.getCurrentTime?.()
      setPlayerTime(typeof t === 'number' ? t : null)
    }, 250)
    return () => clearInterval(id)
  }, [playerRef])

  async function load() {
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${mediaId}/comments`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setComments(Array.isArray(data) ? data : [])
      setError(null)
    } catch (e) {
      setError(e.message || 'Failed to load comments')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [mediaId])

  function readPlaybackTime() {
    const t = playerRef?.current?.getCurrentTime?.()
    if (typeof t !== 'number' || Number.isNaN(t)) {
      setComposerError("Playback isn't ready yet. Click the player or press play first so the browser knows where you are.")
      return null
    }
    return Math.max(0, t)
  }
  function captureStart() {
    const t = readPlaybackTime()
    if (t !== null) setDraftStartText(fmtSecs(t))
  }
  function captureEnd() {
    const t = readPlaybackTime()
    if (t !== null) setDraftEndText(fmtSecs(t))
  }
  function clearAnchor() {
    setDraftStartText('')
    setDraftEndText('')
  }

  async function postComment(e) {
    e?.preventDefault()
    setComposerError(null)
    const body = draft.trim()
    if (!body) return

    const startTrim = draftStartText.trim()
    const endTrim = draftEndText.trim()
    const startSec = startTrim ? parseTimeStr(startTrim) : null
    const endSec = endTrim ? parseTimeStr(endTrim) : null
    if (startTrim && startSec === null) {
      setComposerError(`Start time "${startTrim}" isn't valid. Use MM:SS (e.g. 1:23) or seconds (e.g. 83.5).`)
      return
    }
    if (endTrim && endSec === null) {
      setComposerError(`End time "${endTrim}" isn't valid. Use MM:SS (e.g. 1:23) or seconds (e.g. 83.5).`)
      return
    }
    if (endSec != null && startSec == null) {
      setComposerError('End time set without a start time. Add a start first or clear the end.')
      return
    }
    if (endSec != null && startSec != null && endSec <= startSec) {
      setComposerError('End time must be greater than start time.')
      return
    }

    setPosting(true)
    try {
      const payload = { body }
      if (startSec != null) payload.t_s = startSec
      if (endSec != null) payload.t_end_s = endSec
      const res = await apiFetch(`${API_BASE}/api/media/${mediaId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const created = await res.json()
      setComments((prev) => [...prev, created])
      setDraft('')
      clearAnchor()
      setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50)
    } catch (e) {
      setComposerError(`Could not post: ${e.message}`)
    } finally {
      setPosting(false)
    }
  }

  async function saveEdit(commentId) {
    setActionError(null)
    const body = editDraft.trim()
    if (!body) return
    try {
      const res = await apiFetch(`${API_BASE}/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const updated = await res.json()
      setComments((prev) => prev.map((c) => (c.id === commentId ? updated : c)))
      setEditingId(null)
      setEditDraft('')
    } catch (e) {
      setActionError(`Could not save: ${e.message}`)
    }
  }

  async function deleteComment(commentId) {
    if (!window.confirm('Delete this comment?')) return
    setActionError(null)
    try {
      const res = await apiFetch(`${API_BASE}/api/comments/${commentId}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      setComments((prev) => prev.filter((c) => c.id !== commentId))
    } catch (e) {
      setActionError(`Could not delete: ${e.message}`)
    }
  }

  function playComment(c) {
    if (c.t_s == null) return
    const player = playerRef?.current
    if (player?.seekAndPlay) {
      player.seekAndPlay(c.t_s, c.t_end_s)
    }
  }

  return (
    <div className="glass-card p-4 mt-6">
      <h3 className="mb-3">
        Comments {comments.length > 0 && (
          <span className="text-text-muted text-sm font-normal">({comments.length})</span>
        )}
      </h3>

      {loading && (
        <div className="text-text-muted text-sm">Loading…</div>
      )}
      {error && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-3 py-2 mb-3">
          {error}
        </div>
      )}
      {actionError && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-3 py-2 mb-3">
          {actionError}
        </div>
      )}

      {!loading && comments.length === 0 && (
        <div className="text-text-muted text-sm mb-3">
          No comments yet. Use the buttons below to anchor your feedback to a moment or a range — coach-style &quot;from 1:23 to 1:45 your eye contact dropped, try X&quot; works great here.
        </div>
      )}

      <div className="flex flex-col gap-3">
        {comments.map((c) => {
          const isAuthor = user && c.author && c.author.id === user.id
          const canDelete = isAuthor || isMediaOwner
          const isEditing = editingId === c.id
          const hasRange = c.t_s != null && c.t_end_s != null
          const hasMoment = c.t_s != null && c.t_end_s == null
          return (
            <div key={c.id} className="bg-page/60 border border-border rounded-md p-3">
              <div className="flex justify-between items-baseline">
                <div className="text-sm">
                  <strong className="text-text-primary">{c.author?.name || 'Unknown'}</strong>
                  <span className="text-text-muted ml-2">
                    {fmtTime(c.created_at)}
                    {c.edited && <span className="ml-1 italic">(edited)</span>}
                  </span>
                </div>
                {(isAuthor || canDelete) && !isEditing && (
                  <div className="flex gap-1">
                    {isAuthor && (
                      <button
                        type="button"
                        onClick={() => { setEditingId(c.id); setEditDraft(c.body) }}
                        className="text-text-accent text-xs px-2 hover:underline"
                        title="Edit"
                      >
                        edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => deleteComment(c.id)}
                        className="text-danger text-xs px-2 hover:underline"
                        title="Delete"
                      >
                        delete
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isEditing ? (
                <div className="mt-2">
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    maxLength={5000}
                    className="input"
                  />
                  <div className="flex gap-2 mt-2">
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => saveEdit(c.id)}>
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setEditDraft('') }}
                      className="btn btn-secondary btn-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">
                  {c.body}
                </div>
              )}
              {(hasMoment || hasRange) && !isEditing && (
                <button
                  type="button"
                  onClick={() => playComment(c)}
                  disabled={!playerAvailable}
                  className={`mt-2 badge ${hasRange ? 'badge-accent' : 'badge-muted'} ${playerAvailable ? 'cursor-pointer hover:badge-accent' : 'opacity-50 cursor-not-allowed'}`}
                  title={
                    playerAvailable
                      ? (hasRange
                          ? `Play from ${fmtSecs(c.t_s)} to ${fmtSecs(c.t_end_s)} (auto-pause)`
                          : `Jump to ${fmtSecs(c.t_s)}`)
                      : 'Playback not available on this report'
                  }
                >
                  {hasRange
                    ? `▶ ${fmtSecs(c.t_s)} → ${fmtSecs(c.t_end_s)} (${fmtSecs(c.t_end_s - c.t_s)})`
                    : `▶ ${fmtSecs(c.t_s)}`}
                </button>
              )}
            </div>
          )
        })}
        <div ref={scrollRef} />
      </div>

      {/* Composer */}
      <form onSubmit={postComment} className="mt-4">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          maxLength={5000}
          disabled={posting}
          className="input"
        />

        <div className="mt-3 p-3 bg-page/60 border border-border rounded-md text-sm">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-text-muted font-semibold">Anchor</span>
            {playerAvailable ? (
              <span className="text-text-muted text-xs font-mono" title="Current playback position">
                (player @ {playerTime != null ? fmtSecs(playerTime) : '—'})
              </span>
            ) : (
              <span className="text-text-muted text-xs italic">
                (no playback element — type a value below)
              </span>
            )}
          </div>

          {['Start', 'End'].map((which) => {
            const isStart = which === 'Start'
            const value = isStart ? draftStartText : draftEndText
            const setValue = isStart ? setDraftStartText : setDraftEndText
            const capture = isStart ? captureStart : captureEnd
            return (
              <div key={which} className="flex items-center gap-2 mb-1.5 flex-wrap">
                <label className="w-12 text-text-muted text-xs">{which}</label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0:00 or 23.5"
                  disabled={posting}
                  className="input font-mono"
                  style={{ width: 110 }}
                />
                <button
                  type="button"
                  onClick={capture}
                  disabled={!playerAvailable || posting}
                  className="btn btn-secondary btn-sm disabled:opacity-50"
                  title={
                    playerAvailable
                      ? 'Fill with the current playback time'
                      : 'No playback element on this report'
                  }
                >
                  ⌖ Use current{playerTime != null ? ` (${fmtSecs(playerTime)})` : ''}
                </button>
              </div>
            )
          })}

          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {(draftStartText || draftEndText) && (
              <button
                type="button"
                onClick={clearAnchor}
                disabled={posting}
                className="text-text-muted text-xs hover:underline px-2"
                title="Remove both time anchors"
              >
                clear anchor
              </button>
            )}
            <span className="text-text-muted text-xs flex-1">
              Leave both empty for a general comment. Set Start only for a single moment. Set both for a range.
            </span>
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={posting || !draft.trim()}
            >
              {posting ? 'Posting…' : 'Post comment'}
            </button>
          </div>

          {composerError && (
            <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-xs rounded-md px-3 py-2 mt-2">
              {composerError}
            </div>
          )}
        </div>
      </form>
    </div>
  )
}

function fmtTime(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
