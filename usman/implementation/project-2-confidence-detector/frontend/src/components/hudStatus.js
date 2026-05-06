/**
 * Shared status maps for the Live HUD (during recording) and the
 * Result HUD (during playback).
 *
 * Backend produces per-chunk status enums:
 *   "excellent" | "good" | "fair" | "poor" | null
 *
 * Frontend renders them with the existing Tailwind badge palette
 * (declared in tailwind.config.js); no new colours are introduced.
 */

// 4-tier mapping for the status badges shown on each signal card.
export const STATUS_BADGE = {
  excellent: 'badge-success',
  good: 'badge-accent',
  fair: 'badge-warning',
  poor: 'badge-danger',
}

// Background-colour token for the small status dots and the progress
// bar fill. Mirrors the badge text colour so dot + badge feel like
// the same indicator.
export const STATUS_DOT_BG = {
  excellent: 'bg-success',
  good: 'bg-accent',
  fair: 'bg-warning',
  poor: 'bg-danger',
}

// Capitalised user-facing label.
export const STATUS_LABEL = {
  excellent: 'Excellent',
  good: 'Good',
  fair: 'Fair',
  poor: 'Poor',
}

// Comparator rank — `min(scoreable, key=...)` picks the worst.
// Higher number = better tier.
export const STATUS_RANK = {
  poor: 0,
  fair: 1,
  good: 2,
  excellent: 3,
}

// Coaching nudges keyed by the worst-signal name. The "all good" case
// rotates encouragement strings instead.
export const NUDGE_BY_SIGNAL = {
  detection: 'Keep your face visible to the camera',
  voice_pitch: 'Vary your pitch — avoid monotone',
  noise_level: 'Move to a quieter space',
  speech_pace: 'Adjust your speaking pace',
}

export const ENCOURAGEMENT_NUDGES = ['Keep going', 'Good energy', 'Stay relaxed']

// Tier → 0-100 progress fill width. Used by both HUDs' thin bar.
export const STATUS_FILL_WIDTH = {
  excellent: '100%',
  good: '70%',
  fair: '40%',
  poor: '15%',
}
