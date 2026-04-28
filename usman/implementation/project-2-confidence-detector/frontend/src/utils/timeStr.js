// Shared MM:SS / seconds parsers + formatters.
//
// Used by the trim composer on Upload + Analyzer (multi-segment) and by
// the ranged-comment composer in CommentsThread. Centralizing here
// means a future "support MM:SS.mmm" or "1h2m3s" extension lands in
// one place instead of three.

/**
 * Accepts "MM:SS", "M:SS", "1:23.5", or plain seconds ("83", "83.5").
 * Returns null on any parse failure or empty string so callers can
 * branch with `if (x === null)` instead of try/catch.
 */
export function parseTimeStr(s) {
  if (!s) return null
  const t = String(s).trim()
  if (!t) return null
  if (t.includes(':')) {
    const parts = t.split(':')
    if (parts.length !== 2) return null
    const m = Number(parts[0])
    const sec = Number(parts[1])
    if (!Number.isFinite(m) || !Number.isFinite(sec) || m < 0 || sec < 0 || sec >= 60) {
      return null
    }
    return m * 60 + sec
  }
  const n = Number(t)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** "{m}:{ss}" — clamps to "0:00" on bad input so React never renders NaN. */
export function fmtSecs(s) {
  if (!Number.isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${String(sec).padStart(2, '0')}`
}
