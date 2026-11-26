import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';
import { RotateCcw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center h-full p-8" style={{ background: 'var(--color-bg)' }}>
          <div role="alert" className="tn-panel tn-rule-fail w-full max-w-md px-6 py-5">
            <h2 className="text-[20px] leading-7 font-bold mb-2" style={{ color: 'var(--color-text)' }}>
              Something went wrong
            </h2>
            <p className="tn-mono text-[13px] leading-5 mb-5 break-words" style={{ color: 'var(--color-text-secondary)' }}>
              {this.state.error?.message || 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="tn-btn tn-btn-primary"
            >
              <RotateCcw size={14} />
              Try again
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
