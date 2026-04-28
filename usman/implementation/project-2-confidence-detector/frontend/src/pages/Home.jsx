import { Link } from 'react-router-dom'
import ProgressChart from '../components/ProgressChart'

/**
 * Home — four mode cards + a compact "last 5 sessions" progress strip.
 * The strip renders nothing distracting until ≥1 finished session exists,
 * at which point it fills in a sparkline + delta pill so users see whether
 * they're trending up before they bother opening a report.
 */
export default function Home() {
  return (
    <>
      <div className="mode-select">
        <Link to="/live" className="mode-btn">
          <span className="icon">&#x1F3A5;</span>
          <h3>Live Practice</h3>
          <p>Real-time confidence detection via webcam + mic</p>
        </Link>

        <Link to="/upload" className="mode-btn">
          <span className="icon">&#x1F4C1;</span>
          <h3>Analyze Recording</h3>
          <p>Upload a presentation video for analysis</p>
        </Link>

        <Link to="/analyzer" className="mode-btn">
          <span className="icon">&#x1F3A4;</span>
          <h3>Speech Analyzer</h3>
          <p>Test your speech — no camera needed</p>
        </Link>

        <Link to="/library" className="mode-btn">
          <span className="icon">&#x1F4DA;</span>
          <h3>Library</h3>
          <p>Browse and replay past sessions</p>
        </Link>
      </div>

      <div style={{ marginTop: 24, padding: '0 4px' }}>
        <div style={{ fontSize: '0.78em', opacity: 0.6, marginBottom: 6 }}>
          Last 5 sessions
        </div>
        <ProgressChart limit={5} compact />
      </div>
    </>
  )
}
