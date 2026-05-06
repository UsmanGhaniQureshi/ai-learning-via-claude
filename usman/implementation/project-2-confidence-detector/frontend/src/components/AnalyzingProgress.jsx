/**
 * AnalyzingProgress — shared spinner + % bar for the four post-record
 * "we're analysing your media" flows:
 *
 *   - Upload Video (Upload.jsx)
 *   - Upload Audio (Analyzer.jsx)
 *   - Live Practice end-of-session (LiveSession.jsx)
 *   - Live Audio end-of-session (LiveAnalyzer.jsx)
 *
 * All four pages stream progress events from
 * /api/media/{id}/progress-stream (via streamMediaProgress in
 * utils/mediaStatus.js). The `progress` field arrives as a 0..100
 * integer or `null` while the pipeline is still in pre-frame stages
 * (audio extract, ffmpeg trim, etc.) — null renders as an
 * indeterminate spinner without a bar so users don't see "0%" frozen
 * at the start.
 *
 * Props:
 *   statusText  string       headline ("Analyzing video…", etc.)
 *   pct         number|null  0..100 percentage, or null for indeterminate
 *   hint        string?      smaller secondary line (optional)
 */
export default function AnalyzingProgress({ statusText, pct, hint }) {
  return (
    <div className="glass-card p-12 text-center max-w-md mx-auto space-y-3">
      <div className="w-10 h-10 mx-auto border-2 border-accent border-t-transparent rounded-full animate-spin" />
      <p className="text-text-primary">{statusText || 'Processing…'}</p>
      {pct !== null && pct !== undefined && (
        <div className="w-full">
          <div className="h-2 w-full bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(0, Math.min(100, Math.round(pct)))}%` }}
            />
          </div>
          <p className="text-text-muted text-xs mt-1">
            {Math.max(0, Math.min(100, Math.round(pct)))}%
          </p>
        </div>
      )}
      {hint && (
        <p className="text-text-muted text-sm">{hint}</p>
      )}
    </div>
  )
}
