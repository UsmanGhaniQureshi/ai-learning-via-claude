import { useEffect, useRef, useState } from 'react'

/**
 * Browser-side face + pose detection using MediaPipe.
 *
 * Two MediaPipe models load in parallel:
 *   - FaceLandmarker (with blendshapes) → eye contact, expression, tension
 *   - PoseLandmarker → hand_position label (raised/mid/low/not visible)
 *
 * Mirrors backend/face_engine.py logic so live and post-session scores
 * agree. Hand position is the key one for "live gesture feedback" — we
 * don't run pose on the backend during a live session (the server only
 * receives audio over WS), so the browser is the only place this can
 * happen during practice.
 *
 * Performance: at ~150 ms intervals (6-7 Hz) the combined cost is
 * ~30-60 ms per tick — manageable on the main thread. Future move to
 * a Web Worker would let us push this to 30 Hz without UI jank.
 */
const DETECTION_INTERVAL_MS = 150

export default function useFaceDetection(videoRef, active) {
  const [faceScores, setFaceScores] = useState({
    eye_contact: 50,
    expression: 50,
    tension: 50,
    face_detected: false,
    expression_label: 'neutral',
    hand_position: 'unknown',
  })

  const faceLmRef = useRef(null)
  const poseLmRef = useRef(null)
  const intervalRef = useRef(null)
  const eyeContactHistoryRef = useRef([])
  const poseHistoryRef = useRef([])
  const mountedRef = useRef(true)

  // Raw MediaPipe output from the most recent tick — landmarks +
  // blendshapes. Exposed via the returned object so useLiveSession
  // can ship them to the backend in face WS messages, where the
  // canonical FaceEngine reproduces the upload-side baseline-aware
  // scoring (Batch 4). Held in a ref (not state) because it changes
  // every 150 ms and we don't want a re-render per tick.
  const rawFaceRef = useRef({ landmarks: null, blendshapes: null, timestamp: 0 })

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!active || !videoRef.current) {
      return
    }

    let cancelled = false

    async function init() {
      try {
        const { FaceLandmarker, PoseLandmarker, FilesetResolver } = await import(
          '@mediapipe/tasks-vision'
        )

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
        )

        // Both models load in parallel — saves ~500 ms on session start.
        const [faceLm, poseLm] = await Promise.all([
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
              delegate: 'GPU',
            },
            outputFaceBlendshapes: true,
            runningMode: 'VIDEO',
            numFaces: 1,
          }),
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: {
              modelAssetPath:
                'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
              delegate: 'GPU',
            },
            // Lite is plenty for hand-position labelling — heavy + full
            // models cost 2-4× more for a difference we don't use.
            runningMode: 'VIDEO',
            numPoses: 1,
            // Lower threshold so seated users (lower body off-screen,
            // shoulders close to torso line) still register.
            minPoseDetectionConfidence: 0.4,
            minPosePresenceConfidence: 0.4,
          }),
        ])

        if (cancelled) {
          faceLm.close()
          poseLm.close()
          return
        }

        faceLmRef.current = faceLm
        poseLmRef.current = poseLm
        startInterval()
      } catch (e) {
        // PoseLandmarker can fail to load on older Safari/iOS — log and
        // continue with face-only signals so the session isn't dead.
        console.error('MediaPipe init failed:', e)
      }
    }

    function startInterval() {
      // setInterval rather than requestAnimationFrame: rAF fires at the
      // display rate (60 Hz typical) and piggy-backs on the browser's
      // paint pipeline, so heavy detection work inside the callback
      // slows every frame. A fixed-cadence setInterval is independent
      // of paint and cleanly capped at the chosen rate regardless of
      // what the display is doing.
      intervalRef.current = setInterval(tick, DETECTION_INTERVAL_MS)
    }

    function tick() {
      if (cancelled || !faceLmRef.current || !videoRef.current) return
      const video = videoRef.current
      // Skip if the video element isn't ready to deliver frames
      // (HAVE_CURRENT_DATA = 2). Retry on the next tick.
      if (video.readyState < 2) return
      const ts = performance.now()
      let faceResult = null
      let poseResult = null
      try {
        faceResult = faceLmRef.current.detectForVideo(video, ts)
      } catch {
        // Transient MediaPipe / video-frame mismatch — skip this tick.
      }
      // Pose runs even when face fails; we still want a hand_position
      // signal as long as the body is in frame.
      if (poseLmRef.current) {
        try {
          poseResult = poseLmRef.current.detectForVideo(video, ts)
        } catch { /* ignore */ }
      }
      processResults(faceResult, poseResult)
    }

    function classifyHandPosition(poseResult) {
      // Mirrors backend/face_engine._detect_posture's hand-position
      // logic: takes left+right wrist + shoulder normalised y, returns
      // a coarse label. No bounding box needed — y is in [0,1] image
      // coordinates so it's resolution-independent.
      if (!poseResult || !poseResult.landmarks || poseResult.landmarks.length === 0) {
        return 'unknown'
      }
      const lm = poseResult.landmarks[0]
      // MediaPipe pose-landmark indices: 11=L shoulder, 12=R shoulder,
      // 15=L wrist, 16=R wrist. .visibility is a confidence in [0,1].
      const lW = lm[15]
      const rW = lm[16]
      const lS = lm[11]
      const rS = lm[12]
      const handsVisible = (lW?.visibility ?? 0) > 0.5 || (rW?.visibility ?? 0) > 0.5
      if (!handsVisible) return 'not visible'
      const avgHandY = ((lW?.y ?? 1) + (rW?.y ?? 1)) / 2
      const avgShoulderY = ((lS?.y ?? 0.5) + (rS?.y ?? 0.5)) / 2
      // y grows downward in image coords. "Above shoulders" = smaller y.
      if (avgHandY < avgShoulderY - 0.05) return 'gesturing'
      if (avgHandY < avgShoulderY + 0.15) return 'mid-level'
      return 'low/resting'
    }

    function classifyPosture(poseResult) {
      if (!poseResult || !poseResult.landmarks || poseResult.landmarks.length === 0) {
        return 'unknown'
      }
      const lm = poseResult.landmarks[0]
      const lS = lm[11], rS = lm[12], lH = lm[23], rH = lm[24]
      if (!lS || !rS) return 'unknown'
      const shoulderAxis = Math.atan2(rS.y - lS.y, rS.x - lS.x)
      const hipsVisible = (lH?.visibility ?? 1.0) > 0.4 && (rH?.visibility ?? 1.0) > 0.4
      let shoulderTilt
      if (hipsVisible) {
        const hipAxis = Math.atan2(rH.y - lH.y, rH.x - lH.x)
        let rel = Math.abs(shoulderAxis - hipAxis)
        if (rel > Math.PI) rel = 2 * Math.PI - rel
        shoulderTilt = rel
      } else {
        shoulderTilt = Math.abs(lS.y - rS.y)
      }
      const shoulderWidth = Math.hypot(lS.x - rS.x, lS.y - rS.y)
      let torsoHeight = 0
      if (hipsVisible) {
        const midShoulder = [(lS.x + rS.x) / 2, (lS.y + rS.y) / 2]
        const midHip = [(lH.x + rH.x) / 2, (lH.y + rH.y) / 2]
        torsoHeight = Math.hypot(midShoulder[0] - midHip[0], midShoulder[1] - midHip[1])
      }
      if (shoulderTilt > 0.30) return 'tilted'
      if (hipsVisible && shoulderWidth > 0 && torsoHeight / shoulderWidth < 1.1) return 'slouching'
      if (!hipsVisible && shoulderWidth < 0.1) return 'slouching'
      return 'upright'
    }

    function computeFidget(poseResult) {
      if (!poseResult || !poseResult.landmarks || poseResult.landmarks.length === 0) {
        return 0
      }
      const lm = poseResult.landmarks[0]
      const lS = lm[11], rS = lm[12]
      if (!lS || !rS) return 0
      const current = {
        l_shoulder: [lS.x, lS.y],
        r_shoulder: [rS.x, rS.y],
      }
      const hist = poseHistoryRef.current
      hist.push(current)
      if (hist.length > 30) hist.shift()
      if (hist.length < 10) return 0
      const oldLong = hist[hist.length - 10]
      const oldShort = hist[hist.length - 3]
      let shortMove = 0
      let longMove = 0
      for (const key of ['l_shoulder', 'r_shoulder']) {
        shortMove += Math.hypot(
          current[key][0] - oldShort[key][0],
          current[key][1] - oldShort[key][1],
        )
        longMove += Math.hypot(
          current[key][0] - oldLong[key][0],
          current[key][1] - oldLong[key][1],
        )
      }
      const jerkiness = shortMove / (longMove + 0.01)
      if (shortMove > 0.03 && jerkiness > 1.2) {
        return Math.min(100, Math.round((shortMove - 0.03) * 400))
      }
      return 0
    }

    function processResults(faceResult, poseResult) {
      if (!mountedRef.current) return

      const handPosition = classifyHandPosition(poseResult)
      const posture = classifyPosture(poseResult)
      const fidgetScore = computeFidget(poseResult)

      const hasFace = faceResult && faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0
      const hasBlendshapes =
        faceResult && faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0

      if (!hasFace || !hasBlendshapes) {
        // Even with no face, still publish hand_position so the gesture
        // badge keeps working. face-dependent fields fall back to last.
        rawFaceRef.current = { landmarks: null, blendshapes: null, timestamp: 0 }
        setFaceScores((prev) => ({
          ...prev,
          face_detected: false,
          hand_position: handPosition,
          posture,
          fidget_score: fidgetScore,
        }))
        return
      }

      // Stash the RAW MediaPipe output for the WS to ship to the
      // backend. The map flattens MediaPipe's `categories` array into
      // [{categoryName, score}, ...] so the wire shape matches the
      // backend's _BlendshapeShim. Landmarks already have {x, y, z}.
      rawFaceRef.current = {
        landmarks: faceResult.faceLandmarks[0].map(p => ({ x: p.x, y: p.y, z: p.z })),
        blendshapes: faceResult.faceBlendshapes[0].categories.map(
          c => ({ categoryName: c.categoryName, score: c.score })
        ),
        timestamp: performance.now() / 1000,
      }

      // Build blendshape lookup
      const bs = {}
      for (const c of faceResult.faceBlendshapes[0].categories) {
        bs[c.categoryName] = c.score
      }

      // --- Eye contact (mirror backend/face_engine.py:_detect_eye_contact) ---
      const lookDown =
        ((bs.eyeLookDownLeft || 0) + (bs.eyeLookDownRight || 0)) / 2
      const lookUp = ((bs.eyeLookUpLeft || 0) + (bs.eyeLookUpRight || 0)) / 2
      const lookIn = ((bs.eyeLookInLeft || 0) + (bs.eyeLookInRight || 0)) / 2
      const lookOut =
        ((bs.eyeLookOutLeft || 0) + (bs.eyeLookOutRight || 0)) / 2
      const maxLook = Math.max(lookDown, lookUp, lookIn, lookOut)
      const looking = maxLook < 0.55

      const hist = eyeContactHistoryRef.current
      hist.push(looking ? 1 : 0)
      if (hist.length > 30) hist.shift()
      const eyeContactPct = Math.round(
        (hist.reduce((a, b) => a + b, 0) / hist.length) * 100
      )

      setFaceScores({
        eye_contact: eyeContactPct,
        face_detected: true,
        hand_position: handPosition,
        posture,
        fidget_score: fidgetScore,
      })
    }

    init()

    return () => {
      cancelled = true
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
      if (faceLmRef.current) {
        try { faceLmRef.current.close() } catch { /* ignore */ }
        faceLmRef.current = null
      }
      if (poseLmRef.current) {
        try { poseLmRef.current.close() } catch { /* ignore */ }
        poseLmRef.current = null
      }
      eyeContactHistoryRef.current = []
      poseHistoryRef.current = []
      rawFaceRef.current = { landmarks: null, blendshapes: null, timestamp: 0 }
    }
  }, [active, videoRef])

  // Returning the raw ref alongside the smoothed-state object lets
  // the parent ship raw landmarks to the backend WHILE still using
  // the in-browser derived `faceScores` for snappy local UI bits
  // (gesture badge, calibration spinner). The two stay in sync —
  // both update on the same MediaPipe tick.
  faceScores._rawFaceRef = rawFaceRef
  return faceScores
}
