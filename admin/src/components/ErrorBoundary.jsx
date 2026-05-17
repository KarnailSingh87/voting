import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    console.error('Uncaught error in component tree:', error, errorInfo);
    
    const msg = error?.message?.toLowerCase() || '';
    if (msg.includes('module script failed') || msg.includes('dynamically imported module') || msg.includes('failed to fetch')) {
      if (!sessionStorage.getItem('admin_chunk_load_error')) {
        sessionStorage.setItem('admin_chunk_load_error', 'true');
        window.location.reload(true);
      } else {
        sessionStorage.removeItem('admin_chunk_load_error');
      }
    }
  }

  handleRetry = () => {
    this.setState({ error: null, errorInfo: null });
    // Optionally force a full reload:
    // window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="flex items-center justify-center h-screen bg-gray-50 p-6">
          <div className="max-w-xl w-full bg-white shadow rounded-md p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Something went wrong</h2>
            <p className="text-sm text-gray-600 mb-4">An unexpected error occurred while rendering this part of the admin UI.</p>
            <div className="mb-4 text-xs text-gray-500 whitespace-pre-wrap">
              {this.state.error?.toString()}
              {this.state.errorInfo?.componentStack && (
                <pre className="mt-2 text-xs text-red-600">{this.state.errorInfo.componentStack}</pre>
              )}
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={this.handleRetry}
                className="px-4 py-2 bg-cyan-600 text-white rounded hover:bg-cyan-700"
              >
                Retry
              </button>
              <button
                onClick={() => window.location.href = '/'}
                className="px-4 py-2 border rounded"
              >
                Go to Admin Home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
