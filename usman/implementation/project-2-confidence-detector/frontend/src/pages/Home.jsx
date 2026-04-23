import { Link } from 'react-router-dom'

/**
 * Home — four mode cards that link into the respective mode pages.
 * Used to live inline in App.jsx; split out so App.jsx is just a router shell.
 */
export default function Home() {
  return (
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
  )
}
