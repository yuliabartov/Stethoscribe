import type { CSSProperties } from 'react';
import { useStethoscribe } from '../state/StethoscribeContext';

function seg(active: boolean): CSSProperties {
  return {
    minWidth: 36,
    padding: '7px 10px',
    border: 'none',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 800,
    cursor: 'pointer',
    background: active ? '#173A4B' : 'transparent',
    color: active ? '#fff' : '#8A968C',
    transition: 'all .15s',
  };
}

function segDark(active: boolean): CSSProperties {
  return {
    minWidth: 36,
    padding: '7px 10px',
    border: 'none',
    borderRadius: 8,
    fontSize: 12.5,
    fontWeight: 800,
    cursor: 'pointer',
    background: active ? '#2DD4B0' : 'transparent',
    color: active ? '#0B2A36' : '#9FE8D7',
    transition: 'all .15s',
  };
}

export function LangToggle({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const { state, update } = useStethoscribe();
  const isEn = state.lang === 'en';
  const wrap: CSSProperties = {
    display: 'flex',
    background: variant === 'dark' ? 'rgba(255,255,255,.12)' : '#F2EEE3',
    borderRadius: 11,
    padding: 3,
    gap: 3,
    flexShrink: 0,
  };
  const styleFor = variant === 'dark' ? segDark : seg;
  return (
    <div style={wrap}>
      <button style={styleFor(isEn)} onClick={() => update({ lang: 'en' })}>
        EN
      </button>
      <button style={styleFor(!isEn)} onClick={() => update({ lang: 'he' })}>
        עב
      </button>
    </div>
  );
}
