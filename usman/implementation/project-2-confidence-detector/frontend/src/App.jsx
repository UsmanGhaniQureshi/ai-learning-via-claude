import { Routes, Route, Link, NavLink, useLocation } from 'react-router-dom'
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

function navLinkClass({ isActive }) {
  return `text-sm font-medium px-3 py-1.5 rounded-md transition-all ${
    isActive
      ? 'text-text-accent bg-accent-soft'
      : 'text-text-secondary hover:text-text-primary hover:bg-elevated'
  }`
}

function AppShell() {
  const location = useLocation()
  const { user, logout } = useAuth()
  const isAuthPage = location.pathname === '/login' || location.pathname === '/register'

  return (
    <>
      {/* Fixed top header — shown only when authenticated and not on auth pages */}
      {user && !isAuthPage && (
        <header className="fixed top-0 left-0 right-0 z-50 h-[60px]
          bg-[rgba(10,10,15,0.8)] backdrop-blur-nav border-b
          border-border flex items-center justify-between px-6 sm:px-8">
          <Link to="/" className="font-display text-2xl font-extrabold tracking-[-0.04em] text-text-primary">
            cd<span className="text-accent">.</span>
          </Link>

          <nav className="flex items-center gap-1">
            <NavLink to="/" end className={navLinkClass}>Home</NavLink>
            <NavLink to="/library" className={navLinkClass}>Library</NavLink>
            <NavLink to="/how-it-works" className={navLinkClass}>How it Works</NavLink>
          </nav>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-text-secondary">{user.name}</span>
            <button
              type="button"
              onClick={logout}
              className="btn btn-secondary btn-sm"
            >
              Sign out
            </button>
          </div>
        </header>
      )}

      <main className={user && !isAuthPage ? 'page-glow' : ''}>
        <div className={isAuthPage ? 'min-h-screen flex items-center justify-center px-6' : 'page'}>
          <ErrorBoundary>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route path="/how-it-works" element={<RequireAuth><HowItWorks /></RequireAuth>} />

              <Route path="/" element={<RequireAuth><Home /></RequireAuth>} />
              <Route path="/live" element={<RequireAuth><LiveSession /></RequireAuth>} />
              <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
              <Route path="/analyzer" element={<RequireAuth><Analyzer /></RequireAuth>} />
              <Route path="/library" element={<RequireAuth><History /></RequireAuth>} />
              <Route path="/result/:id" element={<RequireAuth><Result /></RequireAuth>} />

              <Route
                path="*"
                element={
                  <div className="text-center py-24 space-y-4">
                    <h2>Page not found</h2>
                    <p className="text-text-secondary">No route matches this URL.</p>
                    <Link to="/" className="btn btn-primary">← Home</Link>
                  </div>
                }
              />
            </Routes>
          </ErrorBoundary>
        </div>
      </main>
    </>
  )
}

export default App
