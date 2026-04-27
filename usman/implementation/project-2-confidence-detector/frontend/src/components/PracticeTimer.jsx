import { useEffect, useRef, useState } from 'react'

/**
 * PracticeTimer — displays elapsed/target time + a progress bar +
 * 10-second warning. Calls onTimeUp() exactly once when the target
 * is hit so the parent can auto-stop the session.
 *
 * Uses an internal interval rather than reading a parent-provided
 * `duration` prop because the parent's elapsed counter is also
 * driven by an interval and we don't want them to drift apart.
 *
 * `startedAtMs` should be the wall-clock millis when recording
 * actually began (after the countdown). When that's null the timer
 * shows 0:00 / target — useful while the countdown is still on screen.
 */
export default function PracticeTimer({ targetMin, startedAtMs, onTimeUp }) {
  const [elapsedS, setElapsedS] = useState(0)
  const firedRef = useRef(false)

  useEffect(() => {
    if (!startedAtMs) {
      setElapsedS(0)
      firedRef.current = false
      return
    }
    const targetS = targetMin * 60
    const tick = () => {
      const e = Math.floor((Date.now() - startedAtMs) / 1000)
      setElapsedS(e)
      if (!firedRef.current && e >= targetS) {
        firedRef.current = true
        onTimeUp?.()
      }
    }
    tick()
    const id = setInterval(tick, 250) // 250 ms = smooth bar, cheap
    return () => clearInterval(id)
  }, [startedAtMs, targetMin, onTimeUp])

  const targetS = targetMin * 60
  const remainingS = Math.max(0, targetS - elapsedS)
  const pct = Math.min(100, (elapsedS / targetS) * 100)
  const last10 = remainingS > 0 && remainingS <= 10
  const finished = remainingS === 0

  // Bar colour: green → yellow at 80% → red in last 10 s.
  const barColor = last10 || finished ? '#ff5252' : pct >= 80 ? '#ffb84d' : '#4a90e2'

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 6,
        }}
      >
        <span style={{ fontSize: '1.05rem', fontWeight: 600 }}>
          {fmt(elapsedS)} / {fmt(targetS)}
        </span>
        <span
          style={{
            fontSize: '0.85rem',
            color: last10 ? '#ff5252' : '#aaa',
            fontWeight: last10 ? 600 : 400,
          }}
        >
          {last10
            ? `${remainingS}s left — wrap up!`
            : finished
              ? 'Time’s up'
              : `${fmt(remainingS)} remaining`}
        </span>
      </div>
      <div
        style={{
          width: '100%',
          height: 8,
          background: '#22222a',
          borderRadius: 4,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: barColor,
            transition: 'width 0.25s linear, background 0.4s ease',
          }}
        />
      </div>
    </div>
  )
}

function fmt(s) {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}
