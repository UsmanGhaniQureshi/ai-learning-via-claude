import { useRef, useEffect } from 'react'

/**
 * Canvas-based line chart showing confidence score over time.
 * Auto-scrolls as session progresses.
 */
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

    // Clear
    ctx.fillStyle = '#0d0d1a'
    ctx.fillRect(0, 0, W, H)

    // Show last 60 data points (~30 seconds of data)
    const visibleData = history.slice(-60)
    const maxTime = visibleData[visibleData.length - 1].time
    const minTime = visibleData[0].time
    const timeRange = Math.max(maxTime - minTime, 1)

    // Grid lines
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 1
    for (let y = 0; y <= 100; y += 25) {
      const py = padding.top + drawH * (1 - y / 100)
      ctx.beginPath()
      ctx.moveTo(padding.left, py)
      ctx.lineTo(W - padding.right, py)
      ctx.stroke()

      // Y-axis labels
      ctx.fillStyle = '#555'
      ctx.font = '10px monospace'
      ctx.textAlign = 'right'
      ctx.fillText(y.toString(), padding.left - 5, py + 3)
    }

    // Color zones (background)
    // Red zone (0-40)
    ctx.fillStyle = 'rgba(255,23,68,0.05)'
    ctx.fillRect(padding.left, padding.top + drawH * 0.6, drawW, drawH * 0.4)
    // Amber zone (41-70)
    ctx.fillStyle = 'rgba(255,214,0,0.05)'
    ctx.fillRect(padding.left, padding.top + drawH * 0.3, drawW, drawH * 0.3)
    // Green zone (71-100)
    ctx.fillStyle = 'rgba(0,200,83,0.05)'
    ctx.fillRect(padding.left, padding.top, drawW, drawH * 0.3)

    // Draw line
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()

    visibleData.forEach((point, i) => {
      const x = padding.left + (drawW * (point.time - minTime)) / timeRange
      const y = padding.top + drawH * (1 - point.score / 100)

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })

    // Gradient stroke based on latest score
    const latestScore = visibleData[visibleData.length - 1].score
    ctx.strokeStyle = latestScore >= 71 ? '#00c853' : latestScore >= 41 ? '#ffd600' : '#ff1744'
    ctx.stroke()

    // Current score dot
    const lastPoint = visibleData[visibleData.length - 1]
    const lx = padding.left + drawW
    const ly = padding.top + drawH * (1 - lastPoint.score / 100)
    ctx.beginPath()
    ctx.arc(lx, ly, 4, 0, Math.PI * 2)
    ctx.fillStyle = ctx.strokeStyle
    ctx.fill()

    // Time labels
    ctx.fillStyle = '#555'
    ctx.font = '10px monospace'
    ctx.textAlign = 'center'
    const startSec = Math.floor(minTime)
    const endSec = Math.floor(maxTime)
    ctx.fillText(formatTime(startSec), padding.left, H - 5)
    ctx.fillText(formatTime(endSec), W - padding.right, H - 5)

  }, [history])

  return (
    <div className="session-graph">
      <h4>Score Over Time</h4>
      <canvas ref={canvasRef} width={600} height={200} className="graph-canvas" />
    </div>
  )
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
