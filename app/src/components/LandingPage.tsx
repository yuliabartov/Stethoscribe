import { useState, type CSSProperties, type ReactNode } from 'react';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';
import { AppIcon } from './AppIcon';
import { LangToggle } from './LangToggle';

// Full-width, responsive landing page shown before sign-in — the app's public
// entry point. (The signed-in app still renders inside PhoneFrame.) Kept on the
// app's existing stack: inline styles + theme.ts colors + DICT i18n, so Hebrew
// (RTL) / English (LTR) swap purely off state.lang like every other screen.

const CONTACT_EMAIL = 'contact@stethoscribe.com';

// Official multi-color Google "G" — the standard mark for an OAuth button.
function GoogleG({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden style={{ flexShrink: 0 }}>
      <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
      <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
      <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
      <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
    </svg>
  );
}

export function LandingPage() {
  const { t, dir, signIn } = useStethoscribe();
  const [pending, setPending] = useState(false);

  const handleSignIn = async () => {
    setPending(true);
    try {
      await signIn();
    } finally {
      setPending(false);
    }
  };

  const page: CSSProperties = {
    minHeight: '100dvh',
    display: 'flex',
    flexDirection: 'column',
    background: 'radial-gradient(130% 80% at 50% 0%, #F4EDDE 0%, #EBE3D4 55%, #E4DBC9 100%)',
    color: color.ink,
    overflowX: 'hidden',
  };

  const container: CSSProperties = {
    width: '100%',
    maxWidth: 1080,
    marginInline: 'auto',
    paddingInline: 'clamp(20px, 5vw, 40px)',
  };

  const features = [
    { title: t.landFeat1Title, desc: t.landFeat1Desc, icon: micIcon },
    { title: t.landFeat2Title, desc: t.landFeat2Desc, icon: globeIcon },
    { title: t.landFeat3Title, desc: t.landFeat3Desc, icon: sendIcon },
  ];

  return (
    <div dir={dir} style={page}>
      {/* Top bar */}
      <header style={{ ...container, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <AppIcon size={40} />
          <span style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-.4px' }}>
            <span style={{ color: color.teal }}>Stetho</span>
            <span style={{ color: color.ink }}>scribe</span>
          </span>
        </div>
        <LangToggle />
      </header>

      {/* Hero */}
      <section style={{ ...container, position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', paddingTop: 'clamp(28px, 6vw, 64px)', paddingBottom: 'clamp(36px, 7vw, 72px)' }}>
        {/* soft decorative teal glow behind the mark */}
        <div style={{ position: 'absolute', top: 'clamp(10px, 4vw, 40px)', width: 'min(420px, 80vw)', height: 'min(420px, 80vw)', borderRadius: '50%', background: 'radial-gradient(circle, rgba(45,212,176,.18) 0%, rgba(45,212,176,0) 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <AppIcon size={112} />
        </div>
        <h1 style={{ position: 'relative', margin: '22px 0 0', fontSize: 'clamp(30px, 5.5vw, 52px)', lineHeight: 1.12, fontWeight: 800, letterSpacing: '-.8px', maxWidth: 720 }}>
          {t.landHeadline}
        </h1>
        <p style={{ position: 'relative', margin: '18px 0 0', fontSize: 'clamp(16px, 2.2vw, 20px)', lineHeight: 1.55, fontWeight: 500, color: color.inkSoft, maxWidth: 620 }}>
          {t.landSub}
        </p>

        <button
          onClick={handleSignIn}
          disabled={pending}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            marginTop: 34,
            width: '100%',
            maxWidth: 340,
            padding: '16px 22px',
            border: `1.5px solid ${color.borderCream4}`,
            borderRadius: 16,
            background: color.white,
            color: color.ink,
            fontSize: 16.5,
            fontWeight: 700,
            boxShadow: '0 14px 30px -14px rgba(23,58,75,.35)',
            cursor: pending ? 'default' : 'pointer',
            opacity: pending ? 0.6 : 1,
            transition: 'transform .15s, box-shadow .15s',
          }}
        >
          <GoogleG size={20} />
          {pending ? t.signingIn : t.google}
        </button>
        <p style={{ position: 'relative', margin: '14px 0 0', fontSize: 13, fontWeight: 600, color: color.muted, maxWidth: 360, lineHeight: 1.5 }}>
          {t.signinNote}
        </p>
      </section>

      {/* Features */}
      <section style={{ ...container, paddingTop: 8, paddingBottom: 'clamp(36px, 6vw, 64px)' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, justifyContent: 'center' }}>
          {features.map((f) => (
            <div
              key={f.title}
              style={{
                flex: '1 1 260px',
                maxWidth: 340,
                background: color.white,
                border: `1px solid ${color.borderCream2}`,
                borderRadius: 22,
                padding: 24,
                textAlign: 'start',
                boxShadow: '0 2px 0 rgba(23,58,75,.03)',
              }}
            >
              <span style={{ width: 48, height: 48, borderRadius: 14, background: color.tealWash, color: color.teal, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                {f.icon}
              </span>
              <h3 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 800, color: color.ink }}>{f.title}</h3>
              <p style={{ margin: 0, fontSize: 14.5, fontWeight: 500, color: color.inkSoft, lineHeight: 1.55 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Contact */}
      <section style={{ ...container, paddingBottom: 'clamp(32px, 5vw, 56px)' }}>
        <div style={{ background: color.ink, borderRadius: 28, padding: 'clamp(28px, 4vw, 44px)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(22px, 3vw, 28px)', fontWeight: 800, color: color.white }}>{t.landContactTitle}</h2>
          <p style={{ margin: '12px 0 0', fontSize: 15.5, fontWeight: 500, color: color.tealPale, maxWidth: 460, lineHeight: 1.55 }}>{t.landContactText}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            dir="ltr"
            style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginTop: 22, padding: '13px 22px', borderRadius: 14, background: color.tealBright, color: color.examMicIcon, fontSize: 16, fontWeight: 800, textDecoration: 'none' }}
          >
            {mailIcon}
            {CONTACT_EMAIL}
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ ...container, paddingTop: 8, paddingBottom: 28, display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTop: `1px solid ${color.borderCream3}`, marginTop: 'auto' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700, color: color.inkSoft }}>
          <span style={{ color: color.teal }}>Stetho</span>
          <span style={{ marginInlineStart: -6, color: color.ink }}>scribe</span>
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: color.muted }}>© {new Date().getFullYear()} Stethoscribe · {t.landRights}</span>
      </footer>
    </div>
  );
}

// — icons (inherit currentColor from the teal chip) —
const iconProps = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

const micIcon: ReactNode = (
  <svg {...iconProps}>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
  </svg>
);

const globeIcon: ReactNode = (
  <svg {...iconProps}>
    <circle cx="12" cy="12" r="10" />
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 0 20 15.3 15.3 0 0 1 0-20z" />
  </svg>
);

const sendIcon: ReactNode = (
  <svg {...iconProps}>
    <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
  </svg>
);

const mailIcon: ReactNode = (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <path d="m22 7-10 6L2 7" />
  </svg>
);
