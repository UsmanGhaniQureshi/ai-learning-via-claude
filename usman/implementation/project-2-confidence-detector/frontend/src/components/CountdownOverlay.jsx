import { useEffect, useState } from 'react'

/**
 * CountdownOverlay — full-screen 3-2-1 countdown.
 *
 * Calls onComplete() once the count reaches 0, then unmounts. Three
 * seconds is short enough to feel snappy but long enough to clear
 * "ok wait, where's my notes" out of the recording.
 *
 * Doesn't actually start the recording — the parent does that in its
 * onComplete handler. We just give the user a moment to focus.
 */
export default function CountdownOverlay({ from = 3, onComplete }) {
  const [n, setN] = useState(from)

  useEffect(() => {
    if (n <= 0) {
      onComplete?.()
      return
    }
    const t = setTimeout(() => setN(n - 1), 1000)
    return () => clearTimeout(t)
  }, [n, onComplete])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.85)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        color: '#fff',
      }}
    >
      <div style={{ fontSize: '12rem', fontWeight: 700, lineHeight: 1 }}>
        {n > 0 ? n : 'GO'}
      </div>
      <div style={{ marginTop: 16, fontSize: '1.2rem', opacity: 0.7 }}>
        {n > 0 ? 'Get ready…' : 'Recording!'}
      </div>
    </div>
  )
}
