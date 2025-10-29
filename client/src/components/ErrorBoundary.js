import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[UI error]', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '24px', fontSize: '16px', lineHeight: 1.5 }}>
          Произошла ошибка UI. Перезапустите окно.
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
