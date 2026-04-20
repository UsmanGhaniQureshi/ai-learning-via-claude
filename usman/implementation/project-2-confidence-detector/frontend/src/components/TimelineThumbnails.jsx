import { useEffect, useRef, useState } from 'react'

/**
 * useTimelineThumbnails — captures frame thumbnails from a video URL
 * at the given timestamps, entirely in the browser.
 *
 * Sequential-seek approach:
 *   1. Create ONE hidden <video preload="auto" crossOrigin="anonymous">.
 *   2. Wait for `loadeddata` (readyState >= 2) so the first frame is decoded.
 *   3. For each timestamp:
 *        a. Assign video.currentTime.
 *        b. Wait for `seeked`.
 *        c. Use requestVideoFrameCallback if available (fires when the
 *           NEW frame is rendered) — otherwise wait one rAF tick so the
 *           decoded frame is actually on the canvas source.
 *        d. drawImage → canvas → toDataURL.
 *   4. Store the data URL keyed by timestamp.
 *
 * This fixes the common bug where seeks fire `seeked` too early and
 * every drawImage() captures the same (first) frame.
 *
 * Returns: object { [timestamp]: dataUrl } that populates progressively.
 */
export default function useTimelineThumbnails(videoUrl, timestamps, width = 120) {
  const [thumbs, setThumbs] = useState({})
  const cancelledRef = useRef(false)

  useEffect(() => {
    if (!videoUrl || !timestamps || timestamps.length === 0) return
    cancelledRef.current = false
    setThumbs({})

    const video = document.createElement('video')
    video.crossOrigin = 'anonymous'
    video.muted = true
    video.preload = 'auto'
    video.playsInline = true
    video.src = videoUrl

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')

    const waitFor = (event) =>
      new Promise((resolve) => {
        const handler = () => {
          video.removeEventListener(event, handler)
          resolve()
        }
        video.addEventListener(event, handler)
      })

    // rVFC fires when the newly-decoded frame is ready to be read from
    // the video element. Supported in Chrome, Edge, Safari 15.4+, Firefox
    // behind a flag. Fallback: one rAF tick (usually enough).
    const waitForFrame = () =>
      new Promise((resolve) => {
        if (typeof video.requestVideoFrameCallback === 'function') {
          video.requestVideoFrameCallback(() => resolve())
        } else {
          requestAnimationFrame(() => resolve())
        }
      })

    const captureAt = async (ts) => {
      if (cancelledRef.current) return null
      const clamped = Math.max(
        0,
        Math.min(ts, (video.duration || ts) - 0.05)
      )
      // If we're already essentially at this timestamp, seeked may not fire.
      if (Math.abs(video.currentTime - clamped) < 0.001) {
        await waitForFrame()
      } else {
        video.currentTime = clamped
        await waitFor('seeked')
        await waitForFrame()
      }
      if (cancelledRef.current) return null
      try {
        const aspect = video.videoHeight / video.videoWidth || 9 / 16
        canvas.width = width
        canvas.height = Math.round(width * aspect)
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        return canvas.toDataURL('image/jpeg', 0.6)
      } catch (err) {
        // Canvas tainted (CORS) or decoding failure.
        console.warn('thumbnail capture failed at', ts, err)
        return null
      }
    }

    const run = async () => {
      // Wait for video dimensions + first frame before any seek.
      if (video.readyState < 2) {
        await waitFor('loadeddata')
      }
      for (const ts of timestamps) {
        if (cancelledRef.current) break
        const dataUrl = await captureAt(ts)
        if (cancelledRef.current) break
        if (dataUrl) {
          setThumbs((prev) => ({ ...prev, [ts]: dataUrl }))
        }
      }
    }

    run()

    return () => {
      cancelledRef.current = true
      try {
        video.removeAttribute('src')
        video.load()
      } catch {
        // ignore
      }
    }
  }, [videoUrl, JSON.stringify(timestamps), width])

  return thumbs
}
