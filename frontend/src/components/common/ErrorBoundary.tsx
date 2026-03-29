import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 40, maxWidth: 600 }}>
          <h2 style={{ color: '#dc2626', marginBottom: 12 }}>Something went wrong</h2>
          <p style={{ color: '#6b7280', marginBottom: 16 }}>
            An error occurred while rendering this page. Try refreshing or navigating to a different page.
          </p>
          <pre style={{
            background: '#f5f5f7', padding: 16, borderRadius: 8,
            fontSize: 12, overflow: 'auto', color: '#1a1a1a',
          }}>
            {this.state.error?.message}
            {'\n'}
            {this.state.error?.stack}
          </pre>
          <button
            style={{
              marginTop: 16, padding: '8px 16px', background: '#5b5fc7', color: 'white',
              border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14,
            }}
            onClick={() => {
              this.setState({ hasError: false, error: null })
              window.location.href = '/'
            }}
          >
            Go Home
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
