/**
 * SVG circular gauge displaying confidence score (0-100).
 * Animated arc with gradient stroke + soft glow.
 */
export default function ScoreGauge({ score = 0, label = '', size = 200 }) {
  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  const safe = Math.max(0, Math.min(100, Number(score) || 0))
  const progress = safe / 100
  const offset = circumference * (1 - progress)
  const gradId = `gaugeGrad-${size}`

  return (
    <div className="relative inline-block" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#7c3aed" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.08)"
          strokeWidth="10"
        />
        {/* Fill */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={`url(#${gradId})`}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{
            transition: 'stroke-dashoffset 0.5s ease',
            filter: 'drop-shadow(0 0 8px rgba(124,58,237,0.6))',
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
        <div
          className="font-display font-extrabold leading-none text-text-primary"
          style={{ fontSize: Math.round(size * 0.28) }}
        >
          {Math.round(safe)}
        </div>
        {label && (
          <div className="text-xs text-text-muted mt-1">{label}</div>
        )}
      </div>
    </div>
  )
}
