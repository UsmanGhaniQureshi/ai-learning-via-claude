import { useEffect, useMemo, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

/**
 * PracticeSetup — pre-session screen.
 *
 * Lets the user:
 *   - pick a topic (or "Free practice")
 *   - set a target duration 1-10 minutes
 *   - see the prompt body so they have something concrete to talk about
 *
 * Calls onStart({ promptId, promptTitle, durationMin }) when the user
 * clicks Start. Selection is persisted in localStorage so the next
 * session pre-fills with the same choices.
 *
 * Loading prompts can fail (network, backend down) — we fall back to
 * a single "Free practice" entry rather than blocking the user from
 * starting at all.
 */
const STORAGE_KEY = 'cd_practice_setup'

function loadSavedSetup() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function saveSetup(setup) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(setup)) } catch { /* ignore */ }
}

const FALLBACK_PROMPT = {
  id: 'free',
  title: 'Free practice — no prompt',
  body: 'No script, no topic. Talk about whatever.',
  category: 'Free',
  suggested_min: 5,
}

export default function PracticeSetup({ onStart, ctaLabel = 'Start practice' }) {
  const [prompts, setPrompts] = useState([FALLBACK_PROMPT])
  const [selectedId, setSelectedId] = useState(FALLBACK_PROMPT.id)
  const [durationMin, setDurationMin] = useState(5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Group prompts by category for the dropdown — keeps a Job Interview
  // and Wedding Speech from being interleaved alphabetically.
  const grouped = useMemo(() => {
    const map = new Map()
    for (const p of prompts) {
      if (!map.has(p.category)) map.set(p.category, [])
      map.get(p.category).push(p)
    }
    return Array.from(map.entries())
  }, [prompts])

  const selected = useMemo(
    () => prompts.find((p) => p.id === selectedId) || prompts[0],
    [prompts, selectedId],
  )

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const res = await apiFetch(`${API_BASE}/api/prompts`)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (cancelled) return
        if (Array.isArray(data) && data.length > 0) {
          setPrompts(data)
          // Apply saved selection (or default) once prompts are loaded.
          const saved = loadSavedSetup()
          const initial = saved?.promptId
            && data.some((p) => p.id === saved.promptId)
              ? saved.promptId
              : data[0].id
          setSelectedId(initial)
          if (saved?.durationMin) setDurationMin(saved.durationMin)
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load prompts')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  // When the user picks a new prompt, default the duration to its
  // suggested length — but only if the user hasn't already changed it
  // for this session. We treat a value still equal to the previous
  // prompt's suggested_min as "unchanged".
  function handlePromptChange(newId) {
    const newPrompt = prompts.find((p) => p.id === newId)
    const oldSuggested = selected?.suggested_min
    setSelectedId(newId)
    if (newPrompt?.suggested_min && durationMin === oldSuggested) {
      setDurationMin(newPrompt.suggested_min)
    }
  }

  function handleStart() {
    saveSetup({ promptId: selectedId, durationMin })
    onStart({
      promptId: selectedId,
      promptTitle: selected?.title || '',
      promptBody: selected?.body || '',
      durationMin,
    })
  }

  return (
    <div className="section" style={{ maxWidth: 720, margin: '20px auto' }}>
      <h2>Set up your practice</h2>
      {error && (
        <div className="session-error" style={{ marginBottom: 12 }}>
          Couldn't load topic library: {error}. You can still start with
          Free practice below.
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          <strong>Topic</strong>
        </label>
        <select
          value={selectedId}
          onChange={(e) => handlePromptChange(e.target.value)}
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 6,
            border: '1px solid #444',
            background: '#1c1c24',
            color: '#eee',
            fontSize: '1rem',
          }}
        >
          {grouped.map(([category, group]) => (
            <optgroup key={category} label={category}>
              {group.map((p) => (
                <option key={p.id} value={p.id}>{p.title}</option>
              ))}
            </optgroup>
          ))}
        </select>
        {selected?.body && (
          <div
            style={{
              marginTop: 10,
              padding: 12,
              background: '#1a1a22',
              borderLeft: '3px solid #4a90e2',
              borderRadius: 4,
              fontSize: '0.92rem',
              lineHeight: 1.5,
              color: '#cfcfd6',
            }}
          >
            {selected.body}
          </div>
        )}
      </div>

      <div style={{ marginTop: 20 }}>
        <label style={{ display: 'block', marginBottom: 6 }}>
          <strong>Duration:</strong>{' '}
          <span style={{ color: '#4a90e2' }}>
            {durationMin} {durationMin === 1 ? 'minute' : 'minutes'}
          </span>
        </label>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={durationMin}
          onChange={(e) => setDurationMin(parseInt(e.target.value, 10))}
          style={{ width: '100%' }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            opacity: 0.6,
            fontSize: '0.78em',
            marginTop: 2,
          }}
        >
          <span>1 min</span>
          <span>10 min</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleStart}
        className="report-btn"
        style={{
          marginTop: 24,
          width: '100%',
          padding: '12px 16px',
          fontSize: '1rem',
        }}
      >
        {ctaLabel} →
      </button>
    </div>
  )
}
