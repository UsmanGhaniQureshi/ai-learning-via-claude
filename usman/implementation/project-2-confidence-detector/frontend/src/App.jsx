import { Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom'
import './App.css'
import Home from './pages/Home'
import Upload from './pages/Upload'
import Result from './pages/Result'
import LiveSession from './pages/LiveSession'
import Analyzer from './pages/Analyzer'
import History from './pages/History'
import Login from './pages/Login'
import Register from './pages/Register'
import HowItWorks from './pages/HowItWorks'
import ErrorBoundary from './components/ErrorBoundary'
import { AuthProvider, useAuth } from './auth/AuthContext'
import RequireAuth from './auth/RequireAuth'

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  )
}

function AppShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const { user, logout } = useAuth()
  const isHome = location.pathname === '/'
  // No back button on the auth pages (they're entry points; back from
  // /login goes nowhere useful).
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register'

  return (
    <div className="app">
      <header style={{ position: 'relative' }}>
        <Link to={user ? '/' : '/login'} style={{ textDecoration: 'none', color: 'inherit' }}>
          <h1>Confidence Detector</h1>
          <p>AI Presentation Coaching — Real-time Feedback</p>
        </Link>
        {user && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: '0.9rem',
            }}
          >
            <span style={{ opacity: 0.8 }}>{user.name}</span>
            <button
              type="button"
              onClick={logout}
              style={{
                background: 'transparent',
                border: '1px solid #555',
                color: '#ccc',
                padding: '4px 10px',
                borderRadius: 4,
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              Sign out
            </button>
          </div>
        )}
      </header>

      {!isHome && !isAuthPage && (
        <button className="back-btn" onClick={() => navigate(-1)}>
          &larr; Back
        </button>
      )}

      <ErrorBoundary>
        <Routes>
          {/* Public auth routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          {/* /how-it-works is gated behind RequireAuth like everything
              else — content is non-sensitive but the rule is uniform.
              Move this OUT of RequireAuth if you want it public. */}
          <Route path="/how-it-works" element={<RequireAuth><HowItWorks /></RequireAuth>} />

          {/* Protected app routes — every page below requires login */}
          <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
          <Route path="/live" element={<RequireAuth><LiveSession /></RequireAuth>} />
          <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
          <Route path="/analyzer" element={<RequireAuth><Analyzer /></RequireAuth>} />
          <Route path="/library" element={<RequireAuth><History /></RequireAuth>} />
          <Route path="/result/:id" element={<RequireAuth><Result /></RequireAuth>} />

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

      {/* Footer link — discoverable from every page once logged in.
          Hidden on auth pages and the explainer itself to avoid
          self-referencing clutter. */}
      {user && !isAuthPage && location.pathname !== '/how-it-works' && (
        <footer
          style={{
            marginTop: 40,
            padding: '16px 0',
            borderTop: '1px solid #2a2a35',
            textAlign: 'center',
            fontSize: '0.85em',
            opacity: 0.7,
          }}
        >
          <Link to="/how-it-works" style={{ color: '#8ab4f8' }}>
            How is this calculated?
          </Link>
        </footer>
      )}
    </div>
  )
}

export default App
