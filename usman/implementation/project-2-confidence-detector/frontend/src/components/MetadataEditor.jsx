import { useEffect, useRef, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

export default function MetadataEditor({ mediaId, initial, onUpdated }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [topic, setTopic] = useState(initial?.topic || '')
  const [tags, setTags] = useState(initial?.tags || [])
  const [newTag, setNewTag] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

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
    <div className="glass-card p-4 mb-4">
      <div className="grid grid-cols-1 sm:grid-cols-[2fr_1fr] gap-3">
        <label className="block">
          <div className="text-xs text-text-muted mb-1">Title</div>
          <input
            type="text"
            value={title}
            placeholder="Untitled recording — click to name"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={saveTitleIfChanged}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
            maxLength={200}
            disabled={busy}
            className="input"
          />
        </label>
        <label className="block">
          <div className="text-xs text-text-muted mb-1">Topic</div>
          <input
            type="text"
            value={topic}
            placeholder="e.g. Job interview"
            onChange={(e) => setTopic(e.target.value)}
            onBlur={saveTopicIfChanged}
            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
            maxLength={120}
            disabled={busy}
            className="input"
          />
        </label>
      </div>

      <div className="mt-3">
        <div className="text-xs text-text-muted mb-1">Tags</div>
        <div className="flex flex-wrap gap-2 items-center">
          {tags.map((t) => (
            <span key={t} className="badge badge-accent gap-1.5">
              {t}
              <button
                type="button"
                onClick={() => removeTag(t)}
                disabled={busy}
                title="Remove tag"
                className="text-text-accent hover:text-text-primary leading-none"
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
            className="input flex-1 min-w-[140px]"
            style={{ maxWidth: 200 }}
          />
          {newTag.trim() && (
            <button
              type="button"
              onClick={addTag}
              disabled={busy}
              className="btn btn-primary btn-sm"
            >
              Add
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-3 py-2 mt-3">
          Couldn&apos;t save: {error}
        </div>
      )}
    </div>
  )
}
