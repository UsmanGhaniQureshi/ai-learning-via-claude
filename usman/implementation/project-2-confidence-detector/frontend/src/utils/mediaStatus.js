import { API_BASE, apiFetch } from '../config'

/**
 * Poll GET /api/media/{id}/status until the row reaches a terminal state
 * (`completed` or `failed`). Resolves with the final status payload.
 *
 * Fix 7: poll every 500 ms so the frames_processed / total_frames
 * progress bar updates smoothly. Previously we backed off to 1.2 s for
 * the first 6 polls then 3 s — which left the user staring at a static
 * spinner for several seconds even when the backend was making
 * visible progress. The status endpoint reads one row from Postgres
 * (and an in-memory dict) per call, so 2 polls/s is well within
 * budget. `onProgress` now fires on EVERY poll (not just status
 * transitions) so the bar can re-render with the latest counters.
 *
 * Hard timeout: 12 minutes — long enough for an hour-scale upload but
 * a safety net so a stuck job doesn't pin the spinner forever.
 */
export async function pollMediaStatus(mediaId, { onProgress } = {}) {
  const start = Date.now()
  const HARD_TIMEOUT_MS = 12 * 60 * 1000
  const POLL_INTERVAL_MS = 500

  while (true) {
    if (Date.now() - start > HARD_TIMEOUT_MS) {
      return { status: 'failed', error: 'Processing timed out (12 min). Try a shorter clip.' }
    }
    let res
    try {
      res = await apiFetch(`${API_BASE}/api/media/${mediaId}/status`)
    } catch {
      // Transient network blip — wait a bit and try again.
      await sleep(2000)
      continue
    }
    if (!res.ok) {
      return { status: 'failed', error: `Status check failed (HTTP ${res.status})` }
    }
    const data = await res.json()
    onProgress?.(data.status, data)
    if (data.status === 'completed' || data.status === 'failed') {
      return data
    }
    await sleep(POLL_INTERVAL_MS)
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
