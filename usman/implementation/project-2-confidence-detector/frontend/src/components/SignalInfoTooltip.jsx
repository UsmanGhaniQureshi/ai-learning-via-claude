import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SIGNAL_DEFS } from '../explainer/signals'

export default function SignalInfoTooltip({ signal }) {
  const def = SIGNAL_DEFS[signal]
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e) {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  if (!def) return null

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        title={`What does ${def.label} measure?`}
        aria-label={`What does ${def.label} measure?`}
        className={`inline-flex items-center justify-center w-4 h-4 rounded-full border border-border text-xs font-semibold p-0 leading-none transition-colors ${
          open ? 'bg-accent-soft text-text-accent border-border-accent' : 'bg-transparent text-text-muted hover:text-text-primary'
        }`}
      >
        ?
      </button>
      {open && (
        <div
          className="absolute top-[120%] left-0 z-50 w-72 bg-page/95 border border-border-accent rounded-md p-3 shadow-card text-text-secondary text-left font-normal"
        >
          <div className="font-semibold text-text-primary mb-1">
            {def.label}
            {def.weight_pct === 0 && (
              <span className="ml-2 text-xs text-text-muted font-normal">(display only)</span>
            )}
          </div>
          <div className="text-xs leading-relaxed mb-2">{def.short}</div>
          <div className="text-xs opacity-90 mb-3">
            <strong className="text-text-primary">Good:</strong> {def.good}
          </div>
          <Link
            to={`/how-it-works#${def.anchor}`}
            onClick={() => setOpen(false)}
            className="text-xs text-text-accent hover:underline"
          >
            Read more →
          </Link>
        </div>
      )}
    </span>
  )
}
