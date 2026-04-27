import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { SIGNAL_DEFS } from '../explainer/signals'

/**
 * SignalInfoTooltip — small `?` icon next to each signal name. Click
 * (or hover) to open a popover with:
 *   - the one-line definition
 *   - what "good" looks like
 *   - a link to the corresponding section of /how-it-works
 *
 * Click-outside dismissal so the popover doesn't sit there forever.
 * No portal — the popover renders inline; absolute-positioned with a
 * z-index that beats the surrounding card.
 */
export default function SignalInfoTooltip({ signal }) {
  const def = SIGNAL_DEFS[signal]
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  // Close on click-outside.
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
    <span ref={ref} style={{ position: 'relative', display: 'inline-block', marginLeft: 4 }}>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        title={`What does ${def.label} measure?`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          borderRadius: '50%',
          border: '1px solid #555',
          background: open ? '#2a3850' : 'transparent',
          color: '#aaa',
          fontSize: '0.7rem',
          fontWeight: 600,
          cursor: 'pointer',
          padding: 0,
          lineHeight: 1,
        }}
        aria-label={`What does ${def.label} measure?`}
      >
        ?
      </button>
      {open && (
        <div
          style={{
            position: 'absolute',
            top: '120%',
            left: 0,
            zIndex: 50,
            width: 280,
            background: '#0f0f18',
            border: '1px solid #2a3850',
            borderRadius: 6,
            padding: 12,
            boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
            fontSize: '0.82rem',
            lineHeight: 1.4,
            color: '#cfcfd6',
            textAlign: 'left',
            fontWeight: 'normal',
          }}
        >
          <div style={{ fontWeight: 600, color: '#fff', marginBottom: 4 }}>
            {def.label}
            {def.weight_pct === 0 && (
              <span style={{ marginLeft: 6, fontSize: '0.7em', opacity: 0.65 }}>
                (display only)
              </span>
            )}
          </div>
          <div style={{ marginBottom: 6 }}>{def.short}</div>
          <div style={{ fontSize: '0.78em', opacity: 0.85, marginBottom: 8 }}>
            <strong>Good:</strong> {def.good}
          </div>
          <Link
            to={`/how-it-works#${def.anchor}`}
            onClick={() => setOpen(false)}
            style={{ fontSize: '0.78em', color: '#8ab4f8' }}
          >
            Read more →
          </Link>
        </div>
      )}
    </span>
  )
}
