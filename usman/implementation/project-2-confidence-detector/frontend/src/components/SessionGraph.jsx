import { useRef, useEffect } from 'react'

export default function SessionGraph({ history = [] }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || history.length < 2) return

    const ctx = canvas.getContext('2d')
    const W = canvas.width
    const H = canvas.height
    const padding = { top: 20, right: 20, bottom: 30, left: 40 }

    const drawW = W - padding.left - padding.right
    const drawH = H - padding.top - padding.bottom

    ctx.fillStyle = 'rgba(0,0,0,0)'
    ctx.clearRect(0, 0, W, H)

    const visibleData = history.slice(-60)
    const maxTime = visibleData[visibleData.length - 1].time
    const minTime = visibleData[0].time
    const timeRange = Math.max(maxTime - minTime, 1)

    // Grid + Y labels
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'
    ctx.lineWidth = 1
    for (let y = 0; y <= 100; y += 25) {
      const py = padding.top + drawH * (1 - y / 100)
      ctx.beginPath()
      ctx.moveTo(padding.left, py)
      ctx.lineTo(W - padding.right, py)
      ctx.stroke()
      ctx.fillStyle = '#475569'
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(y.toString(), padding.left - 5, py + 3)
    }

    // Color zones
    ctx.fillStyle = 'rgba(239,68,68,0.05)'
    ctx.fillRect(padding.left, padding.top + drawH * 0.6, drawW, drawH * 0.4)
    ctx.fillStyle = 'rgba(245,158,11,0.05)'
    ctx.fillRect(padding.left, padding.top + drawH * 0.3, drawW, drawH * 0.3)
    ctx.fillStyle = 'rgba(16,185,129,0.05)'
    ctx.fillRect(padding.left, padding.top, drawW, drawH * 0.3)

    // Line
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    visibleData.forEach((point, i) => {
      const x = padding.left + (drawW * (point.time - minTime)) / timeRange
      const y = padding.top + drawH * (1 - point.score / 100)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })

    const latestScore = visibleData[visibleData.length - 1].score
    ctx.strokeStyle = latestScore >= 71 ? '#10b981' : latestScore >= 41 ? '#f59e0b' : '#ef4444'
    ctx.stroke()

    // Current dot
    const lastPoint = visibleData[visibleData.length - 1]
    const lx = padding.left + drawW
    const ly = padding.top + drawH * (1 - lastPoint.score / 100)
    ctx.beginPath()
    ctx.arc(lx, ly, 4, 0, Math.PI * 2)
    ctx.fillStyle = ctx.strokeStyle
    ctx.fill()

    // Time labels
    ctx.fillStyle = '#475569'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    const startSec = Math.floor(minTime)
    const endSec = Math.floor(maxTime)
    ctx.fillText(formatTime(startSec), padding.left, H - 5)
    ctx.fillText(formatTime(endSec), W - padding.right, H - 5)

  }, [history])

  return (
    <div>
      <h4 className="text-text-primary text-sm font-semibold mb-2 uppercase tracking-wider">
        Score Over Time
      </h4>
      <canvas
        ref={canvasRef}
        width={600}
        height={200}
        className="w-full h-auto rounded border border-border bg-page/40"
      />
    </div>
  )
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
