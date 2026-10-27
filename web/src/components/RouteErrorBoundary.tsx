import { Component, type PropsWithChildren } from 'react';

export default class RouteErrorBoundary extends Component<PropsWithChildren, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div role="alert" className="min-h-[40vh] flex flex-col items-center justify-center gap-4 px-4 text-center">
        <h1 className="text-xl font-semibold text-warm-900">This page could not be loaded</h1>
        <p className="text-warm-600">Check your connection and reload to try again.</p>
        <button type="button" onClick={() => window.location.reload()} className="btn-primary">
          Reload page
        </button>
      </div>
    );
  }
}
