import React, { useEffect, Component, ReactNode, ErrorInfo } from 'react';
import { useAppStore } from './store';
import LoadingScreen from './components/LoadingScreen';
import SignInScreen from './components/SignInScreen';
import { MainDashboard } from './components/MainDashboard';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled React Error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-screen flex flex-col items-center justify-center p-6 bg-stone-900 text-white font-mono text-xs select-text">
          <div className="max-w-2xl w-full bg-stone-950 p-6 rounded-2xl border border-red-500/40 shadow-2xl">
            <h2 className="text-base font-bold text-red-400 mb-2 flex items-center gap-2">
              ⚠️ Application Rendering Error
            </h2>
            <p className="text-stone-300 font-semibold mb-4">
              {this.state.error?.message || 'An unexpected rendering error occurred.'}
            </p>
            <pre className="bg-black/50 p-3 rounded-lg overflow-auto max-h-60 text-[11px] text-red-300 whitespace-pre-wrap mb-4">
              {this.state.error?.stack || ''}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#fa5d19] hover:bg-[#e44e0e] text-white font-sans font-semibold rounded-lg transition-colors cursor-pointer"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function AppContent() {
  const { needsAuth, loadingInit, initAuth } = useAppStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  if (loadingInit) {
    return <LoadingScreen />;
  }

  if (needsAuth) {
    return <SignInScreen />;
  }

  return <MainDashboard />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}
