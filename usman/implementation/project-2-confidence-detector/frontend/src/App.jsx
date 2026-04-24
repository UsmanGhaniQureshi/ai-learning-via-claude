import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import Home from './pages/Home'
import Upload from './pages/Upload'
import Result from './pages/Result'
import LiveSession from './pages/LiveSession'
import Analyzer from './pages/Analyzer'
import History from './pages/History'
import ErrorBoundary from './components/ErrorBoundary'

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  const isHome = location.pathname === '/'

  return (
    <div className="app">
      <header>
        <Link to="/" style={{ textDecoration: 'none', color: 'inherit' }}>
          <h1>Confidence Detector</h1>
          <p>AI Presentation Coaching — Real-time Feedback</p>
        </Link>
      </header>

      {!isHome && (
        <button className="back-btn" onClick={() => navigate(-1)}>
          &larr; Back
        </button>
      )}

      <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/live" element={<LiveSession />} />
          <Route path="/upload" element={<Upload />} />
          <Route path="/analyzer" element={<Analyzer />} />
          <Route path="/library" element={<History />} />
          <Route path="/result/:id" element={<Result />} />
          <Route
            path="*"
            element={
              <div className="section">
                <h2>Page not found</h2>
                <p className="subtitle">No route matches this URL.</p>
                <Link to="/" className="report-btn">← Home</Link>
              </div>
            }
          />
        </Routes>
      </ErrorBoundary>
    </div>
  )
}

export default App
