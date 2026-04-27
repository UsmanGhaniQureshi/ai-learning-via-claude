import { useEffect, useRef, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

/**
 * MetadataEditor — inline editing for a Media row's title, topic,
 * and tag chips. Sits at the top of the Result page.
 *
 * Behaviour:
 *   - Title: click to edit, blur or Enter to save. Falls back to a
 *     placeholder ("Untitled recording — click to name").
 *   - Topic: free-text input next to title.
 *   - Tags: chip list with an "Add tag" input. Backend lower-cases
 *     and de-duplicates; UI just shows the canonical form back.
 *
 * All edits are PATCH'd individually — small payloads, optimistic
 * UI, server response is the source of truth (re-renders with the
 * canonicalised tags from the server). Network failures show an
 * inline error and revert.
 */
export default function MetadataEditor({ mediaId, initial, onUpdated }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [topic, setTopic] = useState(initial?.topic || '')
  const [tags, setTags] = useState(initial?.tags || [])
  const [newTag, setNewTag] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Keep local state in sync if `initial` ever changes (parent re-fetch).
  const lastInitId = useRef(mediaId)
  useEffect(() => {
    if (lastInitId.current !== mediaId) {
      lastInitId.current = mediaId
      setTitle(initial?.title || '')
      setTopic(initial?.topic || '')
      setTags(initial?.tags || [])
    }
  }, [mediaId, initial])

  async function patch(payload) {
    setBusy(true)
    setError(null)
    try {
      const res = await apiFetch(`${API_BASE}/api/media/${mediaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      // Server returns canonical values — sync local state to whatever
      // it stored (handles trim/lowercase/de-dup of tags transparently).
      setTitle(data.title || '')
      setTopic(data.topic || '')
      setTags(data.tags || [])
      onUpdated?.(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  // Save on blur, only if value actually changed (avoid PATCH spam).
  function saveTitleIfChanged() {
    if ((initial?.title || '') !== title) patch({ title })
  }
  function saveTopicIfChanged() {
    if ((initial?.topic || '') !== topic) patch({ topic })
  }

  function addTag() {
    const t = newTag.trim().toLowerCase()
    if (!t || tags.includes(t)) {
      setNewTag('')
      return
    }
    const next = [...tags, t]
    patch({ tags: next })
    setNewTag('')
  }
  function removeTag(t) {
    patch({ tags: tags.filter((x) => x !== t) })
  }

  return (
    <div
      style={{
        background: '#161620',
        border: '1px solid #2a2a35',
        borderRadius: 8,
        padding: 14,
        marginBottom: 16,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <label style={{ flex: '2 1 280px', display: 'block' }}>
          <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 4 }}>
            Title
          </div>
          <input
            type="text"
            value={title}
            placeholder="Untitled recording — click to name"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitleIfChanged}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
            maxLength={200}
            disabled={busy}
            style={inputStyle}
          />
        </label>
        <label style={{ flex: '1 1 200px', display: 'block' }}>
          <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 4 }}>
            Topic
          </div>
          <input
            type="text"
            value={topic}
            placeholder="e.g. Job interview"
            onChange={(e) => setTopic(e.target.value)}
            onBlur={saveTopicIfChanged}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
            maxLength={120}
            disabled={busy}
            style={inputStyle}
          />
        </label>
      </div>

      <div style={{ marginTop: 12 }}>
        <div style={{ fontSize: '0.78em', opacity: 0.7, marginBottom: 4 }}>
          Tags
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {tags.map((t) => (
            <span key={t} style={chipStyle}>
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                disabled={busy}
                title="Remove tag"
                style={chipRemoveStyle}
              >
                ×
              </button>
            </span>
          ))}
          <input
            type="text"
            value={newTag}
            placeholder={tags.length ? 'add tag' : 'Add a tag (e.g. interview)'}
            onChange={(e) => setNewTag(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTag() } }}
            maxLength={40}
            disabled={busy || tags.length >= 20}
            style={{ ...inputStyle, flex: '0 1 200px' }}
          />
          {newTag.trim() && (
            <button type="button" onClick={addTag} disabled={busy} className="report-btn" style={{ padding: '4px 10px' }}>
              Add
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="session-error" style={{ marginTop: 10 }}>
          Couldn't save: {error}
        </div>
      )}
    </div>
  )
}

const inputStyle = {
  width: '100%',
  padding: '8px 10px',
  borderRadius: 6,
  border: '1px solid #444',
  background: '#1c1c24',
  color: '#eee',
  fontSize: '0.95rem',
}

const chipStyle = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  background: '#2a3850',
  color: '#cfe1ff',
  padding: '3px 8px',
  borderRadius: 12,
  fontSize: '0.8rem',
}

const chipRemoveStyle = {
  background: 'none',
  border: 'none',
  color: '#cfe1ff',
  cursor: 'pointer',
  fontSize: '1rem',
  lineHeight: 1,
  padding: 0,
}
