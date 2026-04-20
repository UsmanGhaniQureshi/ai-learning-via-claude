/**
 * SVG circular gauge displaying confidence score (0-100).
 * Animated arc with color coding: red (0-40), amber (41-70), green (71-100).
 */
export default function ScoreGauge({ score = 0, label = '', size = 200 }) {
  const radius = (size - 20) / 2
  const circumference = 2 * Math.PI * radius
  const progress = Math.max(0, Math.min(100, score)) / 100
  const offset = circumference * (1 - progress)

  const color = score >= 71 ? '#00c853' : score >= 41 ? '#ffd600' : '#ff1744'

  return (
    <div className="score-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="#222" strokeWidth="10"
        />
        {/* Progress arc */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color} strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.3s ease' }}
        />
      </svg>
      <div className="gauge-center">
        <div className="gauge-number" style={{ color }}>{Math.round(score)}</div>
        {label && <div className="gauge-label">{label}</div>}
      </div>
    </div>
  )
}
