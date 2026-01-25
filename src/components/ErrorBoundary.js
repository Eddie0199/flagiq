import React from "react";

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (this.props.onError) {
      this.props.onError(error, info);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            background: "#0b74ff",
            color: "white",
            textAlign: "center",
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <h1 style={{ fontSize: 22, marginBottom: 12 }}>
              Something went wrong
            </h1>
            <p style={{ color: "#cbd5f5" }}>
              A fatal error occurred. Please restart the app.
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
