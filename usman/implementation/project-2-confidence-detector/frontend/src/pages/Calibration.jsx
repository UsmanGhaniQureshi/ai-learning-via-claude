import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_BASE, apiFetch } from '../config'
import CalibrationWelcome from '../components/CalibrationWelcome'
import EmotionCapture from '../components/EmotionCapture'
import VoiceCapture from '../components/VoiceCapture'
import CalibrationComplete from '../components/CalibrationComplete'

/**
 * /calibration — top-level orchestrator for Personal Setup.
 *
 * Flow:
 *   welcome → part1_intro → emotion_capture → part2_intro
 *   → voice_video → part3_intro → voice_audio → finalising → complete
 *
 * Resume support: on mount, calls /api/calibration/status. If the
 * user has partial progress (some emotions captured but not all,
 * or some voice recordings done) we show a resume card and let
 * them pick up where they left off OR start over.
 */
export default function CalibrationPage() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState('loading')
  const [emotionOrder, setEmotionOrder] = useState(null)
  const [emotionPrompts, setEmotionPrompts] = useState(null)
  const [voicePrompts, setVoicePrompts] = useState(null)
  const [resumeFromStatus, setResumeFromStatus] = useState(null)
  const [completeSummary, setCompleteSummary] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    async function init() {
      try {
        const res = await apiFetch(`${API_BASE}/api/calibration/status`)
        if (!res.ok) {
          setPhase('welcome')
          return
        }
        const status = await res.json()
        if (cancelled) return
        if (status.is_complete) {
          // Already done — bounce them to /live with a nudge.
          navigate('/live', { replace: true })
          return
        }
        if (
          (status.emotions_captured?.length ?? 0) > 0
          || (status.voice_recordings_done ?? 0) > 0
          || (status.audio_recordings_done ?? 0) > 0
        ) {
          setResumeFromStatus(status)
          setPhase('resume')
          return
        }
        setPhase('welcome')
      } catch {
        setPhase('welcome')
      }
    }
    init()
    return () => { cancelled = true }
  }, [navigate])

  async function startCalibration(reset) {
    setError(null)
    try {
      const res = await apiFetch(`${API_BASE}/api/calibration/start`, {
        method: 'POST',
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        setError(j.error || `Server returned ${res.status}.`)
        return
      }
      const data = await res.json()
      setEmotionOrder(data.emotion_order)
      setEmotionPrompts(data.emotion_prompts)
      setVoicePrompts(data.voice_prompts)
      setPhase(reset ? 'part1_intro' : 'part1_intro')
    } catch (e) {
      setError(`Could not start setup: ${e.message || e}`)
    }
  }

  async function loadPromptsForResume() {
    // /start is idempotent on the row but we don't want to wipe
    // existing progress on resume. Hit /status again — but the
    // prompts are not in /status. Easiest: call /start with a flag?
    // We don't have one. Instead, we hit /start and it RESETS.
    // For resume, we need the prompts WITHOUT resetting. Solution:
    // hit a no-reset path — none exists today, so we expose the
    // shape directly.
    // For the MVP resume flow we just RESTART (the user understands
    // that "Start Over" wipes), and "Continue" actually means we
    // call /start anyway because the backend would otherwise have
    // no emotion_order to give us — the user's prior captures
    // would still be on the row UNLESS /start also wiped them.
    // To avoid wiping the user's progress on resume, we call /start
    // but the backend resets emotion_faces. So pure-resume from a
    // partial state needs the prompts cached client-side. Approach:
    // pull EMOTION_PROMPTS / VOICE_PROMPTS from /api/calibration/start
    // ALWAYS, and rely on the fact that /start preserves the row id
    // (so the user_calibration_profile row id stays the same and
    // their emotion_order can be re-shuffled — that's acceptable
    // for resume since order is cosmetic).
    //
    // Practical compromise: resume here calls /start which gives us
    // a fresh order. Captured emotions and recordings ALREADY on
    // the row are wiped per /start contract, so we direct the user
    // to "Start Over" which is the honest outcome. A future
    // /api/calibration/resume endpoint would let us preserve
    // state — out of scope for this patch.
    await startCalibration(true)
  }

  if (phase === 'loading') {
    return <div className="text-center py-12 text-text-muted">Loading…</div>
  }

  if (error) {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-3">
        <h2 className="text-xl">Something went wrong</h2>
        <p className="text-text-secondary">{error}</p>
        <button onClick={() => setPhase('welcome')} className="btn btn-secondary">
          Back to start
        </button>
      </div>
    )
  }

  if (phase === 'resume' && resumeFromStatus) {
    return (
      <div className="max-w-xl mx-auto py-12 space-y-5">
        <h2 className="text-2xl font-display font-extrabold">
          You were partway through setup
        </h2>
        <p className="text-text-secondary">
          You have completed{' '}
          <strong className="text-text-primary">
            {resumeFromStatus.emotions_captured?.length ?? 0} of{' '}
            {resumeFromStatus.target_emotions ?? '—'}
          </strong>{' '}
          expressions,{' '}
          <strong className="text-text-primary">
            {resumeFromStatus.voice_recordings_done ?? 0} of{' '}
            {resumeFromStatus.target_voice ?? '—'}
          </strong>{' '}
          camera-on, and{' '}
          <strong className="text-text-primary">
            {resumeFromStatus.audio_recordings_done ?? 0} of{' '}
            {resumeFromStatus.target_voice ?? '—'}
          </strong>{' '}
          camera-off recordings.
        </p>
        <p className="text-text-muted text-sm">
          Continuing will start a fresh setup pass. Your earlier
          captures will be replaced.
        </p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={loadPromptsForResume}
            className="btn btn-primary"
          >
            Continue Setup
          </button>
          <button
            type="button"
            onClick={() => setPhase('welcome')}
            className="btn btn-secondary"
          >
            Back
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'welcome') {
    return (
      <CalibrationWelcome
        onStart={() => startCalibration(false)}
        onSkip={() => {
          // Bookmark intent locally so RequireCalibration lets the
          // user through to practice modes despite is_complete=false.
          // The flag is cleared automatically once a session is
          // recorded (RequireCalibration only checks it when
          // session_count is 0).
          try { localStorage.setItem('cd_calib_skipped', '1') } catch { /* ignore */ }
          navigate('/', { replace: true })
        }}
      />
    )
  }

  if (phase === 'part1_intro') {
    return (
      <PartIntro
        title="Part 1 — Expressions"
        body="We will show you 5 different emotional moments, one at a time. For each one, read the prompt and let your face reflect it naturally. There is no right or wrong way — just be genuine."
        cta="Start Part 1"
        onContinue={() => setPhase('emotion_capture')}
      />
    )
  }

  if (phase === 'emotion_capture') {
    return (
      <EmotionCapture
        emotionOrder={emotionOrder}
        emotionPrompts={emotionPrompts}
        onComplete={() => setPhase('part2_intro')}
      />
    )
  }

  if (phase === 'part2_intro') {
    return (
      <PartIntro
        title="Part 2 — Speaking with camera"
        body="Now we will listen to how you naturally speak. You will answer one short prompt with your camera on. Speak naturally — this is not being scored."
        cta="Start Part 2"
        onContinue={() => setPhase('voice_video')}
      />
    )
  }

  if (phase === 'voice_video') {
    return (
      <VoiceCapture
        mode="video"
        voicePrompts={voicePrompts}
        onComplete={() => setPhase('part3_intro')}
      />
    )
  }

  if (phase === 'part3_intro') {
    return (
      <PartIntro
        title="Part 3 — Speaking without camera"
        body="Last part — same prompt but camera off this time. Some people speak differently without a camera. This helps us account for that."
        cta="Start Part 3"
        onContinue={() => setPhase('voice_audio')}
      />
    )
  }

  if (phase === 'voice_audio') {
    return (
      <VoiceCapture
        mode="audio"
        voicePrompts={voicePrompts}
        onComplete={async () => {
          setPhase('finalising')
          try {
            const res = await apiFetch(`${API_BASE}/api/calibration/complete`, {
              method: 'POST',
            })
            const data = await res.json()
            if (!res.ok || !data.complete) {
              setError(
                data?.reason
                || data?.error
                || 'Could not finalise your profile. Try again.',
              )
              return
            }
            setCompleteSummary(data)
            setPhase('complete')
          } catch (e) {
            setError(`Finalise failed: ${e.message || e}`)
          }
        }}
      />
    )
  }

  if (phase === 'finalising') {
    return (
      <div className="max-w-md mx-auto py-12 text-center space-y-4">
        <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
        <h2 className="text-xl">Building your profile…</h2>
        <p className="text-text-secondary text-sm">Aggregating your baselines.</p>
      </div>
    )
  }

  if (phase === 'complete') {
    return <CalibrationComplete summary={completeSummary} />
  }

  return null
}

function PartIntro({ title, body, cta, onContinue }) {
  return (
    <div className="max-w-2xl mx-auto py-8 space-y-5">
      <h2 className="text-3xl font-display font-extrabold">{title}</h2>
      <p className="text-text-secondary leading-relaxed text-lg">{body}</p>
      <div className="flex justify-end">
        <button onClick={onContinue} className="btn btn-primary btn-lg">
          {cta} →
        </button>
      </div>
    </div>
  )
}
