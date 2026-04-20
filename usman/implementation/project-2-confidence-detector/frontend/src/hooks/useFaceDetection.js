import { useEffect, useRef, useState } from 'react'

/**
 * Browser-side face detection using MediaPipe FaceLandmarker.
 * Analyzes video element and returns scores every ~100ms.
 *
 * Mirrors backend/face_engine.py logic: blendshape-based expression,
 * eye contact, and tension detection — but runs locally in the browser.
 */
export default function useFaceDetection(videoRef, active) {
  const [faceScores, setFaceScores] = useState({
    eye_contact: 50,
    expression: 50,
    tension: 50,
    face_detected: false,
    expression_label: 'neutral',
  })

  const landmarkerRef = useRef(null)
  const rafRef = useRef(null)
  const eyeContactHistoryRef = useRef([])
  const mountedRef = useRef(true)

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
        const { FaceLandmarker, FilesetResolver } = await import(
          '@mediapipe/tasks-vision'
        )

        const vision = await FilesetResolver.forVisionTasks(
          'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21/wasm'
        )

        const landmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath:
              'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/latest/face_landmarker.task',
            delegate: 'GPU',
          },
          outputFaceBlendshapes: true,
          runningMode: 'VIDEO',
          numFaces: 1,
        })

        if (cancelled) {
          landmarker.close()
          return
        }

        landmarkerRef.current = landmarker
        detectLoop()
      } catch (e) {
        console.error('FaceLandmarker init failed:', e)
      }
    }

    function detectLoop() {
      if (cancelled || !landmarkerRef.current || !videoRef.current) return

      const video = videoRef.current
      if (video.readyState < 2) {
        rafRef.current = requestAnimationFrame(detectLoop)
        return
      }

      const now = performance.now()
      try {
        const result = landmarkerRef.current.detectForVideo(video, now)
        processResult(result)
      } catch (e) {
        // Frame skip on transient errors
      }

      rafRef.current = requestAnimationFrame(detectLoop)
    }

    function processResult(result) {
      if (!mountedRef.current) return

      const hasFace = result.faceLandmarks && result.faceLandmarks.length > 0
      const hasBlendshapes =
        result.faceBlendshapes && result.faceBlendshapes.length > 0

      if (!hasFace || !hasBlendshapes) {
        setFaceScores((prev) => ({ ...prev, face_detected: false }))
        return
      }

      // Build blendshape lookup
      const bs = {}
      for (const c of result.faceBlendshapes[0].categories) {
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

      // --- Expression (simplified from backend/face_engine.py:_detect_expression) ---
      const squint =
        ((bs.eyeSquintLeft || 0) + (bs.eyeSquintRight || 0)) / 2
      const smile =
        ((bs.mouthSmileLeft || 0) + (bs.mouthSmileRight || 0)) / 2
      const browDown =
        ((bs.browDownLeft || 0) + (bs.browDownRight || 0)) / 2
      const jawOpen = bs.jawOpen || 0
      const mouthPucker = bs.mouthPucker || 0
      const mouthFrown =
        ((bs.mouthFrownLeft || 0) + (bs.mouthFrownRight || 0)) / 2

      let exprLabel = 'neutral'
      let exprScore = 60
      if (smile > 0.3 && squint > 0.1) {
        exprLabel = 'happy'
        exprScore = 90
      } else if (jawOpen > 0.2) {
        exprLabel = 'speaking'
        exprScore = 80
      } else if (browDown > 0.25 && mouthPucker < 0.1) {
        exprLabel = 'focused'
        exprScore = 70
      } else if (mouthFrown > 0.15) {
        exprLabel = 'sad'
        exprScore = 30
      } else if (browDown > 0.4 && mouthPucker > 0.15) {
        exprLabel = 'angry'
        exprScore = 20
      }

      // --- Tension (mirror backend/face_engine.py:_detect_tension) ---
      const tensionRaw =
        browDown * 400 + mouthPucker * 200 + mouthFrown * 300
      const tensionScore = Math.max(0, Math.min(100, Math.round(tensionRaw)))

      setFaceScores({
        eye_contact: eyeContactPct,
        expression: exprScore,
        tension: tensionScore,
        face_detected: true,
        expression_label: exprLabel,
      })
    }

    init()

    return () => {
      cancelled = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (landmarkerRef.current) {
        try {
          landmarkerRef.current.close()
        } catch (e) {
          // ignore
        }
        landmarkerRef.current = null
      }
      eyeContactHistoryRef.current = []
    }
  }, [active, videoRef])

  return faceScores
}
