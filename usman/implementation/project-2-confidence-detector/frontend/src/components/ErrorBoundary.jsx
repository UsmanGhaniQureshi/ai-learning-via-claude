import { Component } from 'react'
import { Link } from 'react-router-dom'

/**
 * ErrorBoundary — React class component that catches render errors in its
 * subtree and shows a friendly fallback instead of a white screen.
 *
 * Without this, a single buggy child (malformed report JSON, null
 * dereference in Playback Review, etc.) unmounts the entire app tree.
 *
 * Class component is required — error boundaries are one of the two
 * places React 19 still requires classes.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
    // Surface to the console so DevTools still shows the stack.
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (!this.state.hasError) return this.props.children

    const msg =
      (this.state.error && (this.state.error.message || String(this.state.error))) ||
      'Unknown error'

    return (
      <div className="section" style={{ padding: 40, maxWidth: 720 }}>
        <h2>Something went wrong</h2>
        <p className="subtitle">
          The page hit an unexpected error and had to stop rendering.
        </p>

        <div className="session-error" style={{ marginTop: 16, fontFamily: 'monospace', fontSize: '0.85rem' }}>
          {msg}
        </div>

        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <Link to="/" onClick={this.handleReset} className="report-btn">
            ← Home
          </Link>
          <button onClick={() => window.location.reload()} className="report-btn">
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
