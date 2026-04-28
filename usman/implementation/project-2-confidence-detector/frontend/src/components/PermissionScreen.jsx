/**
 * Shown when camera/microphone permissions are denied.
 */
export default function PermissionScreen({ onRetry, error }) {
  return (
    <div className="glass-card p-10 text-center max-w-xl mx-auto">
      <div className="text-5xl mb-4">🔒</div>
      <h3 className="text-text-primary mb-2">Camera &amp; Microphone Access Required</h3>
      <p className="text-text-secondary text-sm mb-4">
        The Confidence Detector needs access to your camera and microphone to analyze your presentation in real-time.
      </p>

      {error && (
        <div className="bg-[rgba(239,68,68,0.1)] text-danger text-sm rounded-md px-3 py-2 mb-4">
          {error}
        </div>
      )}

      <div className="text-left max-w-sm mx-auto mb-6">
        <h4 className="text-text-primary text-sm font-semibold mb-2">How to grant access:</h4>
        <ol className="text-sm text-text-secondary space-y-1 list-decimal pl-5">
          <li>Click the camera/lock icon in your browser&apos;s address bar</li>
          <li>Set Camera and Microphone to &quot;Allow&quot;</li>
          <li>Refresh the page or click Retry below</li>
        </ol>
      </div>

      <button type="button" onClick={onRetry} className="btn btn-primary">
        Retry
      </button>
    </div>
  )
}
