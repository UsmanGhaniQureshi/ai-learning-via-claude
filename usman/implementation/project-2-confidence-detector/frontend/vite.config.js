import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

function splitCsv(value) {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const backendTarget = env.VITE_API_URL || 'http://127.0.0.1:8000'
  const allowedHosts = Array.from(
    new Set([
      'b522-182-185-172-135.ngrok-free.app',
      ...splitCsv(env.VITE_ALLOWED_HOSTS),
      ...splitCsv(env.__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS),
    ]),
  )
  const allowedCorsOrigins = [
    /^https?:\/\/(?:(?:[^:]+\.)?localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/,
    ...allowedHosts.map((host) => new RegExp(`^https://${escapeRegex(host)}$`)),
  ]
  const proxy = {
    '/api': {
      target: backendTarget,
      changeOrigin: true,
    },
    '/health': {
      target: backendTarget,
      changeOrigin: true,
    },
    '/openapi.json': {
      target: backendTarget,
      changeOrigin: true,
    },
    '/docs': {
      target: backendTarget,
      changeOrigin: true,
    },
    '/ws': {
      target: backendTarget.replace(/^http/, 'ws'),
      changeOrigin: true,
      ws: true,
    },
  }

  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      allowedHosts,
      cors: {
        origin: allowedCorsOrigins,
      },
      proxy,
    },
    preview: {
      host: '0.0.0.0',
      allowedHosts,
      cors: {
        origin: allowedCorsOrigins,
      },
      proxy,
    },
  }
})
