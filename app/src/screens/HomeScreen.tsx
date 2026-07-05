import { useState } from 'react';
import { AppIcon } from '../components/AppIcon';
import { LangToggle } from '../components/LangToggle';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';

export function HomeScreen() {
  const { state, t, loc, rtl, go, update, signOut, startExam, reviewFromReport, accentFor, tplByName } = useStethoscribe();
  const [avatarError, setAvatarError] = useState(false);

  const sel = state.templates.find((tp) => tp.id === state.selectedTemplateId) || state.templates[0];
  const firstName = state.user?.displayName?.split(' ')[0] || t.clinician;
  const initial = (state.user?.displayName || state.user?.email || '?').charAt(0).toUpperCase();
  const recentReports = state.reports.slice(0, 4);

  return (
    <>
      <div style={{ padding: '24px 22px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <AppIcon size={56} style={{ flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, color: color.muted, fontWeight: 600 }}>{t.today}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: color.ink, letterSpacing: '-.3px' }}>
              {t.greetingPrefix}
              {firstName}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <LangToggle />
          <button
            onClick={signOut}
            title={t.signOut}
            aria-label={t.signOut}
            style={{
              width: 36,
              height: 36,
              flexShrink: 0,
              padding: 0,
              borderRadius: '50%',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: color.inkSoft,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {state.user?.photoURL && !avatarError ? (
              <img
                src={state.user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                onError={() => setAvatarError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <span style={{ color: color.white, fontSize: 15, fontWeight: 800 }}>{initial}</span>
            )}
          </button>
        </div>
      </div>

      <div className="scr" style={{ flex: 1, overflow: 'auto', padding: '8px 22px 110px' }}>
        <button
          onClick={() => startExam(sel.id)}
          style={{
            position: 'relative',
            width: '100%',
            border: 'none',
            borderRadius: 28,
            background: `linear-gradient(135deg,${color.amber} 0%,${color.amberDeep} 100%)`,
            padding: '26px 24px',
            textAlign: 'start',
            overflow: 'hidden',
            boxShadow: '0 18px 34px -16px rgba(235,164,31,.7)',
            marginTop: 6,
          }}
        >
          <div
            style={{
              position: 'absolute',
              top: -30,
              insetInlineEnd: -30,
              width: 150,
              height: 150,
              borderRadius: '50%',
              background: 'rgba(255,255,255,.16)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: 18,
              insetInlineEnd: 18,
              width: 64,
              height: 64,
              borderRadius: 22,
              background: 'rgba(255,255,255,.22)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <rect x="9" y="2" width="6" height="12" rx="3" />
              <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
            </svg>
          </div>
          <div style={{ position: 'relative', fontSize: 13, fontWeight: 700, color: color.amberTextDeep, letterSpacing: '.4px', textTransform: 'uppercase' }}>
            {t.ready}
          </div>
          <div style={{ position: 'relative', fontSize: 27, fontWeight: 800, color: color.ink, marginTop: 6, letterSpacing: '-.4px' }}>{t.startExam}</div>
          <div style={{ position: 'relative', fontSize: 14, fontWeight: 600, color: color.amberText, marginTop: 4 }}>
            {t.usingPrefix}
            {loc(sel, 'name')}
          </div>
        </button>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '30px 2px 14px' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: color.ink }}>{t.chooseTemplate}</h2>
          <span onClick={() => go('templates', { nav: 'templates' })} style={{ fontSize: 13.5, fontWeight: 700, color: color.teal, cursor: 'pointer' }}>
            {t.manage}
          </span>
        </div>
        <div className="scr" style={{ display: 'flex', gap: 13, overflowX: 'auto', padding: '2px 22px 6px', margin: '0 -22px' }}>
          {state.templates.map((tp) => {
            const active = state.selectedTemplateId === tp.id;
            return (
              <button
                key={tp.id}
                onClick={() => update({ selectedTemplateId: tp.id })}
                style={{
                  flex: '0 0 auto',
                  width: 154,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 9,
                  alignItems: 'flex-start',
                  padding: 16,
                  borderRadius: 22,
                  background: '#fff',
                  textAlign: 'start',
                  cursor: 'pointer',
                  border: `2px solid ${active ? color.ink : color.borderCream2}`,
                  boxShadow: active ? '0 12px 24px -14px rgba(23,58,75,.4)' : '0 1px 0 rgba(23,58,75,.03)',
                  transition: 'all .2s',
                }}
              >
                <span
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 13,
                    background: tp.soft,
                    color: tp.accent,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  {loc(tp, 'short')}
                </span>
                <span style={{ fontSize: 14.5, fontWeight: 700, color: color.ink, textAlign: 'start', lineHeight: 1.25 }}>{loc(tp, 'name')}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: color.muted }}>
                  {tp.cats.length} {t.sections}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '28px 2px 14px' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: color.ink }}>{t.recentReports}</h2>
          <span onClick={() => go('reports', { nav: 'reports' })} style={{ fontSize: 13.5, fontWeight: 700, color: color.teal, cursor: 'pointer' }}>
            {t.seeAll}
          </span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
          {recentReports.map((r) => (
            <button
              key={r.id}
              onClick={() => reviewFromReport(r)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                background: '#fff',
                border: `1px solid ${color.borderCream2}`,
                borderRadius: 18,
                padding: '15px 16px',
                textAlign: 'start',
                boxShadow: '0 1px 0 rgba(23,58,75,.03)',
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: '50%', flexShrink: 0, background: accentFor(r.template) }} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: color.ink }}>{loc(tplByName(r.template), 'name')}</span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: color.muted, marginTop: 2 }}>
                  {r.date} · {r.time}
                </span>
              </span>
              <svg
                style={rtl ? { transform: 'scaleX(-1)' } : undefined}
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke={color.chevron}
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
