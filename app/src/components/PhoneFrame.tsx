import type { CSSProperties, ReactNode } from 'react';
import { useStethoscribe } from '../state/StethoscribeContext';

const outer: CSSProperties = {
  minHeight: '100vh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(120% 90% at 50% 0%, #F1EADB 0%, #E4DBC9 100%)',
  padding: 0,
};

const inner: CSSProperties = {
  position: 'relative',
  width: 'min(440px, 100vw)',
  height: 'min(940px, 100vh)',
  background: '#FBF8F2',
  overflow: 'hidden',
  borderRadius: 'clamp(0px, calc((100vw - 440px) * 999), 38px)',
  boxShadow: '0 40px 90px -30px rgba(23,58,75,.45), 0 0 0 1px rgba(23,58,75,.04)',
  display: 'flex',
  flexDirection: 'column',
};

export function PhoneFrame({ children }: { children: ReactNode }) {
  const { dir } = useStethoscribe();
  return (
    <div style={outer}>
      <div dir={dir} style={inner}>
        {children}
      </div>
    </div>
  );
}
