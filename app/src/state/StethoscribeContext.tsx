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
import { DICT, loc as locImpl } from '../i18n';
import { normalize, processTranscript, type CapturedField, type CompiledCategory, type CompiledOption } from '../voice/matchEngine';
import { WebSpeechSource, isMobileDevice, isSpeechSupported } from '../voice/speechSource';
import type { AppState, AuthUser, BuilderCategory, CategoryDef, CategoryType, ExamCatStatus, ExamCategory, NavName, ReportItem, ReviewCategory, ScreenName, TemplateDef } from '../types';

const initialState: AppState = {
  lang: 'en',
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
  review: null,
  editingId: null,
  builder: null,
  adding: false,
  addType: 'Free text',
  addName: '',
  addOptions: '',
  exportFormats: { pdf: true, word: false },
  recipient: 'dr.amelia@northclinic.com',
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
  setReportName: (name: string) => void;
  openBuilder: (id: string) => void;
  newBuilder: () => void;
  moveCat: (idx: number, dir: 1 | -1) => void;
  delCat: (id: string) => void;
  confirmAdd: () => void;
  saveTemplate: () => void;
  delTemplate: (id: string) => void;
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

  const onLiveTranscript = (cb: (text: string) => void) => {
    transcriptListenersRef.current.add(cb);
    return () => {
      transcriptListenersRef.current.delete(cb);
    };
  };
  const notifyTranscript = (text: string) => {
    transcriptListenersRef.current.forEach((cb) => cb(text));
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
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error('Google sign-in failed', err);
    }
  };

  const signOut = async () => {
    try {
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
        sample: c.sample,
        sampleHe: c.sampleHe,
        low: !!c.low,
        override: c.override || null,
      }));
      return { ...s, screen: 'review', review: { templateName: s.exam!.templateName, name: '', reportId: null, cats }, editingId: null, voiceActive: false };
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
          const applied = applyCapture(s.examCats, result.fields);
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
    go('review', { review: { templateName: t.name, name: report.name || '', reportId: report.id, cats }, editingId: null, nav: 'reports' });
  };

  const setField = (id: string, val: string) => {
    setState((s) => ({
      ...s,
      review: s.review
        ? { ...s.review, cats: s.review.cats.map((c) => (c.id === id ? { ...c, override: val, low: false } : c)) }
        : s.review,
    }));
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

  const sendReport = () => {
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
    update({ sent: true });
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
    setReportName,
    openBuilder,
    newBuilder,
    moveCat,
    delCat,
    confirmAdd,
    saveTemplate,
    delTemplate,
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
