import { useEffect, useState } from 'react'

export default function CountdownOverlay({ from = 3, onComplete, topicTitle }) {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-page/90 backdrop-blur-sm">
      <div className="text-center space-y-4 animate-fade-up">
        <p className="text-text-muted text-sm font-medium uppercase tracking-widest">
          {n > 0 ? 'Get ready' : 'Recording'}
        </p>
        <p className="text-[120px] font-display font-extrabold text-transparent bg-clip-text bg-gradient-to-br from-accent-bright to-cyan leading-none animate-glow-pulse">
          {n > 0 ? n : 'GO'}
        </p>
        {topicTitle && (
          <p className="text-text-secondary">{topicTitle}</p>
        )}
      </div>
    </div>
  )
}
