import { LangToggle } from '../components/LangToggle';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';

export function TemplatesScreen() {
  const { state, t, loc, rtl, newBuilder, openBuilder } = useStethoscribe();

  return (
    <>
      <div style={{ padding: '26px 22px 14px', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: color.ink, letterSpacing: '-.4px' }}>{t.templatesTitle}</h1>
          <p style={{ margin: '6px 0 0', fontSize: 14.5, color: color.muted, fontWeight: 600 }}>{t.templatesSub}</p>
        </div>
        <LangToggle />
      </div>

      <div className="scr" style={{ flex: 1, overflow: 'auto', padding: '6px 22px 110px' }}>
        <button
          onClick={newBuilder}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 13,
            width: '100%',
            border: `2px dashed ${color.amberDashedBorder}`,
            borderRadius: 20,
            background: color.amberDashedBg,
            padding: 18,
            marginBottom: 16,
          }}
        >
          <span style={{ width: 42, height: 42, borderRadius: 14, background: color.amber, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth="2.6" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: color.ink }}>{t.newTemplate}</span>
        </button>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {state.templates.map((tp) => (
            <button
              key={tp.id}
              onClick={() => openBuilder(tp.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                background: '#fff',
                border: `1px solid ${color.borderCream2}`,
                borderRadius: 18,
                padding: 16,
                textAlign: 'start',
                boxShadow: '0 1px 0 rgba(23,58,75,.03)',
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
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 16, fontWeight: 700, color: color.ink }}>{loc(tp, 'name')}</span>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 600, color: color.muted, marginTop: 2 }}>
                  {tp.cats.length} {t.sections}
                </span>
              </span>
              <svg
                style={rtl ? { transform: 'scaleX(-1)' } : undefined}
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke={color.chevron}
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}
