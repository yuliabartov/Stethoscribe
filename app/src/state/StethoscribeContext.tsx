import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import {
  deleteReportDoc,
  deleteTemplateDoc,
  getReportCats,
  saveReportDoc,
  saveTemplateDoc,
  seedDefaultTemplates,
  subscribeReports,
  subscribeTemplates,
} from '../data/firestoreStore';
import { auth, googleProvider } from '../firebase';
import { captureAccessToken, clearAccessToken, getAccessToken } from '../auth/googleToken';
import { DICT, loc as locImpl } from '../i18n';
import { normalize, processTranscript, type CapturedField, type CompiledCategory, type CompiledOption } from '../voice/matchEngine';
import { WebSpeechSource, ensureMicPermission, isMobileDevice, isSpeechSupported } from '../voice/speechSource';
import type { AppState, AuthUser, BuilderCategory, CategoryDef, CategoryType, ExamCatStatus, ExamCategory, NavName, ReportItem, ReviewCategory, ScreenName, TemplateDef } from '../types';

const initialState: AppState = {
  lang: 'he',
  screen: 'signin',
  nav: 'home',
  user: null,
  authReady: false,
  dataReady: false,
  selectedTemplateId: 'gp',
  templates: [],
  reports: [],
  exam: null,
  examCats: null,
  activeIdx: -1,
  elapsed: 0,
  paused: false,
  voiceActive: false,
  micError: null,
  dictating: false,
  dictationError: null,
  review: null,
  editingId: null,
  builder: null,
  adding: false,
  addType: 'Free text',
  addName: '',
  addOptions: '',
  exportFormats: { word: true },
  recipient: 'dr.amelia@northclinic.com',
  sending: false,
  sendError: null,
  sent: false,
  search: '',
  sort: 'recent',
};

function compileCats(cats: CategoryDef[]): CompiledCategory[] {
  return cats.map((c, i) => {
    const anchors = [c.name, c.nameHe]
      .filter((v): v is string => !!v)
      .map((v) => normalize(v))
      .filter(Boolean);
    let options: CompiledOption[] | undefined;
    if (c.type === 'List' && c.options && c.options.length) {
      options = c.options.map((opt, j) => {
        const terms = [opt, c.optionsHe?.[j]]
          .filter((v): v is string => !!v)
          .map((v) => normalize(v))
          .filter(Boolean);
        return { value: opt, terms };
      });
    }
    return { id: String(i), type: c.type, anchors, options };
  });
}

function applyCapture(cats: ExamCategory[], fields: CapturedField[]): { cats: ExamCategory[]; activeIdx: number } {
  const next = cats.map((c) => ({ ...c }));
  for (const f of fields) {
    const idx = Number(f.id);
    if (next[idx]) {
      next[idx].override = f.value;
      next[idx].low = f.low;
    }
  }
  let activeIdx = -1;
  for (let i = 0; i < next.length; i++) {
    const ov = next[i].override;
    next[i].status = ov && ov.trim() ? 'done' : 'pending';
  }
  for (let i = 0; i < next.length; i++) {
    if (next[i].status === 'pending') {
      next[i].status = 'active';
      activeIdx = i;
      break;
    }
  }
  return { cats: next, activeIdx };
}

interface StethoscribeApi {
  state: AppState;
  t: typeof DICT.en;
  rtl: boolean;
  dir: 'rtl' | 'ltr';
  loc: (obj: object | null | undefined, key: string) => string;
  /** Subscribes to live "hearing…" transcript text without going through React
   * state — while listening this fires several times/sec, and routing it
   * through setState was re-rendering the whole screen that often, which on
   * iOS was enough DOM churn to cancel an in-progress scroll on the list. */
  onLiveTranscript: (cb: (text: string) => void) => () => void;
  /** Subscribes to real-time field-value previews derived from the *interim*
   * (not-yet-final) dictation transcript — lets the report editor show
   * streaming ghost text per field instead of waiting for a pause. Same
   * bypass-React-state rationale as onLiveTranscript. */
  onPartialFields: (cb: (fields: CapturedField[]) => void) => () => void;
  /** Report-editor dictation toggle. Reuses the exam's capture pipeline so
   * spoken findings route into the report's fields by category — hands-free,
   * with no focused input, matching how the live exam records. */
  toggleDictation: () => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  update: (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => void;
  go: (screen: ScreenName, extra?: Partial<AppState>) => void;
  tplById: (id: string) => TemplateDef | undefined;
  tplByName: (name: string) => TemplateDef;
  accentFor: (name: string) => string;
  fmt: (n: number) => string;
  startExam: (id: string) => void;
  endExam: () => void;
  togglePause: () => void;
  reviewFromReport: (report: ReportItem) => void;
  setField: (id: string, val: string) => void;
  setExamField: (idx: number, val: string) => void;
  setReportName: (name: string) => void;
  openBuilder: (id: string) => void;
  newBuilder: () => void;
  moveCat: (idx: number, dir: 1 | -1) => void;
  delCat: (id: string) => void;
  confirmAdd: () => void;
  saveTemplate: () => void;
  delTemplate: (id: string) => void;
  saveReport: () => void;
  sendReport: () => void;
  delReport: (id: string) => void;
}

const StethoscribeCtx = createContext<StethoscribeApi | null>(null);

export function StethoscribeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechRef = useRef<WebSpeechSource | null>(null);
  const compiledRef = useRef<CompiledCategory[]>([]);
  const lastFinalRef = useRef('');
  const lastUiAtRef = useRef(0);
  const transcriptListenersRef = useRef(new Set<(text: string) => void>());
  // Report-editor dictation: its own speech source + compiled review categories,
  // and the last finalized transcript. Uses the exact same capture pipeline as
  // the live exam (compileCats + processTranscript) so spoken findings route
  // into the report's fields by category — no focused input / keyboard, which is
  // what made the exam work on iOS while a focused-text-field approach didn't.
  const dictationRef = useRef<WebSpeechSource | null>(null);
  const compiledReviewRef = useRef<CompiledCategory[]>([]);
  const lastDictationFinalRef = useRef('');
  const lastDictationUiAtRef = useRef(0);
  // Fields matched from the *interim* (not-yet-final) transcript — the
  // real-time preview shown as ghost text in the report editor until the
  // phrase finalizes and the value commits into state.review.
  const partialFieldsListenersRef = useRef(new Set<(fields: CapturedField[]) => void>());

  const onLiveTranscript = (cb: (text: string) => void) => {
    transcriptListenersRef.current.add(cb);
    return () => {
      transcriptListenersRef.current.delete(cb);
    };
  };
  const notifyTranscript = (text: string) => {
    transcriptListenersRef.current.forEach((cb) => cb(text));
  };
  const onPartialFields = (cb: (fields: CapturedField[]) => void) => {
    partialFieldsListenersRef.current.add(cb);
    return () => {
      partialFieldsListenersRef.current.delete(cb);
    };
  };
  const notifyPartialFields = (fields: CapturedField[]) => {
    partialFieldsListenersRef.current.forEach((cb) => cb(fields));
  };

  const clearTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
    tickRef.current = null;
    clockRef.current = null;
    if (speechRef.current) {
      speechRef.current.stop();
      speechRef.current = null;
    }
    // Stop report-editor dictation too — leaving the screen must release the mic.
    if (dictationRef.current) {
      dictationRef.current.stop();
      dictationRef.current = null;
    }
    lastDictationFinalRef.current = '';
  };

  useEffect(() => () => clearTimers(), []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        const user: AuthUser = {
          uid: fbUser.uid,
          email: fbUser.email,
          displayName: fbUser.displayName,
          photoURL: fbUser.photoURL,
        };
        setState((s) => ({
          ...s,
          user,
          authReady: true,
          screen: s.screen === 'signin' ? 'home' : s.screen,
          recipient: user.email || s.recipient,
        }));
        if (isMobileDevice()) ensureMicPermission();
      } else {
        clearTimers();
        setState((s) => ({
          ...s,
          user: null,
          authReady: true,
          screen: 'signin',
          nav: 'home',
          exam: null,
          examCats: null,
          review: null,
          builder: null,
          sent: false,
        }));
      }
    });
    return unsub;
  }, []);

  // Sync templates/reports from Firestore for whichever account is signed in,
  // so they're the same on every device. Re-subscribes whenever the uid
  // changes; tears down on sign-out.
  useEffect(() => {
    const uid = state.user?.uid;
    if (!uid) {
      setState((s) => ({ ...s, dataReady: false, templates: [], reports: [] }));
      return;
    }
    let cancelled = false;
    const unsubTemplates = subscribeTemplates(uid, (templates, firstSnapshotEmpty) => {
      if (cancelled) return;
      if (firstSnapshotEmpty) {
        // New account: seed starter templates. Don't mark dataReady yet — wait
        // for the snapshot this write triggers, so Home never briefly renders
        // with zero templates.
        seedDefaultTemplates(uid).catch((err) => console.error('Seeding templates failed', err));
        return;
      }
      setState((s) => ({ ...s, templates, dataReady: true }));
    });
    const unsubReports = subscribeReports(uid, (reports) => {
      if (cancelled) return;
      setState((s) => ({ ...s, reports }));
    });
    return () => {
      cancelled = true;
      unsubTemplates();
      unsubReports();
    };
  }, [state.user?.uid]);

  const signIn = async () => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      captureAccessToken(cred);
    } catch (err) {
      console.error('Google sign-in failed', err);
    }
  };

  const signOut = async () => {
    try {
      clearAccessToken();
      await firebaseSignOut(auth);
    } catch (err) {
      console.error('Sign-out failed', err);
    }
  };

  const update = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  };

  const go = (screen: ScreenName, extra?: Partial<AppState>) => {
    clearTimers();
    update((s) => ({ screen, nav: extra?.nav ?? s.nav, ...extra }));
  };

  const tplById = (id: string) => state.templates.find((t) => t.id === id);
  const tplByName = (name: string) => state.templates.find((t) => t.name === name) || state.templates[0];
  const accentFor = (name: string) => tplByName(name).accent;
  const fmt = (n: number) => {
    const m = Math.floor(n / 60);
    const s = n % 60;
    return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
  };

  const advance = () => {
    setState((s) => {
      if (!s.examCats || s.paused) return s;
      const cats = s.examCats.map((c) => ({ ...c }));
      const i = s.activeIdx;
      if (i >= 0 && i < cats.length) cats[i].status = 'done';
      let ni = i + 1;
      if (ni < cats.length) {
        cats[ni].status = 'active';
      } else {
        ni = -1;
        if (tickRef.current) clearInterval(tickRef.current);
        tickRef.current = null;
      }
      return { ...s, examCats: cats, activeIdx: ni };
    });
  };

  const endExam = () => {
    clearTimers();
    setState((s) => {
      const cats = (s.examCats || []).map((c, idx) => ({
        id: 'f' + idx,
        name: c.name,
        nameHe: c.nameHe,
        type: c.type,
        options: c.options,
        optionsHe: c.optionsHe,
        sample: c.sample,
        sampleHe: c.sampleHe,
        low: !!c.low,
        override: c.override || null,
      }));
      const templateName = s.exam!.templateName;
      const uid = s.user?.uid;
      const tplDisplayName = s.lang === 'he'
        ? (s.templates.find((tp) => tp.name === templateName)?.nameHe || templateName)
        : templateName;
      const sameTemplateCount = s.reports.filter((r) => r.template === templateName).length;
      const defaultName = `${tplDisplayName} ${sameTemplateCount + 1}`;
      if (uid) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        saveReportDoc(uid, null, { date, time: hh + ':' + mm, template: templateName, name: defaultName, cats })
          .then((id) => setState((prev) => prev.review ? { ...prev, review: { ...prev.review, reportId: id } } : prev))
          .catch((err) => console.error('Auto-save report failed', err));
      }
      return { ...s, screen: 'review', review: { templateName, name: defaultName, reportId: null, cats }, editingId: null, voiceActive: false, dictating: false, dictationError: null };
    });
    notifyTranscript('');
  };

  // Drive live capture from the speech source. Re-segmenting the whole
  // transcript on each result keeps field assignment stable. Restarts itself
  // on resume; clearTimers() stops the mic when leaving the exam.
  const startVoice = () => {
    lastFinalRef.current = '';
    lastUiAtRef.current = 0;
    const lang = state.lang === 'he' ? 'he-IL' : 'en-US';
    const source = new WebSpeechSource(lang);
    speechRef.current = source;
    source.start({
      onTranscript: (finalText, interim) => {
        // Interim results fire many times per second. Re-parsing the whole
        // transcript + re-rendering the app on each one froze scrolling/taps on
        // the phone, so: throttle the cheap "hearing…" updates, and only run the
        // heavy re-segmentation when the *finalized* transcript actually changes.
        const finalChanged = finalText !== lastFinalRef.current;
        const now = Date.now();
        if (!finalChanged && now - lastUiAtRef.current < 250) return;
        lastUiAtRef.current = now;
        const heard = interim || finalText.split(/\s+/).filter(Boolean).slice(-8).join(' ');
        // Live "hearing…" text bypasses React state entirely (see onLiveTranscript)
        // so it never triggers a re-render — only an actual captured field does.
        notifyTranscript(heard);
        if (!finalChanged) return;
        lastFinalRef.current = finalText;
        const result = processTranscript(finalText, compiledRef.current);
        setState((s) => {
          if (!s.examCats || s.screen !== 'exam') return s;
          // Don't let voice clobber the field the doctor is manually editing.
          const editingIdx = s.editingId?.startsWith('e') ? Number(s.editingId.slice(1)) : -1;
          const fields = editingIdx >= 0 ? result.fields.filter((f) => Number(f.id) !== editingIdx) : result.fields;
          const applied = applyCapture(s.examCats, fields);
          return { ...s, examCats: applied.cats, activeIdx: applied.activeIdx };
        });
        if (result.stop) endExam();
      },
      onError: (code) => update({ micError: code }),
      onEnd: () => {},
    });
  };

  const startExam = (id: string) => {
    const t = tplById(id);
    if (!t) return;
    const cats = t.cats.map((c) => ({
      name: c.name,
      nameHe: c.nameHe,
      type: c.type,
      options: c.options,
      optionsHe: c.optionsHe,
      sample: c.sample,
      sampleHe: c.sampleHe,
      low: !!c.low,
      override: null,
      status: 'pending' as ExamCatStatus,
    }));
    if (cats[0]) cats[0].status = 'active';
    clearTimers();
    // Voice exam is phone-only (spec §9). On a phone we do real voice (or show a
    // clear "unsupported browser" message); desktop keeps the simulated demo.
    const onPhone = isMobileDevice();
    const canVoice = onPhone && isSpeechSupported();
    update({
      screen: 'exam',
      exam: { templateName: t.name },
      examCats: cats,
      activeIdx: 0,
      elapsed: 0,
      paused: false,
      editingId: null,
      micError: onPhone && !canVoice ? 'unsupported' : null,
      voiceActive: canVoice,
    });
    notifyTranscript('');
    clockRef.current = setInterval(() => setState((s) => (s.paused ? s : { ...s, elapsed: s.elapsed + 1 })), 1000);
    if (canVoice) {
      compiledRef.current = compileCats(t.cats);
      startVoice();
    } else if (!onPhone) {
      tickRef.current = setInterval(advance, 1850);
    }
  };

  const togglePause = () => {
    const nextPaused = !state.paused;
    if (state.voiceActive) {
      if (nextPaused) speechRef.current?.stop();
      else startVoice();
    }
    if (nextPaused) notifyTranscript('');
    update({ paused: nextPaused });
  };

  const startDictation = () => {
    if (state.dictating) return;
    if (!state.review) return;
    if (!isSpeechSupported()) {
      update({ dictationError: 'unsupported' });
      return;
    }
    // Chrome's recognizer round-trips audio to Google's servers — fail fast
    // with a clear message instead of letting the engine spin on a dead
    // connection (Safari's on-device engine ignores this and works offline).
    if (!navigator.onLine) {
      update({ dictationError: 'network' });
      return;
    }
    lastDictationFinalRef.current = '';
    lastDictationUiAtRef.current = 0;
    // Same compile step the exam uses, but over the report's own categories, so
    // spoken section names route findings to the matching fields.
    compiledReviewRef.current = compileCats(state.review.cats);
    const lang = state.lang === 'he' ? 'he-IL' : 'en-US';
    const source = new WebSpeechSource(lang);
    dictationRef.current = source;
    source.start({
      onTranscript: (finalText, interim) => {
        // Interim results fire many times per second — throttle the cheap
        // "hearing…"/preview updates the same way the exam does, but never
        // throttle away an actual finalized-transcript change.
        const finalChanged = finalText !== lastDictationFinalRef.current;
        const now = Date.now();
        if (!finalChanged && now - lastDictationUiAtRef.current < 200) return;
        lastDictationUiAtRef.current = now;

        notifyTranscript(interim || finalText.split(/\s+/).filter(Boolean).slice(-6).join(' '));

        // Real-time preview: re-parse everything heard so far — finalized text
        // plus the words still in flight — so matched fields update as the
        // physician talks, not only once a phrase finalizes. Shown as ghost
        // text until the finalized commit below replaces it with the real value.
        const previewText = (finalText + (interim ? ' ' + interim : '')).trim();
        if (previewText) {
          notifyPartialFields(processTranscript(previewText, compiledReviewRef.current).fields);
        }

        if (!finalChanged) return;
        lastDictationFinalRef.current = finalText;
        const result = processTranscript(finalText, compiledReviewRef.current);
        setState((s) => {
          if (!s.review || s.screen !== 'review') return s;
          // Don't clobber a field the doctor is currently hand-editing.
          const editingIdx = s.review.cats.findIndex((c) => c.id === s.editingId);
          const cats = s.review.cats.slice();
          for (const f of result.fields) {
            const idx = Number(f.id);
            if (idx === editingIdx || !cats[idx]) continue;
            cats[idx] = { ...cats[idx], override: f.value, low: f.low };
          }
          return { ...s, review: { ...s.review, cats } };
        });
        // The preview above is now superseded by the committed value; clear
        // the ghost overlay so it doesn't sit duplicated on top of real text.
        notifyPartialFields([]);
      },
      onError: (code) => {
        dictationRef.current = null;
        notifyPartialFields([]);
        update({ dictationError: code, dictating: false });
      },
      onEnd: () => {},
    });
    notifyTranscript('');
    update({ dictating: true, dictationError: null });
  };

  const stopDictation = () => {
    dictationRef.current?.stop();
    dictationRef.current = null;
    notifyTranscript('');
    notifyPartialFields([]);
    update({ dictating: false });
  };

  const toggleDictation = () => {
    if (state.dictating) stopDictation();
    else startDictation();
  };

  // Loads the report's actual captured findings from Firestore (the lightweight
  // list subscription only carries date/time/template/name, not field values).
  const reviewFromReport = async (report: ReportItem) => {
    const t = tplByName(report.template);
    const uid = state.user?.uid;
    let cats: ReviewCategory[] = [];
    if (uid) {
      try {
        cats = (await getReportCats(uid, report.id)) || [];
      } catch (err) {
        console.error('Load report failed', err);
      }
    }
    go('review', { review: { templateName: t.name, name: report.name || '', reportId: report.id, cats }, editingId: null, nav: 'reports', dictating: false, dictationError: null });
  };

  const setField = (id: string, val: string) => {
    setState((s) => ({
      ...s,
      review: s.review
        ? { ...s.review, cats: s.review.cats.map((c) => (c.id === id ? { ...c, override: val, low: false } : c)) }
        : s.review,
    }));
  };

  // Manual override of a single field during the live exam (tap to fix what
  // voice mis-heard). Recomputes status/active exactly like applyCapture so a
  // filled field reads as "done" and the active marker moves to the next
  // still-empty one — clearing a field sends it back to pending/active.
  const setExamField = (idx: number, val: string) => {
    setState((s) => {
      if (!s.examCats || !s.examCats[idx]) return s;
      const cats = s.examCats.map((c) => ({ ...c }));
      cats[idx].override = val;
      cats[idx].low = false;
      let activeIdx = -1;
      for (let i = 0; i < cats.length; i++) {
        const ov = cats[i].override;
        cats[i].status = ov && ov.trim() ? 'done' : 'pending';
      }
      for (let i = 0; i < cats.length; i++) {
        if (cats[i].status === 'pending') {
          cats[i].status = 'active';
          activeIdx = i;
          break;
        }
      }
      return { ...s, examCats: cats, activeIdx };
    });
  };

  const setReportName = (name: string) => {
    setState((s) => {
      if (!s.review) return s;
      const review = { ...s.review, name };
      const reports = s.review.reportId
        ? s.reports.map((r) => (r.id === s.review!.reportId ? { ...r, name: name.trim() || null } : r))
        : s.reports;
      return { ...s, review, reports };
    });
  };

  const openBuilder = (id: string) => {
    const t = tplById(id);
    if (!t) return;
    const cats: BuilderCategory[] = t.cats.map((c, i) => ({
      id: 'b' + i + '_' + Math.random().toString(36).slice(2, 6),
      name: c.name,
      nameHe: c.nameHe,
      type: c.type,
      options: c.options ? c.options.slice() : null,
      optionsHe: c.optionsHe ? c.optionsHe.slice() : null,
    }));
    go('builder', { builder: { id: t.id, name: t.name, cats }, adding: false, addName: '', addOptions: '', addType: 'Free text', nav: 'templates' });
  };

  const newBuilder = () => {
    go('builder', {
      builder: {
        id: null,
        name: '',
        cats: [
          { id: 'n1', name: 'General Appearance', nameHe: 'מראה כללי', type: 'Free text', options: null, optionsHe: null },
          { id: 'n2', name: 'Findings', nameHe: 'ממצאים', type: 'Free text', options: null, optionsHe: null },
        ],
      },
      adding: false,
      addName: '',
      addOptions: '',
      addType: 'Free text',
      nav: 'templates',
    });
  };

  const moveCat = (idx: number, dir: 1 | -1) => {
    setState((s) => {
      if (!s.builder) return s;
      const cats = s.builder.cats.slice();
      const ni = idx + dir;
      if (ni < 0 || ni >= cats.length) return s;
      const tmp = cats[idx];
      cats[idx] = cats[ni];
      cats[ni] = tmp;
      return { ...s, builder: { ...s.builder, cats } };
    });
  };

  const delCat = (id: string) => {
    setState((s) => (s.builder ? { ...s, builder: { ...s.builder, cats: s.builder.cats.filter((c) => c.id !== id) } } : s));
  };

  const confirmAdd = () => {
    setState((s) => {
      if (!s.builder) return s;
      const name = s.addName.trim() || DICT[s.lang].types[s.addType as CategoryType];
      const opts = s.addType === 'List' ? s.addOptions.split(',').map((o) => o.trim()).filter(Boolean) : null;
      const cat: BuilderCategory = { id: 'c' + Date.now(), name, nameHe: null, type: s.addType, options: opts, optionsHe: null };
      return {
        ...s,
        builder: { ...s.builder, cats: s.builder.cats.concat([cat]) },
        adding: false,
        addName: '',
        addOptions: '',
        addType: 'Free text',
      };
    });
  };

  // Writes go to Firestore; the subscription set up above reflects the change
  // back into state.templates/state.reports, so these don't mutate local
  // state directly (aside from optimistic navigation/flags).
  const saveTemplate = () => {
    const b = state.builder;
    const uid = state.user?.uid;
    if (!b || !uid) return;
    const nm = b.name.trim() || DICT[state.lang].newTemplate;
    const cats: CategoryDef[] = b.cats.map((c) => ({
      name: c.name,
      nameHe: c.nameHe ?? null,
      type: c.type,
      options: c.options ?? null,
      optionsHe: c.optionsHe ?? null,
      sample: DICT.en.normal,
      sampleHe: DICT.he.normal,
    }));
    const existing = b.id ? tplById(b.id) : undefined;
    const tpl: TemplateDef = {
      id: b.id || 't' + Date.now(),
      name: nm,
      nameHe: existing?.nameHe ?? null,
      short: existing?.short || nm.slice(0, 2),
      shortHe: existing?.shortHe ?? null,
      accent: existing?.accent || '#8FB6A6',
      soft: existing?.soft || '#DDEAE3',
      cats,
    };
    saveTemplateDoc(uid, tpl).catch((err) => console.error('Save template failed', err));
    update({ screen: 'templates' });
  };

  const delTemplate = (id: string) => {
    const uid = state.user?.uid;
    if (!uid || state.templates.length <= 1) return;
    deleteTemplateDoc(uid, id).catch((err) => console.error('Delete template failed', err));
    if (state.selectedTemplateId === id) {
      const next = state.templates.find((t) => t.id !== id);
      if (next) update({ selectedTemplateId: next.id });
    }
  };

  const saveReport = () => {
    const uid = state.user?.uid;
    const review = state.review;
    if (!uid || !review) return;
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    saveReportDoc(uid, review.reportId, {
      date,
      time: hh + ':' + mm,
      template: review.templateName,
      name: review.name.trim() || null,
      cats: review.cats,
    }).catch((err) => console.error('Save report failed', err));
    go('reports', { nav: 'reports' });
  };

  const sendReport = async () => {
    const uid = state.user?.uid;
    const review = state.review;
    const user = state.user;
    if (!uid || !review || !user?.email) return;
    if (state.sending) return;

    update({ sending: true, sendError: null });

    try {
      const { generateReportDocx, reportFilename } = await import('../docx/reportDocx');
      const { sendReportEmail, GmailSendFailure } = await import('../mail/gmailSend');

      const tpl = tplByName(review.templateName);
      const templateDisplayName = locImpl(state.lang, tpl, 'name') || review.templateName;
      const docxBlob = await generateReportDocx({ review, templateName: templateDisplayName, lang: state.lang });
      const filename = reportFilename(templateDisplayName, review.name);
      const reportDisplayName = review.name?.trim() || templateDisplayName;
      const subject = `Stethoscribe. ${reportDisplayName}`;
      const body = DICT[state.lang].emailBody;

      // Access token may be stale (1hr TTL) or missing entirely if the user
      // signed in before this feature landed. Re-open signInWithPopup — Google
      // remembers the account + scope grant, so it's usually just a flash.
      const popupWithTimeout = (timeoutMs = 30_000) => {
        return Promise.race([
          signInWithPopup(auth, googleProvider),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Sign-in timed out')), timeoutMs),
          ),
        ]);
      };

      let token = getAccessToken();
      if (!token) {
        const cred = await popupWithTimeout();
        captureAccessToken(cred);
        token = getAccessToken();
      }
      if (!token) throw new Error('No access token after sign-in');

      try {
        await sendReportEmail({
          accessToken: token,
          to: state.recipient,
          from: user.email,
          subject,
          body,
          docxBlob,
          filename,
        });
      } catch (err) {
        if (err instanceof GmailSendFailure && err.code === 'auth') {
          clearAccessToken();
          const cred = await popupWithTimeout();
          captureAccessToken(cred);
          const fresh = getAccessToken();
          if (!fresh) throw err;
          await sendReportEmail({
            accessToken: fresh,
            to: state.recipient,
            from: user.email,
            subject,
            body,
            docxBlob,
            filename,
          });
        } else {
          throw err;
        }
      }

      // Persist the report only after Gmail actually accepted it — otherwise
      // a failed send would leave a "sent" row in the doctor's list.
      const now = new Date();
      const hh = String(now.getHours()).padStart(2, '0');
      const mm = String(now.getMinutes()).padStart(2, '0');
      const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      saveReportDoc(uid, review.reportId, {
        date,
        time: hh + ':' + mm,
        template: review.templateName,
        name: review.name.trim() || null,
        cats: review.cats,
      })
        .then((id) => setState((s) => s.review ? { ...s, review: { ...s.review, reportId: id } } : s))
        .catch((err) => console.error('Save report failed', err));

      update({ sending: false, sent: true });
    } catch (err) {
      // GmailSendFailure carries our own 'auth'|'network'|'unknown' code;
      // FirebaseError from signInWithPopup uses codes like 'auth/popup-blocked',
      // 'auth/popup-closed-by-user', 'auth/network-request-failed' — map those
      // to the corresponding banner so the doctor sees a meaningful message
      // rather than a generic "unknown" for a straightforward re-auth issue.
      console.error('Send report failed', err);
      const raw = err && typeof err === 'object' && 'code' in err ? String((err as { code: unknown }).code) : '';
      let code: 'auth' | 'network' | 'unknown';
      if (raw === 'auth' || raw === 'network' || raw === 'unknown') code = raw;
      else if (raw.startsWith('auth/network')) code = 'network';
      else if (raw.startsWith('auth/')) code = 'auth';
      else code = 'unknown';
      update({ sending: false, sendError: code });
    }
  };

  const delReport = (id: string) => {
    const uid = state.user?.uid;
    if (!uid) return;
    deleteReportDoc(uid, id).catch((err) => console.error('Delete report failed', err));
  };

  const rtl = state.lang === 'he';
  const api: StethoscribeApi = {
    state,
    t: DICT[state.lang],
    rtl,
    dir: rtl ? 'rtl' : 'ltr',
    loc: (obj, key) => locImpl(state.lang, obj, key),
    onLiveTranscript,
    onPartialFields,
    toggleDictation,
    signIn,
    signOut,
    update,
    go,
    tplById,
    tplByName,
    accentFor,
    fmt,
    startExam,
    endExam,
    togglePause,
    reviewFromReport,
    setField,
    setExamField,
    setReportName,
    openBuilder,
    newBuilder,
    moveCat,
    delCat,
    confirmAdd,
    saveTemplate,
    delTemplate,
    saveReport,
    sendReport,
    delReport,
  };

  return <StethoscribeCtx.Provider value={api}>{children}</StethoscribeCtx.Provider>;
}

export function useStethoscribe(): StethoscribeApi {
  const ctx = useContext(StethoscribeCtx);
  if (!ctx) throw new Error('useStethoscribe must be used within StethoscribeProvider');
  return ctx;
}

export function navColor(nav: NavName, key: NavName): string {
  return nav === key ? '#0E9A82' : '#A6B0AC';
}
