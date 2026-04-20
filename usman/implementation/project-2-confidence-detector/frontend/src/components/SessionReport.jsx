import ScoreGauge from './ScoreGauge'
import SignalBars from './SignalBars'
import SessionGraph from './SessionGraph'
import TranscriptView from './TranscriptView'
import { API_BASE } from '../config'

/**
 * Shared report UI — used by both live session post-report and standalone analyzer.
 * Expects a `report` prop matching the generate_post_session_report() output.
 *
 * showRecording: when true, render the saved video from report.recording.video_url
 * inside the report. Set true from contexts without their own preview (e.g.
 * the History page); leave false when the parent (LiveSession) already shows
 * the recording above the report so we don't double-render.
 */
export default function SessionReport({
  report,
  onDownloadJSON,
  onCopyTranscript,
  showRecording = false,
}) {
  if (!report) return null
  if (report.error) return <div className="report-error">{report.error}</div>

  const {
    avg_score, peak_score, lowest_score, grade, grade_label,
    signal_averages, filler_breakdown, total_fillers, acoustic_fillers,
    pace, insights, action_items, timeline, transcript, duration_s,
    weakest_signal, note, session_id, recording,
  } = report

  const recordingVideoUrl = recording?.video_url
    ? `${API_BASE}${recording.video_url}`
    : null

  // Convert signal_averages to the format SignalBars expects
  const barScores = {
    eyeContact: signal_averages?.eye_contact ?? 50,
    voiceSteadiness: signal_averages?.voice_steadiness ?? 50,
    speechPace: signal_averages?.speech_pace ?? 50,
    fillerWords: signal_averages?.filler_words ?? 50,
    vocalVariety: signal_averages?.vocal_variety ?? 50,
    expression: signal_averages?.expression ?? 50,
  }

  // Convert timeline for SessionGraph
  const graphHistory = (timeline || []).map(t => ({
    time: t.t_s,
    score: t.total,
  }))

  const gradeColor = avg_score >= 70 ? '#00c853' : avg_score >= 50 ? '#ffd600' : '#ff1744'

  return (
    <div className="session-report">
      {/* Header: Grade + Score */}
      <div className="report-header">
        <div className="report-grade" style={{ borderColor: gradeColor }}>
          <span className="grade-letter" style={{ color: gradeColor }}>{grade}</span>
          <span className="grade-label">{grade_label}</span>
        </div>
        <ScoreGauge score={avg_score} label="Average Score" size={160} />
        <div className="report-stats">
          <div className="stat-item">
            <strong>{peak_score}</strong><span>Peak</span>
          </div>
          <div className="stat-item">
            <strong>{lowest_score}</strong><span>Lowest</span>
          </div>
          <div className="stat-item">
            <strong>{formatDuration(duration_s)}</strong><span>Duration</span>
          </div>
        </div>
      </div>

      {note && <div className="report-note">{note}</div>}

      {showRecording && recordingVideoUrl && (
        <div className="report-section">
          <video
            src={recordingVideoUrl}
            controls
            playsInline
            preload="metadata"
            className="processed-video"
            style={{ width: '100%', borderRadius: 8 }}
          />
        </div>
      )}

      {/* Signal Bars */}
      <div className="report-section">
        <h3>Signal Breakdown</h3>
        <ReportSignalBars signals={signal_averages} />
      </div>

      {/* Score Timeline */}
      {graphHistory.length > 2 && (
        <div className="report-section">
          <SessionGraph history={graphHistory} />
        </div>
      )}

      {/* Filler Breakdown */}
      {total_fillers > 0 && (
        <div className="report-section">
          <h3>Filler Words</h3>
          <div className="filler-breakdown">
            <div className="filler-total">
              <strong>{total_fillers}</strong> total fillers
              {acoustic_fillers > 0 && (
                <span className="acoustic-note">
                  ({acoustic_fillers} detected from audio sounds)
                </span>
              )}
            </div>
            <div className="filler-tags">
              {Object.entries(filler_breakdown || {}).map(([word, count]) => (
                <span key={word} className="filler-tag">{word} ({count})</span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Pace Analysis */}
      {pace && (
        <div className="report-section">
          <h3>Pace Analysis</h3>
          <div className="pace-stats">
            <div className="pace-item">
              <strong>{pace.avg_wpm}</strong><span>Avg WPM</span>
            </div>
            <div className="pace-item good">
              <strong>{pace.ideal_pct}%</strong><span>Ideal pace</span>
            </div>
            <div className="pace-item warn">
              <strong>{pace.too_fast_pct}%</strong><span>Too fast</span>
            </div>
            <div className="pace-item warn">
              <strong>{pace.too_slow_pct}%</strong><span>Too slow</span>
            </div>
          </div>
        </div>
      )}

      {/* Insights */}
      {insights && insights.length > 0 && (
        <div className="report-section">
          <h3>Insights</h3>
          <ul className="insights-list">
            {insights.map((insight, i) => (
              <li key={i}>{insight}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Action Items */}
      {action_items && action_items.length > 0 && (
        <div className="report-section action-section">
          <h3>Action Items</h3>
          <ul className="action-list">
            {action_items.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Transcript */}
      {transcript && transcript.length > 0 && (
        <div className="report-section">
          <h3>Transcript</h3>
          <TranscriptView words={transcript} />
        </div>
      )}

      {/* Actions */}
      <div className="report-actions">
        {onDownloadJSON && (
          <button className="report-btn" onClick={onDownloadJSON}>
            Download Report JSON
          </button>
        )}
        {onCopyTranscript && (
          <button className="report-btn secondary" onClick={onCopyTranscript}>
            Copy Transcript
          </button>
        )}
      </div>
    </div>
  )
}

function ReportSignalBars({ signals }) {
  if (!signals) return null
  const items = [
    { key: 'voice_steadiness', label: 'Voice Steadiness' },
    { key: 'eye_contact', label: 'Eye Contact' },
    { key: 'speech_pace', label: 'Speech Pace' },
    { key: 'filler_words', label: 'Filler Words' },
    { key: 'vocal_variety', label: 'Vocal Variety' },
    { key: 'expression', label: 'Expression' },
  ]

  const barColor = (v) => v >= 71 ? '#00c853' : v >= 41 ? '#ffd600' : '#ff1744'

  return (
    <div className="signal-bars">
      {items.map(({ key, label }) => {
        const value = signals[key] ?? 50
        return (
          <div key={key} className="signal-row">
            <div className="signal-label"><span>{label}</span></div>
            <div className="signal-bar-bg">
              <div className="signal-bar-fill" style={{
                width: `${value}%`,
                backgroundColor: barColor(value),
                transition: 'width 0.5s ease',
              }} />
            </div>
            <div className="signal-value" style={{ color: barColor(value) }}>
              {Math.round(value)}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatDuration(seconds) {
  if (!seconds) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
