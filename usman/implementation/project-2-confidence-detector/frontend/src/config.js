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
