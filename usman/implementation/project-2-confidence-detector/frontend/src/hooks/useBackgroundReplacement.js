import { useEffect, useRef, useState } from 'react'

/**
 * useBackgroundReplacement — Google-Meet-style virtual backgrounds for
 * the live recording flow.
 *
 * Architecture:
 *   - The raw `getUserMedia` MediaStream is bound to a hidden <video>
 *     element used as the segmenter's frame source.
 *   - A 640×480 off-screen <canvas> runs a requestAnimationFrame loop
 *     that draws either the raw frame (Off mode) or a composite of
 *     "background image / blur" + "foreground person extracted via
 *     MediaPipe Selfie Segmenter".
 *   - `canvas.captureStream(30)` produces a new MediaStream whose
 *     video track is what the live preview, MediaRecorder, and the
 *     existing face-landmarker pipeline consume.
 *   - The original audio track is grafted onto the composited stream
 *     (same underlying MediaStreamTrack — one mic capture path), so
 *     the AudioWorklet on the raw stream and the recorder on the
 *     composited stream stay in sync.
 *
 * Switching mode mid-session is a ref write — `modeRef.current` is
 * read every rAF tick. No pipeline teardown / restart, so the
 * recorded webm captures the transitions verbatim.
 *
 * The canvas is created (and the captureStream is live) IMMEDIATELY
 * in passthrough mode — the recorder doesn't have to wait for the
 * Selfie Segmenter model to download. While the model loads, Blur /
 * Image modes silently fall back to passthrough; the picker UI shows
 * "Loading background filter…" until segmenterReady flips true.
 *
 * Args:
 *   rawStream  the MediaStream from getUserMedia, or null while we
 *              wait for the camera to resolve.
 *   modeRef    a React ref of shape:
 *                { current: { kind: 'off' | 'blur' | 'image',
 *                             image?: HTMLImageElement | null } }
 *              Read once per frame so the picker can mutate it
 *              freely without re-rendering or re-initialising.
 *   options    { width = 640, height = 480, fps = 30 }
 *
 * Returns:
 *   compositedStream  MediaStream | null   — null while raw is null
 *   segmenterReady    boolean              — true once the model has
 *                                            loaded; until then the
 *                                            loop only does passthrough
 *   segmenterError    string | null
 */

const SELFIE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite'
const VISION_WASM =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'

// Feature-detect ctx.filter blur. Safari < 18 doesn't support it; on
// those browsers Blur mode silently falls back to passthrough and the
// picker (consumer) can disable the Blur button via this flag.
function _supportsCanvasFilter() {
  if (typeof document === 'undefined') return false
  try {
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')
    if (!ctx) return false
    ctx.filter = 'blur(2px)'
    return ctx.filter !== 'none' && ctx.filter !== ''
  } catch {
    return false
  }
}

export const SUPPORTS_CANVAS_BLUR = _supportsCanvasFilter()

export default function useBackgroundReplacement(
  rawStream,
  modeRef,
  displayCanvas,
  { width = 640, height = 480, fps = 30 } = {},
) {
  const [compositedStream, setCompositedStream] = useState(null)
  const [segmenterReady, setSegmenterReady] = useState(false)
  const [segmenterError, setSegmenterError] = useState(null)
  // Reactive flag that flips true the moment the hidden raw-camera
  // <video> exists (created inside the effect below). Consumers gate
  // dependents on this — most importantly useFaceDetection, whose
  // effect bails early if videoRef.current is null. Without this
  // flag, useFaceDetection would run once with sourceVideoRef.current
  // still null, bail out, and never re-run because refs aren't a
  // reactive dependency.
  const [sourceVideoReady, setSourceVideoReady] = useState(false)

  // Hidden source video for the segmenter. ALSO exposed via
  // `sourceVideoRef` so the face landmarker (in useFaceDetection)
  // can read raw camera frames directly, bypassing the canvas /
  // captureStream pipeline. That's the second piece of the
  // perceived-latency fix: face landmarks track the user's head with
  // ~1 video frame lag instead of ~3-4 frames through captureStream.
  const inputVideoRef = useRef(null)
  const personCanvasRef = useRef(null)
  const maskCanvasRef = useRef(null)
  const segmenterRef = useRef(null)
  const rafRef = useRef(null)
  // Reusable RGBA buffer so the per-frame mask conversion doesn't
  // churn the GC. Allocated lazily once we know the mask dimensions.
  const scratchRGBARef = useRef(null)

  // The visible display canvas is OPTIONAL and read via this ref so
  // the rAF loop can mirror its frames onto it whenever it's mounted.
  // The compositing pipeline (captureStream → recorder) uses an
  // INTERNAL offscreen canvas that exists for the lifetime of the
  // session — so compositedStream is available the moment rawStream
  // arrives, regardless of when (or whether) the visible canvas
  // mounts. That decoupling is critical: previously the recorder
  // had to poll-then-fall-back to the raw stream because the canvas
  // didn't mount until sessionState='active' was set AFTER recorder
  // start, which meant the recording missed early audio (no
  // transcript) and the recorder was effectively recording the wrong
  // source from t=0.
  const displayCanvasRef = useRef(displayCanvas)
  useEffect(() => {
    displayCanvasRef.current = displayCanvas
  }, [displayCanvas])

  useEffect(() => {
    if (!rawStream) {
      setCompositedStream(null)
      return undefined
    }

    let cancelled = false

    // 1. Hidden source <video> bound to the raw stream. We deliberately
    //    do NOT reuse the visible preview <video> from useLiveSession —
    //    that one is bound to the COMPOSITED stream we're about to
    //    produce, and reading it back would create a feedback loop.
    const inputVideo = document.createElement('video')
    inputVideo.muted = true
    inputVideo.playsInline = true
    inputVideo.autoplay = true
    inputVideo.srcObject = rawStream
    inputVideoRef.current = inputVideo
    inputVideo.play().catch(() => { /* autoplay rejection is benign here */ })
    // Tell consumers (useFaceDetection in particular) that the
    // hidden raw video element now exists, so their effects re-run
    // and pick up sourceVideoRef.current.
    setSourceVideoReady(true)

    // 2. Canvases.
    //    - mainCanvas (offscreen): the captureStream source. Always
    //      created here, lifetime tied to rawStream. Recorder's
    //      composited stream is built from this canvas.
    //    - displayCanvas (optional, from caller): the VISIBLE canvas
    //      the user actually sees. Each tick we copy mainCanvas →
    //      displayCanvas via drawImage. Mounting / unmounting the
    //      display canvas does NOT tear down the captureStream — the
    //      recorder keeps getting frames from mainCanvas.
    //    - personCanvas + maskCanvas: scratch surfaces for the
    //      foreground-masked composite.
    const mainCanvas = document.createElement('canvas')
    mainCanvas.width = width
    mainCanvas.height = height
    const ctx = mainCanvas.getContext('2d')

    const personCanvas = document.createElement('canvas')
    personCanvas.width = width
    personCanvas.height = height
    personCanvasRef.current = personCanvas
    const pctx = personCanvas.getContext('2d')

    const maskCanvas = document.createElement('canvas')
    // Sized lazily once we see the first segmenter result.
    maskCanvasRef.current = maskCanvas

    // Paint a black frame BEFORE captureStream is created so the
    // resulting MediaStreamTrack has a real frame to emit from t=0.
    // Without this, the canvas is fully transparent for the first ~200
    // ms (until the input <video> reaches readyState>=2 and the rAF
    // loop draws a real frame). That gap shows up as a "slow start"
    // in the recorded webm — audio runs but video stalls until the
    // first real frame is encoded.
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, width, height)

    // 3. Build the composited stream IMMEDIATELY in passthrough mode
    //    so the recorder can start without waiting for the segmenter
    //    model to download.
    const canvasStream = mainCanvas.captureStream(fps)
    const composed = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...rawStream.getAudioTracks(),
    ])
    setCompositedStream(composed)

    // 4. Start the rAF loop in passthrough mode. The first tick
    //    happens before the segmenter has loaded, which is fine —
    //    passthrough doesn't need it.
    //
    // Performance strategy: the canvas is repainted on every rAF tick
    // (~60 fps display refresh, 30 fps captureStream), but the
    // segmenter only runs at SEGMENT_INTERVAL_MS cadence (~15 fps).
    // The mask is cached between segmenter runs and reused. The
    // CAMERA frame is fresh on every composite, so the user appears
    // crisp and current; only the silhouette edge is up to ~66 ms
    // stale, which is imperceptible (people don't move pixel-by-pixel
    // between adjacent video frames). This halves segmenter cost,
    // reduces GPU contention with the face landmarker, and removes
    // the perceptible lag the previous "segment every frame" path
    // had on mid-tier hardware.
    const SEGMENT_INTERVAL_MS = 66 // ~15 fps segmentation
    let lastSegmentMs = 0
    let maskReady = false  // becomes true after the first successful segment

    // Mirrors the offscreen mainCanvas onto whatever visible canvas
    // the parent passed in (if any). Called after every compose tick.
    // The display canvas can mount or unmount mid-session — the
    // captureStream / recorder pipeline is unaffected because it
    // sources from mainCanvas.
    const mirrorToDisplay = () => {
      const dest = displayCanvasRef.current
      if (!dest) return
      if (dest.width !== width) dest.width = width
      if (dest.height !== height) dest.height = height
      try {
        const dctx = dest.getContext('2d')
        dctx.drawImage(mainCanvas, 0, 0)
      } catch { /* ignore — canvas might be detached mid-tick */ }
    }

    const tick = () => {
      if (cancelled) return
      rafRef.current = requestAnimationFrame(tick)
      composeFrame()
      mirrorToDisplay()
    }

    const composeFrame = () => {
      const v = inputVideoRef.current
      if (!v || v.readyState < 2) {
        // Input video not ready yet (readyState < HAVE_CURRENT_DATA).
        // Keep painting a black frame so captureStream emits frames
        // at the requested rate from t=0 instead of going silent —
        // otherwise the recorder records audio with no video for
        // the first ~200 ms and the saved webm appears to "fast
        // forward" through that gap on playback.
        ctx.filter = 'none'
        ctx.fillStyle = '#000'
        ctx.fillRect(0, 0, width, height)
        return
      }

      const mode = (modeRef && modeRef.current) || { kind: 'off' }
      const segmenter = segmenterRef.current
      const wantSegmentation =
        (mode.kind === 'blur' || mode.kind === 'image') && segmenter != null

      if (!wantSegmentation) {
        // Off mode OR segmenter not ready yet OR image mode without a
        // loaded image. Pure passthrough — the cheapest possible path.
        ctx.filter = 'none'
        ctx.drawImage(v, 0, 0, width, height)
        return
      }

      // ── Phase 1: refresh the mask if it's due ───────────────────
      // segmentForVideo is synchronous and the returned MPMask must
      // be .close()'d so its WASM-side buffer is freed. We only run
      // it when the throttle says it's time AND keep the previous
      // maskCanvas around between runs.
      const now = performance.now()
      const dueForSegment = !maskReady || (now - lastSegmentMs) >= SEGMENT_INTERVAL_MS
      if (dueForSegment) {
        let result
        try {
          result = segmenter.segmentForVideo(v, now)
        } catch {
          // Transient error — fall through, render passthrough this frame.
          ctx.filter = 'none'
          ctx.drawImage(v, 0, 0, width, height)
          return
        }
        const mpMask = result?.categoryMask
        if (mpMask) {
          try {
            const maskW = mpMask.width
            const maskH = mpMask.height
            const data = mpMask.getAsUint8Array()
            // RGBA bitmap with alpha=255 where the segmenter says
            // "person", 0 elsewhere. Reusing a single buffer avoids
            // per-frame GC.
            //
            // MediaPipe Selfie Segmenter convention (with
            // outputCategoryMask=true): pixel 0 = PERSON, non-zero =
            // BACKGROUND.
            const need = maskW * maskH * 4
            if (!scratchRGBARef.current || scratchRGBARef.current.length !== need) {
              scratchRGBARef.current = new Uint8ClampedArray(need)
            }
            const buf = scratchRGBARef.current
            for (let i = 0, p = 0; i < data.length; i++, p += 4) {
              const isPerson = data[i] === 0
              buf[p] = 255
              buf[p + 1] = 255
              buf[p + 2] = 255
              buf[p + 3] = isPerson ? 255 : 0
            }
            if (maskCanvas.width !== maskW || maskCanvas.height !== maskH) {
              maskCanvas.width = maskW
              maskCanvas.height = maskH
            }
            const mctx = maskCanvas.getContext('2d')
            mctx.putImageData(new ImageData(buf, maskW, maskH), 0, 0)
            maskReady = true
            lastSegmentMs = now
          } finally {
            if (typeof mpMask.close === 'function') mpMask.close()
          }
        }
      }

      // If we still don't have any mask (first segment hasn't
      // completed yet), passthrough the camera so the user keeps
      // seeing themselves.
      if (!maskReady) {
        ctx.filter = 'none'
        ctx.drawImage(v, 0, 0, width, height)
        return
      }

      // ── Phase 2: composite using the latest mask ────────────────
      // Layer 1: background.
      if (mode.kind === 'blur') {
        if (SUPPORTS_CANVAS_BLUR) {
          ctx.filter = 'blur(14px)'
          ctx.drawImage(v, 0, 0, width, height)
          ctx.filter = 'none'
        } else {
          ctx.drawImage(v, 0, 0, width, height)
          return
        }
      } else if (mode.kind === 'image' && mode.image && mode.image.complete) {
        drawImageCover(ctx, mode.image, width, height)
      } else {
        ctx.drawImage(v, 0, 0, width, height)
        return
      }

      // Layer 2: foreground person — fresh camera frame masked by
      // (possibly cached) mask. Person texture stays current; only
      // the silhouette edge can be up to ~66 ms stale.
      pctx.globalCompositeOperation = 'source-over'
      pctx.filter = 'none'
      pctx.clearRect(0, 0, width, height)
      pctx.drawImage(v, 0, 0, width, height)
      pctx.globalCompositeOperation = 'destination-in'
      pctx.imageSmoothingEnabled = true
      // 'medium' upscales fast enough for ~30 fps composite while
      // still giving a softer mask edge than 'low'. 'high' added
      // ~3 ms per frame on mid-tier hardware with no visible benefit
      // for a 256×256 → 640×480 mask upscale.
      pctx.imageSmoothingQuality = 'medium'
      pctx.drawImage(maskCanvas, 0, 0, width, height)
      pctx.globalCompositeOperation = 'source-over'

      ctx.drawImage(personCanvas, 0, 0)
    }
    rafRef.current = requestAnimationFrame(tick)

    // 5. Async-load the segmenter. The rAF loop is already running in
    //    passthrough mode; it'll start using the segmenter the first
    //    frame after segmenterRef.current becomes non-null.
    ;(async () => {
      try {
        const { ImageSegmenter, FilesetResolver } = await import(
          '@mediapipe/tasks-vision'
        )
        if (cancelled) return
        const vision = await FilesetResolver.forVisionTasks(VISION_WASM)
        if (cancelled) return
        const segmenter = await ImageSegmenter.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: SELFIE_MODEL_URL,
            delegate: 'GPU',
          },
          runningMode: 'VIDEO',
          outputCategoryMask: true,
          outputConfidenceMasks: false,
        })
        if (cancelled) {
          try { segmenter.close() } catch { /* ignore */ }
          return
        }
        segmenterRef.current = segmenter
        setSegmenterReady(true)
      } catch (e) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[useBackgroundReplacement] segmenter init failed', e)
          setSegmenterError(
            'Background filter unavailable on this device. Recording without effects.'
          )
        }
      }
    })()

    return () => {
      cancelled = true
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
      if (segmenterRef.current) {
        try { segmenterRef.current.close() } catch { /* ignore */ }
        segmenterRef.current = null
      }
      // Stop the canvas-derived video tracks. The audio tracks we
      // grafted are owned by rawStream — DON'T stop them here, the
      // parent stops the camera tracks centrally on stopSession.
      // The displayCanvas itself is owned by the parent — we don't
      // null its dimensions or remove it from the DOM.
      try { canvasStream.getTracks().forEach((t) => t.stop()) } catch { /* ignore */ }
      try {
        if (inputVideo.srcObject) inputVideo.srcObject = null
        inputVideo.pause()
      } catch { /* ignore */ }
      inputVideoRef.current = null
      personCanvasRef.current = null
      maskCanvasRef.current = null
      scratchRGBARef.current = null
      setCompositedStream(null)
      setSegmenterReady(false)
      setSegmenterError(null)
      setSourceVideoReady(false)
    }
    // We intentionally exclude `width / height / fps / displayCanvas`
    // from deps. The first three are configuration. `displayCanvas` is
    // read via `displayCanvasRef` inside the rAF loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawStream, modeRef])

  return {
    compositedStream,
    segmenterReady,
    segmenterError,
    // The hidden raw camera <video> element. Exposed so the face
    // landmarker can read camera frames directly instead of going
    // through the visible canvas (which would add a frame of lag
    // and waste GPU on a redundant re-sample).
    sourceVideoRef: inputVideoRef,
    // Reactive boolean — true once sourceVideoRef.current exists.
    // Consumers use this as a gate to ensure their effects re-run
    // at the moment the hidden video becomes available.
    sourceVideoReady,
  }
}

// ─────────────────────────── helpers ───────────────────────────

function drawImageCover(ctx, img, dstW, dstH) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  if (!iw || !ih) return
  const ar = iw / ih
  const targetAr = dstW / dstH
  let sx, sy, sw, sh
  if (ar > targetAr) {
    sh = ih
    sw = sh * targetAr
    sx = (iw - sw) / 2
    sy = 0
  } else {
    sw = iw
    sh = sw / targetAr
    sx = 0
    sy = (ih - sh) / 2
  }
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, dstW, dstH)
}
