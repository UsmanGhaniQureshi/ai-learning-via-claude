import { useEffect, useRef, useState } from 'react'

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
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [startedAtMs, targetMin, onTimeUp])

  const targetS = targetMin * 60
  const remainingS = Math.max(0, targetS - elapsedS)
  const pct = Math.min(100, (elapsedS / targetS) * 100)
  const last10 = remainingS > 0 && remainingS <= 10
  const finished = remainingS === 0

  let barClass = 'bg-gradient-to-r from-accent to-cyan'
  if (last10 || finished) barClass = 'bg-danger'
  else if (pct >= 80) barClass = 'bg-warning'

  return (
    <div className="w-full">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-base font-semibold tabular-nums text-text-primary">
          {fmt(elapsedS)} / {fmt(targetS)}
        </span>
        <span
          className={`text-xs font-medium ${
            last10 ? 'text-danger font-semibold' : 'text-text-muted'
          }`}
        >
          {last10
            ? `${remainingS}s left — wrap up!`
            : finished
              ? "Time's up"
              : `${fmt(remainingS)} remaining`}
        </span>
      </div>
      <div className="h-2 bg-elevated rounded-full overflow-hidden">
        <div
          className={`h-full transition-all duration-300 ${barClass}`}
          style={{ width: `${pct}%` }}
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
