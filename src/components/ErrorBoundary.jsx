import { Component } from 'react'

// Catches render-time crashes AND failed lazy-chunk imports (Suspense surfaces a
// rejected import() as a thrown error to the nearest boundary). Without this, any
// such failure unmounts the tree and leaves a blank white page. The commonest
// cause is a stale index.html left over from a previous deploy: it points at
// chunk hashes the current release no longer serves, so import() 404s. Here we
// give the visitor a clear way out — reload to pull the fresh index.html — rather
// than a dead screen.
const CHUNK_HINTS = [
  'dynamically imported module',
  'Importing a module script failed',
  'error loading dynamically imported module',
  'Failed to fetch',
  'ChunkLoadError',
]

function looksLikeChunkError(err) {
  const s = `${err?.name || ''} ${err?.message || ''}`
  return CHUNK_HINTS.some(h => s.includes(h))
}

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
    this.reload = this.reload.bind(this)
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  reload() {
    // Clear lazyReload's one-shot guard so the fresh load is allowed to auto-heal
    // a stale-chunk import again if it still needs to.
    try { sessionStorage.removeItem('mp-chunk-reload') } catch { /* storage blocked */ }
    window.location.reload()
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const chunk = looksLikeChunkError(error)
    return (
      <div className="app-error">
        <div className="app-error-card">
          <h1>{chunk ? 'A new version is available' : 'Something went wrong'}</h1>
          <p>
            {chunk
              ? 'This page couldn’t finish loading — usually because the site was updated while it was open. Reload to get the latest version.'
              : 'This page hit an unexpected error. Reloading usually clears it.'}
          </p>
          <button type="button" className="btn btn-primary" onClick={this.reload}>Reload</button>
        </div>
      </div>
    )
  }
}
