import { useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { LangToggle } from '../components/LangToggle';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';

export function SignInScreen() {
  const { t, signIn } = useStethoscribe();
  const [pending, setPending] = useState(false);

  const handleSignIn = async () => {
    setPending(true);
    try {
      await signIn();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="scr" style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '22px 32px 36px', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <LangToggle />
      </div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
        <AppIcon size={90} />
        <h1 style={{ margin: '18px 0 0', fontSize: 34, fontWeight: 800, letterSpacing: '-.5px' }}>
          <span style={{ color: color.teal }}>Stetho</span>
          <span style={{ color: color.ink }}>scribe</span>
        </h1>
        <p style={{ margin: '12px 0 0', fontSize: 17, color: color.inkSoft, fontWeight: 500, maxWidth: 300, lineHeight: 1.5 }}>{t.tagline}</p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <button
          onClick={handleSignIn}
          disabled={pending}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            width: '100%',
            padding: 17,
            border: `1.5px solid ${color.borderCream4}`,
            borderRadius: 18,
            background: color.white,
            color: color.ink,
            fontSize: 16,
            fontWeight: 700,
            boxShadow: '0 6px 16px -8px rgba(23,58,75,.2)',
            cursor: pending ? 'default' : 'pointer',
            opacity: pending ? 0.6 : 1,
          }}
        >
          <span
            style={{
              width: 24,
              height: 24,
              borderRadius: '50%',
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: 17,
              color: color.googleBlue,
            }}
          >
            G
          </span>
          {pending ? t.signingIn : t.google}
        </button>
        <p style={{ margin: 0, textAlign: 'center', fontSize: 12.5, color: color.muted, lineHeight: 1.5, padding: '0 10px' }}>{t.signinNote}</p>
      </div>
    </div>
  );
}
