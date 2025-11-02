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
    console.error('[UI error]', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleRetry = () => {
    this.setState({ error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      const isDevelopment = process.env.NODE_ENV === 'development';

      return (
        <div style={{
          padding: '24px',
          fontSize: '16px',
          lineHeight: 1.5,
          fontFamily: 'system-ui, -apple-system, sans-serif',
          backgroundColor: '#f8f9fa',
          minHeight: '100vh'
        }}>
          <div style={{
            maxWidth: '800px',
            margin: '0 auto',
            backgroundColor: 'white',
            padding: '32px',
            borderRadius: '8px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
          }}>
            <h1 style={{ fontSize: '24px', marginBottom: '16px', color: '#d32f2f' }}>
              ⚠️ Произошла ошибка UI
            </h1>

            <p style={{ marginBottom: '16px', color: '#666' }}>
              Приложение обнаружило неожиданную ошибку. Попробуйте обновить окно или перезапустить приложение.
            </p>

            <div style={{ marginBottom: '24px' }}>
              <button
                onClick={this.handleRetry}
                style={{
                  padding: '10px 20px',
                  marginRight: '12px',
                  fontSize: '14px',
                  backgroundColor: '#1976d2',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Попробовать снова
              </button>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '10px 20px',
                  fontSize: '14px',
                  backgroundColor: '#757575',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Перезагрузить окно
              </button>
            </div>

            {isDevelopment && (
              <details style={{ marginTop: '24px' }}>
                <summary style={{ cursor: 'pointer', fontWeight: 'bold', marginBottom: '12px' }}>
                  Детали ошибки (только в dev режиме)
                </summary>
                <div style={{
                  backgroundColor: '#f5f5f5',
                  padding: '16px',
                  borderRadius: '4px',
                  overflow: 'auto'
                }}>
                  <p style={{ marginBottom: '8px', fontWeight: 'bold', color: '#d32f2f' }}>
                    {this.state.error?.toString()}
                  </p>
                  <pre style={{
                    fontSize: '12px',
                    whiteSpace: 'pre-wrap',
                    wordWrap: 'break-word',
                    fontFamily: 'monospace',
                    margin: 0
                  }}>
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </div>
              </details>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
