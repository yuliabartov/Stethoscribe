import type { CSSProperties } from 'react';
import { BackButton } from '../components/BackButton';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';

export function ExportScreen() {
  const { state, t, loc, tplByName, go, update, sendReport } = useStethoscribe();
  const ef = state.exportFormats;

  const fmtSel = (on: boolean): CSSProperties => ({
    position: 'relative',
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: 18,
    borderRadius: 22,
    background: '#fff',
    border: `2px solid ${on ? color.ink : color.borderCream2}`,
    boxShadow: on ? '0 12px 24px -16px rgba(23,58,75,.4)' : '0 1px 0 rgba(23,58,75,.03)',
    transition: 'all .2s',
  });
  const check = (on: boolean): CSSProperties => ({
    position: 'absolute',
    top: 14,
    insetInlineEnd: 14,
    width: 22,
    height: 22,
    borderRadius: '50%',
    display: on ? 'flex' : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    background: color.teal,
  });

  const fmtNames: string[] = [];
  if (ef.word) fmtNames.push('Word');
  if (ef.pdf) fmtNames.push('PDF');
  const formatSummary = fmtNames.length ? fmtNames.join(' + ') : t.noFormat;
  const reviewCount = state.review ? state.review.cats.length : 0;
  const summaryText = `${reviewCount} ${t.fields} · ${t.today} · ${formatSummary}`;
  const deliveredText = `${formatSummary}${t.deliveredTo}`;
  const reviewTemplateName = state.review ? loc(tplByName(state.review.templateName), 'name') : '';

  return (
    <>
      <div style={{ padding: '22px 18px 14px', display: 'flex', alignItems: 'center', gap: 12, borderBottom: `1px solid ${color.borderCream}` }}>
        <BackButton onClick={() => go('review')} />
        <div style={{ flex: 1, fontSize: 18, fontWeight: 800, color: color.ink }}>{t.exportTitle}</div>
      </div>

      <div className="scr" style={{ flex: 1, overflow: 'auto', padding: '22px 22px 130px' }}>
        <h2 style={{ margin: '0 0 12px', fontSize: 16, fontWeight: 800, color: color.ink }}>{t.format}</h2>
        <div style={{ display: 'flex', gap: 13 }}>
          <button onClick={() => update((s) => ({ exportFormats: { ...s.exportFormats, word: !s.exportFormats.word } }))} style={fmtSel(ef.word)}>
            <span style={{ width: 46, height: 46, borderRadius: 14, background: color.wordIconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.wordIconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M8 13l1.5 5 1.5-4 1.5 4 1.5-5" />
              </svg>
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: color.ink }}>Word</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: color.muted, marginTop: 2 }}>{t.editableDocx}</span>
            <span style={check(ef.word)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
          </button>
          <button onClick={() => update((s) => ({ exportFormats: { ...s.exportFormats, pdf: !s.exportFormats.pdf } }))} style={fmtSel(ef.pdf)}>
            <span style={{ width: 46, height: 46, borderRadius: 14, background: color.pdfIconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color.pdfIconColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
              </svg>
            </span>
            <span style={{ fontSize: 16, fontWeight: 800, color: color.ink }}>PDF</span>
            <span style={{ fontSize: 12.5, fontWeight: 600, color: color.muted, marginTop: 2 }}>{t.printReady}</span>
            <span style={check(ef.pdf)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            </span>
          </button>
        </div>

        <h2 style={{ margin: '28px 0 12px', fontSize: 16, fontWeight: 800, color: color.ink }}>{t.sendTo}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: '#fff', border: `1.5px solid ${color.borderCream3}`, borderRadius: 16, padding: 6, paddingInlineStart: 16 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color.muted} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m22 7-10 6L2 7" />
          </svg>
          <input
            value={state.recipient}
            onChange={(e) => update({ recipient: e.target.value })}
            dir="ltr"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15.5, fontWeight: 600, color: color.ink, outline: 'none', padding: '10px 0', textAlign: 'start' }}
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 9, paddingInlineStart: 4 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color.teal} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M20 6 9 17l-5-5" />
          </svg>
          <span style={{ fontSize: 12.5, fontWeight: 600, color: color.inkSoft }}>{t.defaultsInbox}</span>
        </div>

        <div style={{ marginTop: 26, background: color.tealSoftBg, borderRadius: 18, padding: '16px 18px' }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: color.inkMute, letterSpacing: '.3px' }}>{t.summary}</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: color.ink, marginTop: 6 }}>{reviewTemplateName}</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: color.inkSoft, marginTop: 3 }}>{summaryText}</div>
        </div>
      </div>

      <div style={{ padding: '14px 22px calc(18px + env(safe-area-inset-bottom))', borderTop: `1px solid ${color.borderCream}`, background: color.cream }}>
        {state.sendError && (
          <div style={{ marginBottom: 12, background: color.warnBg, borderRadius: 14, padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.warnText} strokeWidth="2.3" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: color.warnTextDeep }}>
              {state.sendError === 'auth' ? t.sendFailedAuth : state.sendError === 'network' ? t.sendFailedNetwork : t.sendFailedUnknown}
            </span>
          </div>
        )}
        <button
          onClick={() => { if (!state.sending) { update({ sendError: null }); sendReport(); } }}
          disabled={state.sending}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            padding: 18,
            border: 'none',
            borderRadius: 18,
            background: state.sending ? color.borderCream2 : color.amber,
            color: color.ink,
            fontSize: 17,
            fontWeight: 800,
            boxShadow: state.sending ? 'none' : '0 14px 26px -14px rgba(235,164,31,.8)',
            cursor: state.sending ? 'wait' : 'pointer',
            opacity: state.sending ? 0.75 : 1,
          }}
        >
          {state.sending ? (
            <>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'ssSpin 1s linear infinite' }}>
                <path d="M21 12a9 9 0 1 1-6.2-8.55" />
              </svg>
              {t.sendingReport}
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={color.ink} strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z" />
              </svg>
              {state.sendError ? t.tryAgain : t.sendReport}
            </>
          )}
        </button>
      </div>

      {state.sent && (
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(15,46,60,.55)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, zIndex: 30 }}>
          <div style={{ background: '#fff', borderRadius: 28, padding: '34px 28px', textAlign: 'center', width: '100%', maxWidth: 320, boxShadow: '0 30px 60px -20px rgba(0,0,0,.4)', animation: 'ssFade .3s ease' }}>
            <div style={{ width: 84, height: 84, borderRadius: '50%', background: color.tealWash, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto', animation: 'ssPop .5s cubic-bezier(.2,.8,.3,1.2)' }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: color.teal, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
            </div>
            <div style={{ fontSize: 21, fontWeight: 800, color: color.ink, marginTop: 18 }}>{t.reportSent}</div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: color.inkSoft, marginTop: 6, lineHeight: 1.5 }}>
              {deliveredText}
              <br />
              <span dir="ltr">{state.recipient}</span>
            </div>
            <button
              onClick={() => go('home', { nav: 'home', sent: false })}
              style={{ width: '100%', marginTop: 22, padding: 15, border: 'none', borderRadius: 15, background: color.ink, color: '#fff', fontSize: 15.5, fontWeight: 800 }}
            >
              {t.backToHome}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
