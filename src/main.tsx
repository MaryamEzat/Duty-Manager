import { Component, StrictMode, useEffect, useState, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'

type AppComponent = () => ReactNode

type BoundaryState = {
  error: unknown
}

class ErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null }

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('Duty Manager render failed', error, info)
  }

  render() {
    if (this.state.error) return <StartupError error={this.state.error} />
    return this.props.children
  }
}

function StartupError({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error')
  const stack = error instanceof Error ? error.stack : ''
  return <div className="startup-error">
    <h1>Duty Manager could not start</h1>
    <p>{message}</p>
    {stack && <pre>{stack}</pre>}
  </div>
}

function Bootstrap() {
  const [App, setApp] = useState<AppComponent | null>(null)
  const [error, setError] = useState<unknown>(null)

  useEffect(() => {
    const onError = (event: ErrorEvent) => setError(event.error || event.message)
    const onRejection = (event: PromiseRejectionEvent) => setError(event.reason)
    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onRejection)

    import('./App.tsx')
      .then((module) => setApp(() => module.default))
      .catch(setError)

    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onRejection)
    }
  }, [])

  if (error) return <StartupError error={error} />
  if (!App) return <div className="startup-loading">Loading Duty Manager...</div>
  return <ErrorBoundary><App /></ErrorBoundary>
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Bootstrap />
  </StrictMode>,
)
