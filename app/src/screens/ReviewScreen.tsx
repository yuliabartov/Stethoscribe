import { BackButton } from '../components/BackButton';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';

export function ReviewScreen() {
  const { state, t, rtl, loc, tplByName, go, update, setField, setReportName } = useStethoscribe();
  const review = state.review!;
  const lowCount = review.cats.filter((c) => c.low).length;
  const hasLow = lowCount > 0;
  const lowBannerText = rtl
    ? `${lowCount} שדות דורשים בדיקה מהירה — הקש לעריכה`
    : `${lowCount} fields need a quick check — tap to edit`;
  const reviewTemplateName = loc(tplByName(review.templateName), 'name');
  const backScreen = state.nav === 'reports' ? 'reports' : 'home';

  return (
    <>
      <div style={{ padding: '22px 18px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${color.borderCream}` }}>
        <BackButton onClick={() => go(backScreen, { nav: backScreen })} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: color.ink }}>{t.reviewReport}</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: color.muted }}>
            {reviewTemplateName} · {t.today}
          </div>
        </div>
      </div>

      <div style={{ margin: '14px 22px 0' }}>
        <div
          style={{
            background: '#FFFFFF',
            border: `1.5px solid ${color.borderCream2}`,
            borderRadius: 18,
            padding: '15px 16px',
            boxShadow: '0 1px 0 rgba(23,58,75,.03)',
          }}
        >
          <div style={{ fontSize: 12.5, fontWeight: 700, color: color.inkMute, letterSpacing: '.3px', textTransform: 'uppercase' }}>{t.reportNameLabel}</div>
          {state.editingId === '__name__' ? (
            <input
              value={review.name}
              onChange={(e) => setReportName(e.target.value)}
              onBlur={() => update({ editingId: null })}
              placeholder={t.reportNamePlaceholder}
              autoFocus
              style={{
                width: '100%',
                marginTop: 8,
                padding: '10px 12px',
                border: `1.5px solid ${color.teal}`,
                borderRadius: 12,
                background: '#fff',
                fontSize: 16,
                fontWeight: 600,
                color: color.ink,
                outline: 'none',
              }}
            />
          ) : (
            <div
              onClick={() => update({ editingId: '__name__' })}
              style={{
                marginTop: 7,
                fontSize: 16.5,
                fontWeight: 600,
                color: review.name ? color.ink : color.muted,
                lineHeight: 1.4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                cursor: 'pointer',
              }}
            >
              <span>{review.name || t.untitledReport}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.chevron2} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </div>
          )}
        </div>
      </div>

      {hasLow && (
        <div style={{ margin: '14px 22px 0', display: 'flex', alignItems: 'center', gap: 10, background: color.warnBg, borderRadius: 14, padding: '12px 14px' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.warnText} strokeWidth="2.3" strokeLinecap="round" style={{ flexShrink: 0 }}>
            <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
          </svg>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: color.warnTextDeep }}>{lowBannerText}</span>
        </div>
      )}

      <div className="scr" style={{ flex: 1, overflow: 'auto', padding: '16px 22px 120px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {review.cats.map((c) => {
            const editing = state.editingId === c.id;
            const value = c.override != null ? c.override : loc(c, 'sample');
            return (
              <div
                key={c.id}
                style={{
                  background: c.low ? color.warnBgSoft : '#FFFFFF',
                  border: `1.5px solid ${c.low ? color.warnBorder : color.borderCream2}`,
                  borderRadius: 18,
                  padding: '15px 16px',
                  boxShadow: '0 1px 0 rgba(23,58,75,.03)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700, color: color.inkMute, letterSpacing: '.3px', textTransform: 'uppercase' }}>{loc(c, 'name')}</div>
                  {c.low && (
                    <span style={{ fontSize: 11, fontWeight: 700, color: color.warnText, background: color.warnBg, padding: '3px 8px', borderRadius: 7 }}>{t.check}</span>
                  )}
                </div>
                {editing ? (
                  <input
                    value={value}
                    onChange={(e) => setField(c.id, e.target.value)}
                    onBlur={() => update({ editingId: null })}
                    autoFocus
                    style={{
                      width: '100%',
                      marginTop: 8,
                      padding: '10px 12px',
                      border: `1.5px solid ${color.teal}`,
                      borderRadius: 12,
                      background: '#fff',
                      fontSize: 16,
                      fontWeight: 600,
                      color: color.ink,
                      outline: 'none',
                    }}
                  />
                ) : (
                  <div
                    onClick={() => update({ editingId: c.id })}
                    style={{
                      marginTop: 7,
                      fontSize: 16.5,
                      fontWeight: 600,
                      color: color.ink,
                      lineHeight: 1.4,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      cursor: 'pointer',
                    }}
                  >
                    <span>{value}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.chevron2} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '14px 22px calc(16px + env(safe-area-inset-bottom))', borderTop: `1px solid ${color.borderCream}`, background: color.cream, display: 'flex', gap: 12 }}>
        <button
          onClick={() => go('export', { sent: false })}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            padding: 17,
            border: `1.5px solid ${color.ink}`,
            background: '#fff',
            borderRadius: 18,
            fontSize: 16,
            fontWeight: 800,
            color: color.ink,
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
          </svg>
          {t.exportBtn}
        </button>
        <button
          onClick={() => go('export', { sent: false })}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            padding: 17,
            border: 'none',
            background: color.amber,
            borderRadius: 18,
            fontSize: 16,
            fontWeight: 800,
            color: color.ink,
            boxShadow: '0 14px 24px -14px rgba(235,164,31,.8)',
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
          </svg>
          {t.sendBtn}
        </button>
      </div>
    </>
  );
}
