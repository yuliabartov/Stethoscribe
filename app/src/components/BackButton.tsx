import type { CSSProperties } from 'react';
import { useStethoscribe } from '../state/StethoscribeContext';

export function BackButton({ onClick, dark = false }: { onClick: () => void; dark?: boolean }) {
  const { rtl } = useStethoscribe();
  const style: CSSProperties = {
    width: 40,
    height: 40,
    border: 'none',
    background: dark ? 'rgba(255,255,255,.12)' : '#F2EEE3',
    borderRadius: 13,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  };
  return (
    <button style={style} onClick={onClick}>
      <svg
        style={rtl ? { transform: 'scaleX(-1)' } : undefined}
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke={dark ? '#fff' : '#173A4B'}
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 18l-6-6 6-6" />
      </svg>
    </button>
  );
}
