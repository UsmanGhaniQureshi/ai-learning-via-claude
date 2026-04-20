/**
 * Shown when camera/microphone permissions are denied.
 * Provides clear instructions and a retry button.
 */
export default function PermissionScreen({ onRetry, error }) {
  return (
    <div className="permission-screen">
      <div className="permission-icon">&#x1F512;</div>
      <h3>Camera & Microphone Access Required</h3>
      <p>The Confidence Detector needs access to your camera and microphone to analyze your presentation in real-time.</p>

      {error && <p className="permission-error">{error}</p>}

      <div className="permission-steps">
        <h4>How to grant access:</h4>
        <ol>
          <li>Click the camera/lock icon in your browser's address bar</li>
          <li>Set Camera and Microphone to "Allow"</li>
          <li>Refresh the page or click Retry below</li>
        </ol>
      </div>

      <button className="retry-btn" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}
