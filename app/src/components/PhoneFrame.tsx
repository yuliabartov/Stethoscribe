import type { CSSProperties, ReactNode } from 'react';
import { useStethoscribe } from '../state/StethoscribeContext';

const outer: CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'radial-gradient(120% 90% at 50% 0%, #F1EADB 0%, #E4DBC9 100%)',
  padding: 0,
};

export function PhoneFrame({ children }: { children: ReactNode }) {
  const { dir } = useStethoscribe();
  return (
    <div style={outer}>
      <div className="phone-frame" dir={dir}>
        {children}
      </div>
    </div>
  );
}
