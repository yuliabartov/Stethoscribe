import { memo, useEffect, useRef, type CSSProperties } from 'react';
import { BackButton } from '../components/BackButton';
import { FieldEditor } from '../components/FieldEditor';
import { loc as locField, type Dict } from '../i18n';
import { useStethoscribe } from '../state/StethoscribeContext';
import { color } from '../theme';
import type { ExamCategory, Lang } from '../types';

// The card list is isolated and memoized so the per-second timer and live
// "hearing…" transcript updates don't re-render it — re-rendering it mid-scroll
// cancels the touch scroll on iOS. It only re-renders when the fields change.
// Every callback prop below must be referentially stable (see the useRef-backed
// handlers in ExamScreen) or the memo breaks and the scroll freeze returns.
const ExamFields = memo(function ExamFields({
  cats,
  lang,
  t,
  rtl,
  micError,
  editingId,
  onEdit,
  onSetField,
  onClose,
}: {
  cats: ExamCategory[];
  lang: Lang;
  t: Dict;
  rtl: boolean;
  micError: string | null;
  editingId: string | null;
  onEdit: (id: string) => void;
  onSetField: (idx: number, val: string) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
      {cats.map((c, idx) => {
        const active = c.status === 'active';
        const done = c.status === 'done';
        const pending = c.status === 'pending';
        const low = c.low && done;
        const raw = c.override != null ? c.override : locField(lang, c, 'sample');
        // Captured numbers show their template unit; samples already embed one.
        const val = c.override && c.type === 'Number' && c.unit ? `${raw} ${c.unit}` : raw;
        const editing = editingId === 'e' + idx;

        const cardStyle: CSSProperties = {
          display: 'flex',
          flexDirection: 'column',
          gap: 7,
          padding: '17px 18px',
          borderRadius: 20,
          transition: 'all .35s',
          border: `2px solid ${active ? color.tealBright : low ? color.warnBorder : color.borderCream2}`,
          background: active ? color.examActiveBg : '#FFFFFF',
          boxShadow: active ? '0 12px 28px -12px rgba(45,212,176,.45)' : '0 1px 0 rgba(23,58,75,.03)',
          opacity: pending ? 0.5 : 1,
        };
        const badgeStyle: CSSProperties = active
          ? { fontSize: 12, fontWeight: 800, color: color.examActiveText, background: color.tealWash2, padding: '4px 11px', borderRadius: 999, animation: 'ssBlink 1.2s infinite', whiteSpace: 'nowrap' }
          : done
            ? { fontSize: 14, fontWeight: 800, color: color.teal }
            : { fontSize: 12, fontWeight: 700, color: color.examWaitingText, whiteSpace: 'nowrap' };
        const valueStyle: CSSProperties = done
          ? { fontSize: 18, fontWeight: 700, color: low ? color.warnTextDeep : color.ink, animation: 'ssFade .4s ease' }
          : active
            ? { fontSize: 16, fontWeight: 600, color: color.teal, fontStyle: 'italic' }
            : { fontSize: 16, fontWeight: 600, color: color.chevron3 };
        const valueText = done ? val : active && !micError ? t.capturing : '—';
        const badge = active ? t.listening : done ? '✓' : t.waiting;

        return (
          <div key={idx} style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: active ? color.examActiveText : color.ink }}>{locField(lang, c, 'name')}</div>
              <div style={badgeStyle}>{badge}</div>
            </div>
            {editing ? (
              <FieldEditor
                type={c.type}
                value={c.override != null ? c.override : ''}
                options={c.options ?? null}
                optionsHe={c.optionsHe ?? null}
                rtl={rtl}
                onChange={(v) => onSetField(idx, v)}
                close={onClose}
                cancelLabel={t.cancel}
              />
            ) : (
              <div
                onClick={() => onEdit('e' + idx)}
                style={{ ...valueStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, cursor: 'pointer' }}
              >
                <span>{valueText}</span>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={color.chevron3} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </div>
            )}
            {low && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 2, padding: '4px 10px', borderRadius: 9, background: color.warnBg }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color.warnText} strokeWidth="2.4" strokeLinecap="round">
                  <path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
                </svg>
                <span style={{ fontSize: 12, fontWeight: 700, color: color.warnTextDeep }}>{t.lowReview}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
});

// Opt-in diagnostic overlay (toggled by tapping the "RECORDING · time" label).
// Shows the raw recognizer transcript against what the match engine captured, so
// a voice miss can be reported precisely ("said X, engine heard Y, matched Z").
// Text is selectable for long-press copy on a phone. Its own component so the
// per-second timer re-render doesn't churn it — it only re-renders on new state.
function DebugPanel() {
  const { state, update } = useStethoscribe();
  const info = state.debugInfo;
  const matched = (state.examCats || [])
    .map((c) => ({ name: locField(state.lang, c, 'name'), value: c.override, low: c.low && !!c.override }))
    .filter((m) => m.value != null && m.value !== '');
  const mono = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  const row: CSSProperties = { userSelect: 'text', WebkitUserSelect: 'text', fontFamily: mono, fontSize: 11.5, lineHeight: 1.5, color: color.ink, wordBreak: 'break-word', direction: 'ltr', textAlign: 'left' };
  const label: CSSProperties = { fontSize: 10, fontWeight: 800, letterSpacing: '.6px', color: color.chevron3, textTransform: 'uppercase', marginTop: 10 };
  return (
    <div style={{ marginTop: 14, padding: '14px 15px', borderRadius: 16, background: '#FFF7E6', border: `1.5px dashed ${color.warnBorder}` }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: color.warnTextDeep }}>◇ Voice diagnostics</span>
        <button onClick={() => update({ debug: false })} style={{ border: 'none', background: 'transparent', fontSize: 12, fontWeight: 800, color: color.chevron3, cursor: 'pointer' }}>Hide</button>
      </div>

      <div style={label}>Raw transcript (heard)</div>
      <div style={row}>{info?.raw?.trim() || '—'}</div>

      <div style={label}>Matched → field</div>
      {matched.length ? (
        matched.map((m, i) => (
          <div key={i} style={row}>
            {m.name}: <b>{m.value}</b>{m.low ? ' ⚠low' : ''}
          </div>
        ))
      ) : (
        <div style={row}>—</div>
      )}

      {!!info?.unassigned?.length && (
        <>
          <div style={label}>Unmatched speech</div>
          <div style={row}>{info.unassigned.join(' · ')}</div>
        </>
      )}

      {!!info?.alts?.length && (
        <>
          <div style={label}>Alternative hypotheses</div>
          {info.alts.map((a, i) => (
            <div key={i} style={row}>{a}</div>
          ))}
        </>
      )}
    </div>
  );
}

export function ExamScreen() {
  const { state, t, rtl, loc, tplForReport, fmt, go, endExam, togglePause, onLiveTranscript, setExamField, update } = useStethoscribe();
  const exam = state.exam!;
  const examTpl = tplForReport(exam.templateId, exam.templateName);
  const examDone = state.activeIdx === -1;
  // Any surfaced mic error means listening has stopped (transient no-speech
  // noise is filtered out before reaching state).
  const micDead = !!state.micError;
  const transcriptElRef = useRef<HTMLDivElement>(null);

  // ExamFields is memoized against the per-second timer re-render, so its
  // callbacks must keep a stable identity across renders. useRef(fn).current
  // pins the identity for the component's life while apiRef always points at
  // the latest context methods.
  const apiRef = useRef({ setExamField, update });
  apiRef.current = { setExamField, update };
  const onEdit = useRef((id: string) => apiRef.current.update({ editingId: id })).current;
  const onClose = useRef(() => apiRef.current.update({ editingId: null })).current;
  const onSetField = useRef((idx: number, v: string) => apiRef.current.setExamField(idx, v)).current;

  // Live "hearing…" text is written directly to the DOM here, bypassing React
  // state — it updates several times/sec while listening, and routing it
  // through setState re-rendered the whole screen that often, which on iOS was
  // enough churn to cancel an in-progress scroll on the card list below.
  useEffect(() => {
    if (!state.voiceActive) return;
    return onLiveTranscript((text) => {
      if (transcriptElRef.current) transcriptElRef.current.textContent = text;
    });
  }, [state.voiceActive, onLiveTranscript]);

  return (
    <>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: `linear-gradient(180deg,${color.examGradA} 0%,${color.examGradB} 100%)` }}>
        <div style={{ padding: '24px 24px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <BackButton onClick={() => go('home', { nav: 'home' })} dark />
            <div style={{ minWidth: 0 }}>
              {/* Tapping the recording label toggles the diagnostic overlay
                  (raw transcript vs. matched) — a discreet handle for reporting
                  voice misses without cluttering the normal exam UI. */}
              <div
                onClick={() => update({ debug: !state.debug })}
                style={{ fontSize: 13, fontWeight: 700, color: color.examRecordingLabel, letterSpacing: '.3px', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                {state.paused ? t.paused : t.recording} · {fmt(state.elapsed)}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#fff', marginTop: 2 }}>{examTpl ? loc(examTpl, 'name') : exam.templateName}</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {state.voiceActive && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.12)', padding: '8px 12px', borderRadius: 999 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={color.tealPale} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
                </svg>
                <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{state.lang === 'he' ? 'עברית' : 'English'}</span>
              </div>
            )}
            {/* A dead mic must not keep blinking "Live" — the chip is the one
                place the doctor glances at to confirm listening is on. */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: state.paused || micDead ? 'rgba(255,255,255,.12)' : color.examLiveBg, padding: '8px 13px', borderRadius: 999 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: micDead ? color.warnText : state.paused ? color.chevron3 : color.tealBright, animation: state.paused || micDead ? 'none' : 'ssBlink 1.1s infinite' }} />
              {/* The raw code doubles as a remote-diagnosis aid — a doctor can
                  read it off the screen when reporting a voice problem. */}
              <span style={{ fontSize: 13, fontWeight: 700, color: state.paused || micDead ? '#fff' : color.tealPale }}>{micDead ? `${t.micOff} · ${state.micError}` : state.paused ? t.paused : t.live}</span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '14px 0 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28 }}>
            <button
              onClick={togglePause}
              aria-label={state.paused ? 'Resume' : 'Pause'}
              style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              {state.paused ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="#fff">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              )}
            </button>

            <div style={{ position: 'relative', width: 120, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color.examRing, animation: 'ssPulse 2.4s ease-out infinite', animationPlayState: state.paused ? 'paused' : 'running' }} />
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: color.examRing, animation: 'ssPulse 2.4s ease-out infinite 1.2s', animationPlayState: state.paused ? 'paused' : 'running' }} />
              <span
                style={{
                  position: 'relative',
                  width: 88,
                  height: 88,
                  borderRadius: '50%',
                  background: `linear-gradient(135deg,${color.tealBright},${color.teal})`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: '0 14px 30px -8px rgba(45,212,176,.6)',
                  opacity: state.paused ? 0.55 : 1,
                  transition: 'opacity .2s',
                }}
              >
                <svg width="38" height="38" viewBox="0 0 24 24" fill="none" stroke={color.examMicIcon} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="2" width="6" height="12" rx="3" />
                  <path d="M5 10a7 7 0 0 0 14 0M12 17v5" />
                </svg>
              </span>
            </div>

            <button
              onClick={endExam}
              aria-label="Stop"
              style={{ width: 48, height: 48, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.14)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="#fff">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 22, marginTop: 14 }}>
            {[0, 0.15, 0.3, 0.45, 0.6].map((delay) => (
              <span key={delay} style={{ width: 4, height: 22, borderRadius: 3, background: color.tealBright, animation: `ssBar .9s ease-in-out infinite ${delay}s`, animationPlayState: state.paused ? 'paused' : 'running' }} />
            ))}
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: color.examHintText, marginTop: 12, textAlign: 'center', padding: '0 24px' }}>
            {state.paused ? t.pausedHint : examDone ? t.allCaptured : t.listeningHint}
          </div>
          {/*
            Fixed height + overflow:hidden + line-clamp: this box must NEVER
            resize as its content changes (mic state / live transcript text
            updates ~4x/sec while listening). On iOS, a layout box resizing
            mid-touch cancels the scroll gesture on the list below — that's
            why the list looked "stuck" only while actively listening.
          */}
          <div style={{ marginTop: 10, height: 36, maxWidth: 300, textAlign: 'center', padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            {state.micError ? (
              <div style={{ fontSize: 12, fontWeight: 600, color: color.tealPale, opacity: 0.9, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                {state.micError === 'unsupported'
                  ? t.voiceUnsupported
                  : state.micError === 'standalone'
                    ? t.voiceStandalone
                    : state.micError === 'restart-failed'
                      ? t.voiceStalled
                      : state.micError === 'language-not-supported'
                        ? t.voiceLangUnavailable
                        : state.micError === 'network'
                          ? t.voiceNetworkError
                          : t.micDenied}
              </div>
            ) : !state.voiceActive ? (
              <div style={{ fontSize: 13, fontWeight: 600, color: color.examHintText, opacity: 0.75 }}>{t.demoHint}</div>
            ) : (
              <div
                ref={transcriptElRef}
                style={{
                  fontSize: 14,
                  fontWeight: 600,
                  fontStyle: 'italic',
                  color: '#fff',
                  opacity: state.paused ? 0 : 0.92,
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  transition: 'opacity .2s',
                }}
              />
            )}
          </div>
        </div>

        <div className="scr" style={{ flex: 1, minHeight: 0, overflow: 'auto', background: color.cream, borderRadius: '30px 30px 0 0', padding: '20px 18px 130px' }}>
          <ExamFields
            cats={state.examCats || []}
            lang={state.lang}
            t={t}
            rtl={rtl}
            micError={state.micError}
            editingId={state.editingId}
            onEdit={onEdit}
            onSetField={onSetField}
            onClose={onClose}
          />
          {state.debug && <DebugPanel />}
        </div>
      </div>
      <div style={{ padding: '14px 22px calc(18px + env(safe-area-inset-bottom))', borderTop: `1px solid ${color.borderCream}`, background: color.cream }}>
        <button
          onClick={endExam}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            width: '100%',
            padding: 19,
            border: 'none',
            borderRadius: 20,
            background: color.ink,
            color: '#fff',
            fontSize: 17,
            fontWeight: 800,
            boxShadow: '0 16px 28px -14px rgba(23,58,75,.7)',
          }}
        >
          <span style={{ width: 18, height: 18, borderRadius: 5, background: '#fff' }} />
          {t.endExam}
        </button>
      </div>
    </>
  );
}
