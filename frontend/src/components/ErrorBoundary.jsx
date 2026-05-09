import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg p-8 max-w-sm w-full text-center">
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">Qualcosa è andato storto</h1>
            <p className="text-sm text-gray-500 mb-6">
              Si è verificato un errore imprevisto. Ricarica la pagina per riprendere.
            </p>
            <p className="text-xs text-red-400 bg-red-50 rounded-lg px-3 py-2 mb-5 text-left font-mono break-all">
              {this.state.error.message}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-amber-600 text-white rounded-xl font-medium text-sm active:scale-95 transition-transform"
            >
              Ricarica app
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
