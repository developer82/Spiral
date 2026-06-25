import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from 'react'

// App applies `user-select: none` globally; a `*` reset overrides inheritance,
// so each text element must opt back in to be copyable.
const selectable: CSSProperties = {
  userSelect: 'text',
  WebkitUserSelect: 'text',
  cursor: 'text'
}

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
  info: ErrorInfo | null
}

/**
 * Top-level error boundary. Without it, any uncaught render error unmounts the
 * whole React tree and leaves a blank window. This catches the error and shows
 * its message and component stack so failures are diagnosable instead of silent.
 */
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info })
    // Also surface in the console for the devtools/terminal.
    console.error('Uncaught render error:', error, info.componentStack)
  }

  handleReset = (): void => {
    this.setState({ error: null, info: null })
  }

  render(): ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children

    return (
      <div
        role="alert"
        style={{
          padding: '24px',
          fontFamily: 'monospace',
          color: 'var(--color-on-surface, #eee)',
          background: 'var(--color-surface, #1e1e1e)',
          height: '100vh',
          overflow: 'auto',
          boxSizing: 'border-box',
          // App sets `user-select: none` globally; re-enable so the error
          // message and stack can be copied.
          userSelect: 'text',
          WebkitUserSelect: 'text',
          cursor: 'text'
        }}
      >
        <h2 style={{ marginTop: 0, ...selectable }}>Something went wrong</h2>
        <pre style={{ whiteSpace: 'pre-wrap', color: '#ff6b6b', ...selectable }}>{error.message}</pre>
        {error.stack && (
          <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.8, ...selectable }}>{error.stack}</pre>
        )}
        {info?.componentStack && (
          <pre style={{ whiteSpace: 'pre-wrap', opacity: 0.6, ...selectable }}>{info.componentStack}</pre>
        )}
        <button onClick={this.handleReset} style={{ marginTop: '12px', padding: '6px 12px' }}>
          Try again
        </button>
      </div>
    )
  }
}
