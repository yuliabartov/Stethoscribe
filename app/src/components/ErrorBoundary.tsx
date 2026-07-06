import { Component, type ErrorInfo, type ReactNode } from 'react';
import { color } from '../theme';
import { AppIcon } from './AppIcon';

// Catches render errors anywhere below it — including inside the context
// provider — and shows a recoverable screen instead of a blank white page.
// Deliberately self-contained: it renders when the app tree (and thus the
// language state / DICT) may be unavailable, so its copy is bilingual and
// hardcoded rather than pulled from i18n. Recovery is a full reload, which
// clears whatever bad in-memory state (screen, exam) triggered the crash —
// the app boots back to home.

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surfaced in the browser console for diagnosis; no remote logging.
    console.error('Stethoscribe crashed:', error, info.componentStack);
  }

  private reload = () => window.location.reload();

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: 32,
          textAlign: 'center',
          background: color.cream,
          color: color.ink,
        }}
      >
        <AppIcon size={96} />
        <div style={{ fontSize: 20, fontWeight: 800 }}>משהו השתבש · Something went wrong</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: color.inkSoft, maxWidth: 340, lineHeight: 1.55 }}>
          הדוחות השמורים שלך בטוחים. טען מחדש כדי להמשיך.
          <br />
          Your saved reports are safe. Reload to continue.
        </div>
        <button
          onClick={this.reload}
          style={{
            marginTop: 4,
            padding: '14px 28px',
            border: 'none',
            borderRadius: 16,
            background: color.teal,
            color: '#fff',
            fontSize: 16,
            fontWeight: 800,
            cursor: 'pointer',
          }}
        >
          טען מחדש · Reload
        </button>
      </div>
    );
  }
}
