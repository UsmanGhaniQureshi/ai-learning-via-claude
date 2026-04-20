import { useState, useEffect, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:8000/ws/live'

/**
 * Custom hook for WebSocket connection with auto-reconnect.
 * Returns: { scores, isConnected, transcript, tips, sendAudio }
 */
export default function useWebSocket() {
  const [scores, setScores] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [transcript, setTranscript] = useState('')
  const [tips, setTips] = useState([])
  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const reconnectDelay = useRef(1000)
  const mountedRef = useRef(true)

  const connect = useCallback(() => {
    if (!mountedRef.current) return

    try {
      const ws = new WebSocket(WS_URL)
      wsRef.current = ws

      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        setIsConnected(true)
        reconnectDelay.current = 1000 // Reset backoff
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          setScores(data)
          if (data.transcript) setTranscript(data.transcript)
          if (data.tips) setTips(data.tips)
        } catch (e) {
          // Ignore non-JSON messages
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        wsRef.current = null
        // Auto-reconnect with exponential backoff
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(() => {
            reconnectDelay.current = Math.min(reconnectDelay.current * 2, 10000)
            connect()
          }, reconnectDelay.current)
        }
      }

      ws.onerror = () => {
        ws.close()
      }
    } catch (e) {
      // Connection failed, will retry via onclose
    }
  }, [])

  useEffect(() => {
    mountedRef.current = true
    connect()

    return () => {
      mountedRef.current = false
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (wsRef.current) {
        wsRef.current.onclose = null // Prevent reconnect on unmount
        wsRef.current.close()
      }
    }
  }, [connect])

  // Send binary audio data to server
  const sendAudio = useCallback((audioData) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(audioData)
    }
  }, [])

  return { scores, isConnected, transcript, tips, sendAudio }
}
