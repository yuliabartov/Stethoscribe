import type { CSSProperties } from 'react';
import { useStethoscribe } from '../state/StethoscribeContext';
import type { NavName } from '../types';

const wrap: CSSProperties = {
  display: 'flex',
  alignItems: 'stretch',
  justifyContent: 'space-around',
  padding: '10px 16px calc(12px + env(safe-area-inset-bottom))',
  background: '#FBF8F2',
  borderTop: '1px solid #F0E9DA',
};

const btn: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: 4,
  border: 'none',
  background: 'transparent',
  padding: '6px 0',
};

const label: CSSProperties = {
  fontSize: 11.5,
  fontWeight: 700,
};

export function BottomNav() {
  const { state, t, go } = useStethoscribe();
  const colorFor = (key: NavName) => (state.nav === key ? '#0E9A82' : '#A6B0AC');

  return (
    <nav style={wrap}>
      <button style={btn} onClick={() => go('home', { nav: 'home' })}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colorFor('home')} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
        </svg>
        <span style={{ ...label, color: colorFor('home') }}>{t.navHome}</span>
      </button>
      <button style={btn} onClick={() => go('templates', { nav: 'templates' })}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colorFor('templates')} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="3" width="16" height="18" rx="2.5" />
          <path d="M8 8h8M8 12h8M8 16h5" />
        </svg>
        <span style={{ ...label, color: colorFor('templates') }}>{t.navTemplates}</span>
      </button>
      <button style={btn} onClick={() => go('reports', { nav: 'reports' })}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={colorFor('reports')} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 6h2M4 12h2M4 18h2M10 6h10M10 12h10M10 18h7" />
        </svg>
        <span style={{ ...label, color: colorFor('reports') }}>{t.navReports}</span>
      </button>
    </nav>
  );
}
