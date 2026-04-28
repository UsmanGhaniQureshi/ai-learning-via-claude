import { useEffect, useMemo, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

/**
 * TopicSelector — slim topic picker for Upload + Analyzer.
 *
 * Shows a curated subset of the prompt library (the full 12-topic list
 * was overwhelming) plus an inline "Custom topic" mode where the user
 * types their own title + brief, and a "No topic" option that disables
 * LLM coaching for the upload.
 *
 * Emits via onChange:
 *   { promptId, promptTitle, promptBody } when a topic is set
 *   null                                  when "No topic" is selected
 */

// Curated picks — one per use case, ordered roughly by frequency.
// IDs come from backend/prompts.py. If a curated id is missing from
// the live /api/prompts response (e.g. seeded prompts changed), the
// dropdown still renders the ones that DID come back.
const CURATED_IDS = [
  'tell_about_yourself',
  'elevator_pitch',
  'explain_to_grandma',
  'product_demo',
  'conference_intro',
]

const NO_TOPIC = '__none'
const CUSTOM = '__custom'

export default function TopicSelector({ value, onChange }) {
  const [prompts, setPrompts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [mode, setMode] = useState(NO_TOPIC) // NO_TOPIC | CUSTOM | <prompt-id>
  const [customTitle, setCustomTitle] = useState('')
  const [customBody, setCustomBody] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await apiFetch(`${API_BASE}/api/prompts`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        if (Array.isArray(data)) {
          // Filter to curated set, in the curated order.
          const byId = new Map(data.map((p) => [p.id, p]))
          const picks = CURATED_IDS
            .map((id) => byId.get(id))
            .filter(Boolean)
          setPrompts(picks)
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load topics')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // Sync the dropdown selection back when the parent's value changes
  // (e.g. after a reset()).
  useEffect(() => {
    if (!value?.promptTitle) {
      // Don't clobber the user mid-typing in CUSTOM mode.
      if (mode !== CUSTOM) setMode(NO_TOPIC)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const selectedPreset = useMemo(() => {
    if (mode === NO_TOPIC || mode === CUSTOM) return null
    return prompts.find((p) => p.id === mode) || null
  }, [prompts, mode])

  function handleSelect(e) {
    const newMode = e.target.value
    setMode(newMode)
    if (newMode === NO_TOPIC) {
      onChange?.(null)
      return
    }
    if (newMode === CUSTOM) {
      // Emit current custom values (might be empty until user types).
      const title = customTitle.trim()
      onChange?.(title ? {
        promptId: 'custom',
        promptTitle: title,
        promptBody: customBody.trim(),
      } : null)
      return
    }
    const p = prompts.find((x) => x.id === newMode)
    if (p) {
      onChange?.({
        promptId: p.id,
        promptTitle: p.title,
        promptBody: p.body,
      })
    }
  }

  function handleCustomTitleChange(e) {
    const next = e.target.value
    setCustomTitle(next)
    const title = next.trim()
    onChange?.(title ? {
      promptId: 'custom',
      promptTitle: title,
      promptBody: customBody.trim(),
    } : null)
  }

  function handleCustomBodyChange(e) {
    const next = e.target.value
    setCustomBody(next)
    const title = customTitle.trim()
    if (title) {
      onChange?.({
        promptId: 'custom',
        promptTitle: title,
        promptBody: next.trim(),
      })
    }
  }

  return (
    <div className="space-y-2">
      <label className="block">
        <div className="text-xs text-text-muted mb-1">
          Practice topic <span className="opacity-70">(optional — enables AI coaching)</span>
        </div>
        <select
          value={mode}
          onChange={handleSelect}
          disabled={loading}
          className="input"
        >
          <option value={NO_TOPIC}>— No topic (skip AI coaching) —</option>
          <option value={CUSTOM}>✏️  Custom topic…</option>
          {prompts.length > 0 && (
            <optgroup label="Quick picks">
              {prompts.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </optgroup>
          )}
        </select>
      </label>
      {error && (
        <p className="text-xs text-text-muted">
          Couldn&apos;t load topic library: {error}. You can still upload without one or use Custom.
        </p>
      )}

      {/* Custom topic editor */}
      {mode === CUSTOM && (
        <div className="space-y-2 bg-page/60 border border-border rounded-md p-3">
          <label className="block">
            <div className="text-xs text-text-muted mb-1">Topic title</div>
            <input
              type="text"
              value={customTitle}
              onChange={handleCustomTitleChange}
              placeholder="e.g. Mid-year self-review pitch"
              maxLength={200}
              className="input"
              autoFocus
            />
          </label>
          <label className="block">
            <div className="text-xs text-text-muted mb-1">
              Brief <span className="opacity-70">(optional — what should you cover?)</span>
            </div>
            <textarea
              value={customBody}
              onChange={handleCustomBodyChange}
              rows={2}
              maxLength={1000}
              placeholder="A line or two on what to talk about. The coach uses this to judge whether your transcript matches the topic."
              className="input resize-y"
            />
          </label>
          {!customTitle.trim() && (
            <p className="text-xs text-text-muted italic">
              Enter a title above to enable AI coaching.
            </p>
          )}
        </div>
      )}

      {/* Preset body preview */}
      {selectedPreset?.body && (
        <div className="bg-page/60 border-l-2 border-accent rounded-r px-3 py-2 text-sm text-text-secondary leading-relaxed">
          {selectedPreset.body}
        </div>
      )}
    </div>
  )
}
