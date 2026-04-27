/**
 * Deployment-ready API configuration.
 *
 * Priority:
 *   1. VITE_API_URL environment variable (production builds)
 *   2. http://localhost:8000 (local dev)
 *   3. window.location.origin (same-origin deployment behind reverse proxy)
 */
export const API_BASE =
  import.meta.env.VITE_API_URL ||
  (window.location.hostname === 'localhost'
    ? 'http://localhost:8000'
    : window.location.origin)

export const WS_BASE = API_BASE.replace(/^http/, 'ws')

/**
 * JWT-based auth.
 *
 * The token is set by AuthContext on login/register and persisted in
 * localStorage so a page refresh doesn't log the user out. apiFetch
 * reads it on every call; wsUrl appends it to WebSocket URLs as a
 * query parameter (browsers can't set headers on the WS upgrade).
 *
 * The functions below DON'T use a captured value at module load time
 * — they re-read localStorage on every call so the very first
 * post-login request picks up the new token without a page refresh.
 */
const TOKEN_KEY = 'cd_jwt_token'

export function getAuthToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || ''
  } catch {
    return ''
  }
}

export function setAuthToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // localStorage disabled (e.g. Safari private mode) — nothing to do.
  }
}

export function clearAuthToken() {
  setAuthToken(null)
}

/**
 * fetch() wrapper that injects Authorization: Bearer <token>.
 * Returns the raw Response — caller decides how to handle status.
 *
 * On 401: AuthContext's response interceptor (in App.jsx) catches it
 * and routes the user to /login. We deliberately don't auto-redirect
 * here because not every 401 means "logged out" — a public probe of
 * a non-existent resource on /api/report/{id} can also 401 in some
 * future endpoint.
 */
export function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {})
  const token = getAuthToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(url, { ...options, headers })
}

/**
 * Build a WebSocket URL, appending ?token=... so the backend's WS
 * handler can authenticate the upgrade. Preserves any existing query
 * string on the path. Without a token, the URL is returned as-is and
 * the backend will close the socket with code 4401.
 */
export function wsUrl(path) {
  const base = `${WS_BASE}${path}`
  const token = getAuthToken()
  if (!token) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}token=${encodeURIComponent(token)}`
}

/**
 * Build a fully-qualified URL for a backend-served media file (video,
 * audio, image) and append ?token=... so the browser's <video>,
 * <audio>, and <img> tags can authenticate.
 *
 * Why this exists: those tags issue plain GETs when their `src` is
 * set — they CANNOT attach the Authorization header that `apiFetch`
 * uses for normal API calls. Without this, every authed media URL
 * silently 401s and the player shows an error icon.
 *
 * `path` may be either a relative API path ("/api/video/foo.mp4") or
 * a fully-qualified URL — we detect and handle both. The function is
 * a no-op when the path is already absolute and points elsewhere
 * (e.g. an external CDN or a data: URL), so it's safe to wrap any
 * media src.
 */
export function mediaUrl(path) {
  if (!path) return path
  // External / data URLs pass through untouched.
  if (/^(https?:|data:|blob:)/i.test(path)) return path
  const base = path.startsWith('/') ? `${API_BASE}${path}` : path
  const token = getAuthToken()
  if (!token) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}token=${encodeURIComponent(token)}`
}
