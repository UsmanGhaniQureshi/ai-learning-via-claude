/**
 * Map a Whisper language code (ISO 639-1, e.g. "es", "fr") to a
 * display name. Uses the browser-native Intl.DisplayNames where
 * available — covers ~150 languages without us shipping a table.
 *
 * Falls back to the raw code for unknown values rather than blanking
 * out (an unknown code is still informative on screen).
 */
export function languageDisplayName(code) {
  if (!code) return ''
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' })
    const name = dn.of(code)
    if (name) return name
  } catch {
    /* Intl.DisplayNames not supported (very old browsers) — fall through */
  }
  return code
}
