import { useState, useEffect, useRef } from 'react'

/**
 * Custom hook to capture microphone audio via getUserMedia,
 * downsample to 16kHz mono PCM, and send chunks via callback.
 *
 * @param {Function} onAudioChunk - called with ArrayBuffer of 16-bit PCM data (~250ms chunks)
 * @param {boolean} active - whether to capture audio
 * @returns {{ isCapturing, error, hasPermission }}
 */
export default function useAudioCapture(onAudioChunk, active = false) {
  const [isCapturing, setIsCapturing] = useState(false)
  const [error, setError] = useState(null)
  const [hasPermission, setHasPermission] = useState(null)
  const streamRef = useRef(null)
  const contextRef = useRef(null)
  const processorRef = useRef(null)

  useEffect(() => {
    if (!active) {
      cleanup()
      return
    }

    let cancelled = false

    async function startCapture() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            sampleRate: 16000,
            channelCount: 1,
            echoCancellation: true,
            noiseSuppression: true,
          }
        })

        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }

        setHasPermission(true)
        streamRef.current = stream

        // Create audio context at 16kHz if possible, otherwise resample
        const ctx = new (window.AudioContext || window.webkitAudioContext)({
          sampleRate: 16000,
        })
        contextRef.current = ctx

        const source = ctx.createMediaStreamSource(stream)

        // ScriptProcessorNode: buffer size 4096 (~256ms at 16kHz)
        const processor = ctx.createScriptProcessor(4096, 1, 1)
        processorRef.current = processor

        processor.onaudioprocess = (e) => {
          const inputData = e.inputBuffer.getChannelData(0)

          // Convert float32 [-1,1] to int16
          const pcm16 = new Int16Array(inputData.length)
          for (let i = 0; i < inputData.length; i++) {
            const s = Math.max(-1, Math.min(1, inputData[i]))
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
          }

          if (onAudioChunk) {
            onAudioChunk(pcm16.buffer)
          }
        }

        source.connect(processor)
        processor.connect(ctx.destination)

        setIsCapturing(true)
        setError(null)
      } catch (err) {
        if (!cancelled) {
          setHasPermission(false)
          setError(err.message || 'Microphone access denied')
          setIsCapturing(false)
        }
      }
    }

    startCapture()

    return () => {
      cancelled = true
      cleanup()
    }
  }, [active, onAudioChunk])

  function cleanup() {
    if (processorRef.current) {
      processorRef.current.disconnect()
      processorRef.current = null
    }
    if (contextRef.current) {
      contextRef.current.close().catch(() => {})
      contextRef.current = null
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    setIsCapturing(false)
  }

  return { isCapturing, error, hasPermission }
}
