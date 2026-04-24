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
 * Optional API key. When set (via VITE_API_KEY at build time), every
 * HTTP call routes through `apiFetch` which adds an X-API-Key header,
 * and WebSocket URLs built with `wsUrl` append `?api_key=...`. When
 * unset, auth is disabled — backend also defaults to off, so local
 * dev stays one-command.
 */
export const API_KEY = import.meta.env.VITE_API_KEY || ''

/**
 * fetch() wrapper that injects X-API-Key when configured. Preserves
 * the standard fetch signature so call sites only change the name.
 */
export function apiFetch(url, options = {}) {
  if (!API_KEY) return fetch(url, options)
  const headers = new Headers(options.headers || {})
  headers.set('X-API-Key', API_KEY)
  return fetch(url, { ...options, headers })
}

/**
 * Build a WebSocket URL, appending ?api_key=... when configured.
 * Preserves any existing query string on the path.
 */
export function wsUrl(path) {
  const base = `${WS_BASE}${path}`
  if (!API_KEY) return base
  const sep = base.includes('?') ? '&' : '?'
  return `${base}${sep}api_key=${encodeURIComponent(API_KEY)}`
}
