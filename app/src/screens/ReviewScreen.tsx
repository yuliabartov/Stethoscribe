import { useEffect, useRef } from 'react';
import { BackButton } from '../components/BackButton';
import { FieldEditor } from '../components/FieldEditor';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';

export function ReviewScreen() {
  const { state, t, rtl, loc, tplByName, go, update, setField, setReportName, saveReport, toggleDictation, onLiveTranscript, onPartialFields } = useStethoscribe();
  const review = state.review!;
  const liveRef = useRef<HTMLSpanElement>(null);
  // Ghost-text spans per field (keyed by array index, matching how dictation
  // fields are addressed) — updated directly via DOM writes, bypassing React
  // state, since interim results can fire several times a second.
  const partialRefs = useRef(new Map<number, HTMLSpanElement | null>());

  // Live "hearing…" preview in the mic pill — written straight to the DOM (like
  // the exam) so the engine's captured words show immediately, before a spoken
  // finding routes into its field.
  useEffect(() => {
    if (!state.dictating) return;
    if (liveRef.current) liveRef.current.textContent = t.dictationListening;
    return onLiveTranscript((text) => {
      if (liveRef.current) liveRef.current.textContent = text || t.dictationListening;
    });
  }, [state.dictating, onLiveTranscript, t.dictationListening]);

  // Real-time streaming preview: as interim words come in, show the field
  // they'd currently map to as lighter ghost text — clears once dictation
  // stops, and per-field once that field's committed value supersedes it.
  useEffect(() => {
    if (!state.dictating) {
      partialRefs.current.forEach((el) => { if (el) el.textContent = ''; });
      return;
    }
    return onPartialFields((fields) => {
      const byIdx = new Map(fields.map((f) => [Number(f.id), f.value]));
      partialRefs.current.forEach((el, idx) => {
        if (el) el.textContent = byIdx.get(idx) ?? '';
      });
    });
  }, [state.dictating, onPartialFields]);

  const lowCount = review.cats.filter((c) => c.low).length;
  const hasLow = lowCount > 0;
  const lowBannerText = rtl
    ? `${lowCount} שדות דורשים בדיקה מהירה — הקש לעריכה`
    : `${lowCount} fields need a quick check — tap to edit`;
  const reviewTemplate = tplByName(review.templateName);
  const reviewTemplateName = loc(reviewTemplate, 'name');
  const backScreen = state.nav === 'reports' ? 'reports' : 'home';
  const dictationErrorText =
    state.dictationError === 'unsupported'
      ? t.voiceUnsupported
      : state.dictationError === 'language-not-supported'
        ? t.voiceLangUnavailable
        : state.dictationError === 'network'
          ? t.voiceNetworkError
          : t.micDenied;

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
          {review.cats.map((c, idx) => {
            const editing = state.editingId === c.id;
            const value = c.override ?? '';
            // Older reports (saved before options were persisted) carry no
            // options on the review cat — fall back to the current template's
            // matching category so List fields still show their pickers.
            const tplCat = reviewTemplate?.cats.find((tc) => tc.name === c.name);
            const options = c.options ?? tplCat?.options ?? null;
            const optionsHe = c.optionsHe ?? tplCat?.optionsHe ?? null;
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
                  <FieldEditor type={c.type} value={value} options={options} optionsHe={optionsHe} rtl={rtl} onChange={(val) => setField(c.id, val)} close={() => update({ editingId: null })} cancelLabel={t.cancel} />
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
                    <span style={!value ? { color: color.muted, fontStyle: 'italic' } : undefined}>{value || t.emptyField}</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color.chevron2} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                    </svg>
                  </div>
                )}
                {/* Streaming dictation preview — filled/cleared via direct DOM
                    writes (see onPartialFields effect above), not React state,
                    since interim speech results can arrive several times/sec. */}
                {state.dictating && !editing && (
                  <span
                    ref={(el) => { partialRefs.current.set(idx, el); }}
                    style={{
                      display: 'block',
                      marginTop: 4,
                      fontSize: 14,
                      fontWeight: 600,
                      fontStyle: 'italic',
                      color: color.teal,
                      opacity: 0.55,
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '14px 22px calc(16px + env(safe-area-inset-bottom))', borderTop: `1px solid ${color.borderCream}`, background: color.cream, display: 'flex', gap: 12 }}>
        <button
          onClick={() => go('export', { sent: false, sending: false, sendError: null })}
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
          onClick={saveReport}
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 9,
            padding: 17,
            border: 'none',
            background: color.teal,
            borderRadius: 18,
            fontSize: 16,
            fontWeight: 800,
            color: '#fff',
            boxShadow: '0 14px 24px -14px rgba(45,212,176,.6)',
          }}
        >
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M17 21v-8H7v8M7 3v5h8" />
          </svg>
          {t.saveBtn}
        </button>
      </div>

      {/*
        Floating dictation control — same teal-gradient circle, navy mic glyph,
        and ssPulse rings as the "new exam" mic, so resuming voice in the report
        editor feels identical. It splices speech into whichever field is open
        (opening the first one if none is), leaving typing fully available.
        Absolutely positioned against PhoneFrame's relative inner container and
        anchored to the inline-end edge so it mirrors correctly under RTL.
      */}
      <div
        style={{
          position: 'absolute',
          insetInlineEnd: 18,
          bottom: 96,
          width: 60,
          height: 60,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 20,
        }}
      >
        {(state.dictating || state.dictationError) && (
          <div
            style={{
              position: 'absolute',
              bottom: 72,
              insetInlineEnd: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              maxWidth: 230,
              width: state.dictationError ? 'max-content' : undefined,
              whiteSpace: state.dictationError ? 'normal' : 'nowrap',
              background: state.dictationError ? color.warnBg : color.ink,
              color: state.dictationError ? color.warnTextDeep : '#fff',
              padding: '9px 13px',
              borderRadius: 16,
              fontSize: 12.5,
              fontWeight: 700,
              lineHeight: 1.35,
              textAlign: 'start',
              boxShadow: '0 12px 26px -14px rgba(23,58,75,.6)',
            }}
          >
            {state.dictationError ? (
              <span>{dictationErrorText}</span>
            ) : (
              <>
                <span style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: 14, flexShrink: 0 }}>
                  {[0, 0.15, 0.3].map((delay) => (
                    <span key={delay} style={{ width: 3, height: 14, borderRadius: 2, background: color.tealBright, animation: `ssBar .9s ease-in-out infinite ${delay}s` }} />
                  ))}
                </span>
                <span ref={liveRef} style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}>{t.dictationListening}</span>
              </>
            )}
          </div>
        )}

        {state.dictating && (
          <>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color.examRing, animation: 'ssPulse 2.4s ease-out infinite' }} />
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color.examRing, animation: 'ssPulse 2.4s ease-out infinite 1.2s' }} />
          </>
        )}

        <button
          onClick={toggleDictation}
          // Keep focus (and the open field) from being stolen on tap so the
          // dictation target stays registered.
          onPointerDown={(e) => e.preventDefault()}
          aria-label={state.dictating ? t.dictationStop : t.dictationStart}
          aria-pressed={state.dictating}
          style={{
            position: 'relative',
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: 'none',
            background: `linear-gradient(135deg,${color.tealBright},${color.teal})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 14px 30px -8px rgba(45,212,176,.6)',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={color.examMicIcon} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
          </svg>
        </button>
      </div>
    </>
  );
}
