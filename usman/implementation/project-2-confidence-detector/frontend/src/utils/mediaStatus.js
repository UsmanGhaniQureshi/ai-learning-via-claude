import { API_BASE, apiFetch, getAuthToken } from '../config'

/**
 * Stream media-pipeline progress via Server-Sent Events.
 *
 * Replaces the old polling-based pollMediaStatus. The backend holds
 * a single long-lived connection open and pushes one event per
 * state change instead of the client firing GET requests every
 * 500 ms. For a 60-second analysis this drops total requests from
 * ~120 to 1 per upload, eliminates the multi-worker visibility bug
 * (progress now reads from a DB column visible to every uvicorn
 * worker), and keeps the % bar updating smoothly in real time.
 *
 * Implementation: uses the streaming `fetch()` API (NOT the browser
 * EventSource API). EventSource can't set custom headers, which
 * would force JWTs into the URL query string and leak them into
 * proxy access logs + browser history. Streaming fetch supports
 * `Authorization: Bearer <jwt>` natively, matching every other
 * API route's auth pattern.
 *
 * Returns a Promise that resolves to the final status payload
 * (`status: 'completed'` or `'failed'`). `onProgress(status, data)`
 * fires for every intermediate event with `data.progress` in
 * 0..100 (or null when the pipeline hasn't started writing yet).
 *
 * Resilience:
 *   - 12-minute hard cap via AbortController so a stuck job
 *     can't keep the spinner up forever.
 *   - If the connection drops mid-stream without a terminal event
 *     (server restart, proxy timeout), falls back to a single
 *     GET /status to determine final state.
 *   - JSON-parse failures on individual events are silently
 *     skipped so a single malformed frame doesn't break the loop.
 */
export async function streamMediaProgress(mediaId, { onProgress } = {}) {
  const token = getAuthToken() || ''
  const HARD_TIMEOUT_MS = 12 * 60 * 1000
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), HARD_TIMEOUT_MS)

  try {
    const response = await fetch(
      `${API_BASE}/api/media/${mediaId}/progress-stream`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'text/event-stream',
        },
        signal: controller.signal,
      },
    )

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    if (!response.body) {
      throw new Error('No response body (browser does not support streaming fetch)')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line (\n\n). Split on
      // that boundary and keep the last (potentially incomplete)
      // chunk in the buffer for the next iteration.
      const events = buffer.split('\n\n')
      buffer = events.pop() ?? ''

      for (const evt of events) {
        if (!evt.trim()) continue
        // SSE allows multiple `data: ` lines per event; concat them
        // joined by \n. Our server only ever sends one but the
        // parser handles the standard case for free.
        const dataLines = evt
          .split('\n')
          .filter((l) => l.startsWith('data: '))
          .map((l) => l.slice(6))
        if (!dataLines.length) continue

        let data
        try {
          data = JSON.parse(dataLines.join('\n'))
        } catch {
          continue // malformed event — skip
        }

        // Server-side error sentinel: { error: '...' } with no status
        // means auth/not_found/forbidden. Surface as a rejection.
        if (data.error && !data.status) {
          throw new Error(data.error)
        }

        onProgress?.(data.status, data)

        if (data.status === 'completed' || data.status === 'failed') {
          clearTimeout(timeoutId)
          return data
        }
      }
    }

    // Stream ended cleanly without a terminal event — rare but
    // possible if the server's 15-min cap fires before the pipeline
    // finishes. Fall back to a single /status fetch.
    clearTimeout(timeoutId)
    return await _fallbackStatus(mediaId)
  } catch (err) {
    clearTimeout(timeoutId)

    // 12-minute timeout (AbortController fired)
    if (err.name === 'AbortError') {
      return {
        status: 'failed',
        error: 'Processing timed out (12 min). Try a shorter clip.',
      }
    }

    // Network / server error mid-stream — try /status once before
    // giving up so a transient blip doesn't lose us the result of
    // an analysis that actually completed.
    try {
      return await _fallbackStatus(mediaId)
    } catch {
      throw err
    }
  }
}

async function _fallbackStatus(mediaId) {
  const res = await apiFetch(`${API_BASE}/api/media/${mediaId}/status`)
  if (!res.ok) {
    return { status: 'failed', error: `Status check failed (HTTP ${res.status})` }
  }
  return await res.json()
}

/**
 * Backward-compat shim — exposes the streaming function under the
 * legacy `pollMediaStatus` name so the 5 existing callsites
 * (Upload.jsx, Analyzer.jsx, LiveAnalyzer.jsx, LiveSession.jsx,
 * Result.jsx) keep working without modification. Identical
 * signature: same return shape, same `onProgress(status, data)`
 * callback contract.
 */
export const pollMediaStatus = streamMediaProgress
