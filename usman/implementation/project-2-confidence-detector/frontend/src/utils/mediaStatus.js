import { API_BASE, apiFetch } from '../config'

/**
 * Poll GET /api/media/{id}/status until the row reaches a terminal state
 * (`completed` or `failed`). Resolves with the final status payload.
 *
 * Backoff: 1.2s for the first 6 polls (~7s — covers most short clips),
 * then 3s thereafter. We don't poll faster than 1s because the backend
 * reads from Postgres on every request and there's no value in burning
 * a CPU to learn the row is still "processing".
 *
 * Hard timeout: 12 minutes — long enough for an hour-scale upload but
 * a safety net so a stuck job doesn't pin the spinner forever.
 */
export async function pollMediaStatus(mediaId, { onProgress } = {}) {
  const start = Date.now()
  const HARD_TIMEOUT_MS = 12 * 60 * 1000
  let polls = 0
  let lastStatus = null

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
    if (data.status !== lastStatus) {
      lastStatus = data.status
      onProgress?.(data.status, data)
    }
    if (data.status === 'completed' || data.status === 'failed') {
      return data
    }
    polls += 1
    await sleep(polls < 6 ? 1200 : 3000)
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}
