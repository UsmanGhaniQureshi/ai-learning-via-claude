import { useEffect, useMemo, useState } from 'react'
import { API_BASE, apiFetch } from '../config'

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
  const [activeCategory, setActiveCategory] = useState(FALLBACK_PROMPT.category)
  const [durationMin, setDurationMin] = useState(5)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const categories = useMemo(() => {
    const set = new Set()
    for (const p of prompts) set.add(p.category)
    return Array.from(set)
  }, [prompts])

  const filteredTopics = useMemo(
    () => prompts.filter((p) => p.category === activeCategory),
    [prompts, activeCategory],
  )

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
          const saved = loadSavedSetup()
          const initial = saved?.promptId
            && data.some((p) => p.id === saved.promptId)
              ? saved.promptId
              : data[0].id
          setSelectedId(initial)
          const initialPrompt = data.find((p) => p.id === initial) || data[0]
          if (initialPrompt) setActiveCategory(initialPrompt.category)
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

  function handleSelectTopic(p) {
    const prevSuggested = selected?.suggested_min
    setSelectedId(p.id)
    if (p.suggested_min && durationMin === prevSuggested) {
      setDurationMin(p.suggested_min)
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
    <div className="max-w-2xl mx-auto space-y-8">
      <div>
        <h2 className="mb-1">Choose your topic</h2>
        <p className="text-text-secondary text-sm">
          Pick a category and topic to practice
        </p>
      </div>

      {error && (
        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-4 py-2">
          Couldn&apos;t load topic library: {error}. You can still start with Free practice below.
        </div>
      )}

      {/* Category pills */}
      <div className="flex flex-wrap gap-2">
        {categories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-all duration-150 border ${
              activeCategory === cat
                ? 'bg-accent border-accent text-white shadow-glow'
                : 'bg-card border-border text-text-secondary hover:border-border-accent'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Topic cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {filteredTopics.map((topic) => (
          <button
            key={topic.id}
            type="button"
            onClick={() => handleSelectTopic(topic)}
            disabled={loading}
            className={`glass-card p-4 text-left transition-all duration-150 ${
              selectedId === topic.id
                ? 'border-border-accent shadow-accent bg-accent-soft'
                : 'hover:border-border-accent'
            }`}
          >
            <p className="font-medium text-sm text-text-primary mb-1">
              {topic.title}
            </p>
            {topic.body && (
              <p className="text-xs text-text-muted line-clamp-2">
                {topic.body}
              </p>
            )}
          </button>
        ))}
      </div>

      {/* Duration slider */}
      <div className="glass-card p-5 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-sm font-medium text-text-primary">Duration</span>
          <span className="text-accent font-bold font-display">
            {durationMin} min
          </span>
        </div>
        <input
          type="range"
          min={1}
          max={10}
          value={durationMin}
          onChange={(e) => setDurationMin(parseInt(e.target.value, 10))}
          className="w-full accent-accent cursor-pointer"
        />
        <div className="flex justify-between text-xs text-text-muted">
          <span>1 min</span><span>10 min</span>
        </div>
      </div>

      <button
        type="button"
        onClick={handleStart}
        disabled={!selected}
        className="btn btn-primary btn-lg btn-full disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
      >
        {ctaLabel} →
      </button>
    </div>
  )
}
