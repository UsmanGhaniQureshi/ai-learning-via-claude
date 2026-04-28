import { useEffect, useRef, useState } from 'react'
import { API_BASE, apiFetch } from '../config'
import { useAuth } from '../auth/AuthContext'
import { parseTimeStr, fmtSecs } from '../utils/timeStr'

/**
 * CommentsThread — list + post + edit + delete comments on a Media,
 * with optional time-anchored ranges for coach-style "from X to Y"
 * feedback.
 *
 * A comment can be:
 *   - General        : no anchor
 *   - Single moment  : t_s only         → "▶ 1:23" button, click seeks
 *   - Ranged         : t_s + t_end_s    → "▶ 1:23 → 1:45 (22s)" button,
 *                      click seeks to start AND auto-pauses at end
 *
 * Props:
 *   mediaId            the media this thread belongs to
 *   isMediaOwner       boolean — owner can delete any comment
 *   playerRef          ref to a player object exposing
 *                      { getCurrentTime(), seekAndPlay(start, end?) }.
 *                      Without this the composer's anchor buttons and
 *                      the comment "play" buttons render disabled.
 */
export default function CommentsThread({
  mediaId, isMediaOwner = false, playerRef = null,
}) {
  const { user } = useAuth()
  const [comments, setComments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [posting, setPosting] = useState(false)

  // Composer state
  const [draft, setDraft] = useState('')
  // Text-backed time inputs. The user can type "1:23" or "83" or
  // "83.5"; we parse on submit. Storing the raw string (rather than
  // a parsed number) lets the user type partial values like "1:" mid-
  // edit without the input snapping back. Empty string = no anchor.
  const [draftStartText, setDraftStartText] = useState('')
  const [draftEndText, setDraftEndText] = useState('')

  // Edit-in-place state
  const [editingId, setEditingId] = useState(null)
  const [editDraft, setEditDraft] = useState('')

  const scrollRef = useRef(null)
  // Whether THIS report has a player at all. We can't gate on
  // `playerRef.current` because refs aren't reactive — React doesn't
  // re-render when a ref populates, so the buttons would stay
  // disabled even after the video/audio element mounted. Instead we
  // only check that the parent passed in a ref *object* (it does so
  // for every report kind that has playable media). At click time we
  // validate the live ref and surface a friendly fallback if it's
  // somehow null.
  const playerAvailable = Boolean(playerRef)

  // Live "Player at MM:SS" readout. Polls every 250 ms — cheap, and
  // gives the user IMMEDIATE confirmation that the player is wired
  // up. Without this, clicking "Set start" feels like a no-op when
  // the captured time happens to be 0:00 (a fresh page load with
  // playback paused at the start).
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

  // ── Composer helpers ─────────────────────────────────────────────
  // "Use current" capture — fills the input with the live player
  // time. The user can then edit the value before posting if they
  // want a slightly different anchor.
  function readPlaybackTime() {
    const t = playerRef?.current?.getCurrentTime?.()
    if (typeof t !== 'number' || Number.isNaN(t)) {
      alert(
        "Playback isn't ready yet. Click the video or audio player " +
        "first (or press play) so the browser knows where you are."
      )
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
    const body = draft.trim()
    if (!body) return

    // Parse the text inputs into numeric seconds. Empty = no anchor;
    // non-empty + unparseable = abort with a clear error so the user
    // sees what went wrong rather than the form silently dropping the
    // anchor on submit.
    const startTrim = draftStartText.trim()
    const endTrim = draftEndText.trim()
    const startSec = startTrim ? parseTimeStr(startTrim) : null
    const endSec = endTrim ? parseTimeStr(endTrim) : null
    if (startTrim && startSec === null) {
      alert(`Start time "${startTrim}" isn't valid. Use MM:SS (e.g. 1:23) or seconds (e.g. 83.5).`)
      return
    }
    if (endTrim && endSec === null) {
      alert(`End time "${endTrim}" isn't valid. Use MM:SS (e.g. 1:23) or seconds (e.g. 83.5).`)
      return
    }
    if (endSec != null && startSec == null) {
      alert('End time set without a start time. Add a start first or clear the end.')
      return
    }
    if (endSec != null && startSec != null && endSec <= startSec) {
      alert('End time must be greater than start time.')
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
      alert(`Could not post: ${e.message}`)
    } finally {
      setPosting(false)
    }
  }

  async function saveEdit(commentId) {
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
      alert(`Could not save: ${e.message}`)
    }
  }

  async function deleteComment(commentId) {
    if (!window.confirm('Delete this comment?')) return
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
      alert(`Could not delete: ${e.message}`)
    }
  }

  // Click handler for a comment's "play" button.
  function playComment(c) {
    if (c.t_s == null) return
    const player = playerRef?.current
    if (player?.seekAndPlay) {
      player.seekAndPlay(c.t_s, c.t_end_s)
    }
  }

  return (
    <div
      style={{
        background: '#161620',
        border: '1px solid #2a2a35',
        borderRadius: 8,
        padding: 14,
        marginTop: 16,
      }}
    >
      <h3 style={{ margin: '0 0 10px 0' }}>
        Comments {comments.length > 0 && (
          <span style={{ opacity: 0.6, fontSize: '0.8em', fontWeight: 400 }}>
            ({comments.length})
          </span>
        )}
      </h3>

      {loading && (
        <div style={{ opacity: 0.6, fontSize: '0.85em' }}>Loading…</div>
      )}
      {error && (
        <div className="session-error" style={{ marginBottom: 10 }}>
          {error}
        </div>
      )}

      {!loading && comments.length === 0 && (
        <div style={{ opacity: 0.6, fontSize: '0.9em', marginBottom: 10 }}>
          No comments yet. Use the buttons below to anchor your feedback
          to a moment or a range — coach-style "from 1:23 to 1:45 your
          eye contact dropped, try X" works great here.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {comments.map((c) => {
          const isAuthor = user && c.author && c.author.id === user.id
          const canDelete = isAuthor || isMediaOwner
          const isEditing = editingId === c.id
          const hasRange = c.t_s != null && c.t_end_s != null
          const hasMoment = c.t_s != null && c.t_end_s == null
          return (
            <div
              key={c.id}
              style={{
                background: '#1c1c24',
                border: '1px solid #2a2a35',
                borderRadius: 6,
                padding: 10,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <div style={{ fontSize: '0.88em' }}>
                  <strong>{c.author?.name || 'Unknown'}</strong>
                  <span style={{ opacity: 0.55, marginLeft: 8 }}>
                    {fmtTime(c.created_at)}
                    {c.edited && <span style={{ marginLeft: 4, fontStyle: 'italic' }}>(edited)</span>}
                  </span>
                </div>
                {(isAuthor || canDelete) && !isEditing && (
                  <div style={{ display: 'flex', gap: 4 }}>
                    {isAuthor && (
                      <button
                        type="button"
                        onClick={() => { setEditingId(c.id); setEditDraft(c.body) }}
                        style={iconBtnStyle}
                        title="Edit"
                      >
                        edit
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => deleteComment(c.id)}
                        style={{ ...iconBtnStyle, color: '#ff7a7a' }}
                        title="Delete"
                      >
                        delete
                      </button>
                    )}
                  </div>
                )}
              </div>
              {isEditing ? (
                <div style={{ marginTop: 6 }}>
                  <textarea
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    rows={3}
                    maxLength={5000}
                    style={textareaStyle}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                    <button type="button" className="report-btn" onClick={() => saveEdit(c.id)}>
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEditingId(null); setEditDraft('') }}
                      style={{
                        background: 'transparent',
                        border: '1px solid #555',
                        color: '#ccc',
                        padding: '6px 12px',
                        borderRadius: 6,
                        cursor: 'pointer',
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', fontSize: '0.92rem', lineHeight: 1.45 }}>
                  {c.body}
                </div>
              )}
              {(hasMoment || hasRange) && !isEditing && (
                <button
                  type="button"
                  onClick={() => playComment(c)}
                  disabled={!playerAvailable}
                  style={{
                    marginTop: 6,
                    background: hasRange ? '#2a3850' : 'transparent',
                    border: '1px solid #2a3850',
                    color: '#8ab4f8',
                    padding: '3px 10px',
                    borderRadius: 12,
                    cursor: playerAvailable ? 'pointer' : 'default',
                    fontSize: '0.78em',
                  }}
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

      {/* New-comment composer */}
      <form onSubmit={postComment} style={{ marginTop: 14 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a comment…"
          rows={3}
          maxLength={5000}
          style={textareaStyle}
          disabled={posting}
        />

        {/* Anchor controls — TWO INPUT MODES in one composer:
              (a) Type a value: "1:23" (MM:SS) or "83" (seconds).
              (b) Click "Use current" to capture the live playback
                  time. The captured value goes INTO the input so
                  the user can still edit it before posting.
            Empty input = no anchor on that end. */}
        <div style={{
          marginTop: 10,
          padding: 10,
          background: '#0f0f18',
          border: '1px solid #2a2a35',
          borderRadius: 6,
          fontSize: '0.85em',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8,
            flexWrap: 'wrap',
          }}>
            <span style={{ opacity: 0.75, fontWeight: 600 }}>Anchor</span>
            {playerAvailable && (
              <span
                style={{
                  fontSize: '0.78em',
                  opacity: 0.6,
                  fontFamily: 'monospace',
                }}
                title="Current playback position. 'Use current' will fill this value."
              >
                (player @ {playerTime != null ? fmtSecs(playerTime) : '—'})
              </span>
            )}
            {!playerAvailable && (
              <span style={{ opacity: 0.55, fontStyle: 'italic' }}>
                (no playback element — type a value below)
              </span>
            )}
          </div>

          {/* Two input rows. Inputs are the source of truth; we
              parse on submit. type="text" (not number) so the user
              can type "1:23" without the browser stripping the colon. */}
          {['Start', 'End'].map((which) => {
            const isStart = which === 'Start'
            const value = isStart ? draftStartText : draftEndText
            const setValue = isStart ? setDraftStartText : setDraftEndText
            const capture = isStart ? captureStart : captureEnd
            return (
              <div
                key={which}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                  flexWrap: 'wrap',
                }}
              >
                <label style={{
                  width: 44,
                  opacity: 0.8,
                  fontSize: '0.85em',
                }}>
                  {which}
                </label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="0:00 or 23.5"
                  disabled={posting}
                  style={{
                    width: 110,
                    padding: '5px 8px',
                    borderRadius: 4,
                    border: '1px solid #444',
                    background: '#1c1c24',
                    color: '#eee',
                    fontSize: '0.9em',
                    fontFamily: 'monospace',
                  }}
                />
                <button
                  type="button"
                  onClick={capture}
                  disabled={!playerAvailable || posting}
                  style={anchorBtnStyle(false)}
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

          <div style={{ display: 'flex', gap: 8, marginTop: 4, alignItems: 'center' }}>
            {(draftStartText || draftEndText) && (
              <button
                type="button"
                onClick={clearAnchor}
                disabled={posting}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#aaa',
                  cursor: 'pointer',
                  fontSize: '0.82em',
                  padding: '2px 6px',
                }}
                title="Remove both time anchors"
              >
                clear anchor
              </button>
            )}
            <span style={{ opacity: 0.5, fontSize: '0.78em', flex: 1 }}>
              Leave both empty for a general comment. Set Start only
              for a single moment. Set both for a range.
            </span>
            <button
              type="submit"
              className="report-btn"
              disabled={posting || !draft.trim()}
            >
              {posting ? 'Posting…' : 'Post comment'}
            </button>
          </div>
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

const textareaStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #444',
  background: '#0f0f18',
  color: '#eee',
  fontSize: '0.95rem',
  fontFamily: 'inherit',
  resize: 'vertical',
}

const iconBtnStyle = {
  background: 'transparent',
  border: 'none',
  color: '#8ab4f8',
  cursor: 'pointer',
  fontSize: '0.78em',
  padding: '2px 6px',
}

function anchorBtnStyle(active) {
  return {
    background: active ? '#2a3850' : 'transparent',
    border: '1px solid ' + (active ? '#4a90e2' : '#2a3850'),
    color: active ? '#cfe1ff' : '#8ab4f8',
    padding: '3px 10px',
    borderRadius: 12,
    cursor: 'pointer',
    fontSize: '0.85em',
  }
}
