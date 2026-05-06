import { Component } from 'react'
import { Link } from 'react-router-dom'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, info) {
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
      <div className="max-w-2xl py-12 mx-auto">
        <h2>Something went wrong</h2>
        <p className="text-text-secondary text-sm mb-4">
          The page hit an unexpected error and had to stop rendering.
        </p>

        <div className="bg-[rgba(239,68,68,0.1)] border border-[rgba(239,68,68,0.3)] text-danger text-sm rounded-md px-3 py-2 font-mono mb-5">
          {msg}
        </div>

        <div className="flex gap-3">
          <Link to="/" onClick={this.handleReset} className="btn btn-primary">
            ← Home
          </Link>
          <button onClick={() => window.location.reload()} className="btn btn-secondary">
            Reload page
          </button>
        </div>
      </div>
    )
  }
}
