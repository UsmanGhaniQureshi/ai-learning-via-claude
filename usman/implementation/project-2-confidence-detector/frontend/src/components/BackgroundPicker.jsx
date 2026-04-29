import { useEffect, useRef, useState } from 'react'
import { SUPPORTS_CANVAS_BLUR } from '../hooks/useBackgroundReplacement'

/**
 * BackgroundPicker — toolbar overlay on the live camera card.
 *
 * Shows: Off / Blur / 3 Unsplash preset thumbnails / Custom upload.
 * Clicking any tile calls onChange({kind, image?}) — the parent
 * mirrors the value into both React state (for visual selection) and
 * the modeRef the rAF compositing loop reads. So switching while
 * recording is instant: no state cascade, no pipeline restart.
 *
 * Persistence: the user's last choice is stored in localStorage key
 * `cd_bg_mode_v1`. Presets are persisted by `presetId` only (the URL
 * is recovered from PRESETS at load time). Custom uploads are
 * persisted as a base64 data URL ONLY when the file is small enough
 * (< 800 KB) — bigger uploads stay in memory for the session and
 * disappear on reload, with a small warning shown at upload time.
 *
 * Loading state: the parent passes `segmenterReady`. Until it's
 * true, the Blur and image options stay clickable but the rAF loop
 * silently passthroughs them — we render a "Loading background
 * filter…" pill on the toolbar to explain. That keeps the UX
 * responsive (you can pre-pick a background while the model loads
 * and have it apply the moment it's ready).
 */

// Preset images live on Unsplash's image CDN. These are stable
// numeric IDs; the URL format `images.unsplash.com/photo-<id>` has
// been stable for years. If a preset 404s, the picker silently
// disables that tile via Image.onerror.
const PRESETS = [
  {
    id: 'office',
    label: 'Office',
    src: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1280&q=70',
  },
  {
    id: 'library',
    label: 'Library',
    src: 'https://images.unsplash.com/photo-1568667256549-094345857637?auto=format&fit=crop&w=1280&q=70',
  },
  {
    id: 'studio',
    label: 'Studio',
    src: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1280&q=70',
  },
]

const STORAGE_KEY = 'cd_bg_mode_v1'
const CUSTOM_PERSIST_MAX_BYTES = 800 * 1024 // 800 KB
const CUSTOM_REJECT_MAX_BYTES = 5 * 1024 * 1024 // 5 MB
const MAX_PIXELS = 4096 * 4096

function loadPersisted() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function persist(saved) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(saved)) } catch { /* ignore quota */ }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // crossOrigin so the canvas doesn't go tainted on Unsplash CDN.
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      if (img.naturalWidth * img.naturalHeight > MAX_PIXELS) {
        reject(new Error('Image is too large (over 4096×4096).'))
        return
      }
      resolve(img)
    }
    img.onerror = () => reject(new Error('Failed to load image.'))
    img.src = src
  })
}

export default function BackgroundPicker({
  mode,
  onChange,
  segmenterReady = false,
  segmenterError = null,
  className = '',
}) {
  const [presetImages, setPresetImages] = useState({})    // id -> HTMLImageElement
  const [presetFailed, setPresetFailed] = useState({})    // id -> true
  const [customImage, setCustomImage] = useState(null)    // HTMLImageElement | null
  const [customMessage, setCustomMessage] = useState(null) // user-facing string
  const fileInputRef = useRef(null)
  const restoredRef = useRef(false)

  // Preload all presets in parallel. Each tile is enabled the moment
  // its own image resolves; failures grey out only that one tile.
  useEffect(() => {
    let cancelled = false
    PRESETS.forEach((p) => {
      loadImage(p.src).then(
        (img) => {
          if (cancelled) return
          setPresetImages((cur) => ({ ...cur, [p.id]: img }))
        },
        () => {
          if (cancelled) return
          setPresetFailed((cur) => ({ ...cur, [p.id]: true }))
        },
      )
    })
    return () => { cancelled = true }
  }, [])

  // Restore the user's last selection ONCE, after the relevant
  // image has finished loading. We don't auto-restore on every
  // re-render — only the first time the appropriate image becomes
  // available.
  useEffect(() => {
    if (restoredRef.current) return
    const saved = loadPersisted()
    if (!saved) {
      restoredRef.current = true
      return
    }
    if (saved.kind === 'off') {
      restoredRef.current = true
      onChange({ kind: 'off', image: null })
      return
    }
    if (saved.kind === 'blur') {
      restoredRef.current = true
      onChange({ kind: 'blur', image: null })
      return
    }
    if (saved.kind === 'image' && saved.presetId) {
      const img = presetImages[saved.presetId]
      if (img) {
        restoredRef.current = true
        onChange({ kind: 'image', image: img, presetId: saved.presetId })
      }
      return  // wait for the preset to load on a subsequent tick
    }
    if (saved.kind === 'image' && saved.customDataUrl) {
      restoredRef.current = true
      loadImage(saved.customDataUrl).then(
        (img) => {
          setCustomImage(img)
          onChange({ kind: 'image', image: img, custom: true })
        },
        () => { /* corrupt data URL — ignore */ },
      )
      return
    }
    restoredRef.current = true
  }, [presetImages, onChange])

  function selectOff() {
    onChange({ kind: 'off', image: null })
    persist({ kind: 'off' })
  }
  function selectBlur() {
    onChange({ kind: 'blur', image: null })
    persist({ kind: 'blur' })
  }
  function selectPreset(p) {
    const img = presetImages[p.id]
    if (!img) return
    onChange({ kind: 'image', image: img, presetId: p.id })
    persist({ kind: 'image', presetId: p.id })
  }
  function selectCustom(img, dataUrl, fileSize) {
    setCustomImage(img)
    onChange({ kind: 'image', image: img, custom: true })
    if (fileSize <= CUSTOM_PERSIST_MAX_BYTES && dataUrl) {
      persist({ kind: 'image', customDataUrl: dataUrl })
      setCustomMessage(null)
    } else {
      // Don't persist — too large. Tell the user.
      try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
      setCustomMessage("Background applied — but it's too big to save across reloads.")
    }
  }

  async function handleFile(e) {
    const file = e.target.files && e.target.files[0]
    e.target.value = ''  // reset so picking the same file again still fires
    if (!file) return
    setCustomMessage(null)

    if (file.size > CUSTOM_REJECT_MAX_BYTES) {
      setCustomMessage('Image too large (over 5 MB). Pick a smaller one.')
      return
    }
    if (!file.type.startsWith('image/')) {
      setCustomMessage('Please choose an image file.')
      return
    }

    // Read once as data URL so we can both decode + (optionally) persist.
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(new Error('Could not read file.'))
      reader.readAsDataURL(file)
    }).catch((err) => {
      setCustomMessage(err.message || 'Could not read file.')
      return null
    })
    if (!dataUrl) return

    let img
    try {
      img = await loadImage(dataUrl)
    } catch (err) {
      setCustomMessage(err.message || 'Image failed to decode.')
      return
    }
    selectCustom(img, dataUrl, file.size)
  }

  // Active-state predicate for each tile so the styling stays in sync
  // with whatever the parent's mode is.
  const isActive = (kind, presetId) => {
    if (mode?.kind !== kind) return false
    if (kind !== 'image') return true
    if (presetId) return mode.presetId === presetId
    return mode.custom === true
  }

  const blurDisabled = !SUPPORTS_CANVAS_BLUR
  const imageWillNotApplyYet = !segmenterReady

  return (
    <div
      className={
        'glass-card p-2 flex items-center gap-1.5 flex-wrap ' +
        'bg-[rgba(0,0,0,0.55)] backdrop-blur-sm border border-border ' +
        className
      }
      // Stop clicks bubbling so the surrounding camera card never
      // intercepts them (e.g. for fullscreen toggles in future).
      onClick={(e) => e.stopPropagation()}
    >
      <PillButton active={isActive('off')} onClick={selectOff} title="No background replacement">
        Off
      </PillButton>
      <PillButton
        active={isActive('blur')}
        onClick={selectBlur}
        disabled={blurDisabled}
        title={
          blurDisabled
            ? 'Blur requires a newer browser (Safari 18+ / recent Chrome / Firefox).'
            : 'Blur the background, keep the person sharp'
        }
      >
        Blur
      </PillButton>

      {PRESETS.map((p) => {
        const img = presetImages[p.id]
        const failed = presetFailed[p.id]
        const ready = !!img && !failed
        return (
          <button
            key={p.id}
            type="button"
            onClick={() => selectPreset(p)}
            disabled={!ready}
            title={
              failed
                ? `${p.label} preset couldn’t load`
                : !ready
                  ? `${p.label} preset is loading…`
                  : p.label
            }
            className={
              'w-10 h-10 rounded-md border bg-cover bg-center transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed ' +
              (isActive('image', p.id)
                ? 'border-accent ring-2 ring-accent shadow-glow'
                : 'border-border hover:border-border-accent')
            }
            style={ready ? { backgroundImage: `url(${p.src})` } : undefined}
            aria-label={p.label}
          >
            {!ready && !failed && (
              <span className="text-[10px] text-text-muted">…</span>
            )}
          </button>
        )
      })}

      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        title="Upload your own background image"
        className={
          'w-10 h-10 rounded-md border border-dashed flex items-center justify-center text-lg transition-all duration-150 ' +
          (mode?.kind === 'image' && mode.custom
            ? 'border-accent ring-2 ring-accent shadow-glow text-accent'
            : 'border-border text-text-muted hover:border-border-accent hover:text-text-primary')
        }
        aria-label="Upload custom background"
      >
        +
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        hidden
        onChange={handleFile}
      />

      {/* Status hint pinned to the right side */}
      {(segmenterError || imageWillNotApplyYet || customMessage) && (
        <div className="ml-auto pl-2 text-xs text-text-muted italic max-w-[40ch] text-right leading-tight">
          {segmenterError
            ? segmenterError
            : customMessage
              ? customMessage
              : 'Loading background filter…'}
        </div>
      )}
    </div>
  )
}

function PillButton({ active, disabled, onClick, title, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={
        'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed ' +
        (active
          ? 'bg-accent text-white shadow-glow'
          : 'bg-card text-text-secondary border border-border hover:border-border-accent hover:text-text-primary')
      }
    >
      {children}
    </button>
  )
}
