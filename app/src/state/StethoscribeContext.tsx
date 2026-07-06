import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut } from 'firebase/auth';
import {
  deleteReportDoc,
  deleteTemplateDoc,
  getReportDetail,
  purgeOfflineCache,
  saveReportDoc,
  saveTemplateDoc,
  seedDefaultTemplates,
  subscribeReports,
  subscribeTemplates,
} from '../data/firestoreStore';
import { auth, googleProvider } from '../firebase';
import { captureAccessToken, clearAccessToken, getAccessToken, isTokenFresh } from '../auth/googleToken';
import { buildReportAttachments } from '../export/reportAttachments';
import { DICT, loc as locImpl } from '../i18n';
import { isValidEmail } from '../mail/emailAddress';
import { FATAL_MIC_ERRORS, playCaptureFeedback, playFailureFeedback, primeAudioFeedback } from '../voice/feedback';
import { normalize, processTranscript, type CapturedField, type CompiledCategory, type CompiledOption } from '../voice/matchEngine';
import { WebSpeechSource, ensureMicPermission, isMobileDevice, isSpeechSupported } from '../voice/speechSource';
import { keepScreenAwake, releaseScreenWakeLock } from '../voice/wakeLock';
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
  editCatId: null,
  addType: 'Free text',
  addName: '',
  addNameHe: '',
  addOptions: '',
  addAliases: '',
  addUnit: '',
  addMin: '',
  addMax: '',
  exportFormats: { pdf: false, word: true },
  // Filled with the doctor's own address on sign-in; empty (not a fake sample
  // address) until then so a mis-send to a made-up recipient can't happen.
  recipient: '',
  sending: false,
  sendError: null,
  sent: false,
  downloading: false,
  search: '',
  sort: 'recent',
};

function compileCats(cats: CategoryDef[]): CompiledCategory[] {
  return cats.map((c, i) => {
    const anchors = [c.name, c.nameHe, ...(c.aliases ?? [])]
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
    return { id: String(i), type: c.type, anchors, options, min: c.min ?? null, max: c.max ?? null };
  });
}

/** Token count matching processTranscript's whitespace segmentation. */
function countTokens(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

/** Where a hardware/browser Back should go from each screen — mirrors the
 * on-screen BackButton targets so both behave identically. Root screens
 * (home/signin) map to themselves, i.e. Back stays put rather than leaving
 * the app (see the popstate guard in the provider). */
function backTarget(s: AppState): { screen: ScreenName; extra?: Partial<AppState> } {
  switch (s.screen) {
    case 'exam':
      // Back mid-exam would silently stop the mic and drop everything the
      // doctor has said so far. Force the explicit End Exam button instead
      // (spec §5.2 hands-free intent). An edge-swipe on iOS Safari can't
      // accidentally kill the session anymore.
      return { screen: s.screen };
    case 'review':
      // Same protection while dictation is live.
      if (s.dictating) return { screen: s.screen };
      return s.nav === 'reports' ? { screen: 'reports', extra: { nav: 'reports' } } : { screen: 'home', extra: { nav: 'home' } };
    case 'export':
      return { screen: 'review' };
    case 'builder':
      return { screen: 'templates', extra: { nav: 'templates' } };
    case 'templates':
    case 'reports':
      return { screen: 'home', extra: { nav: 'home' } };
    default:
      return { screen: s.screen };
  }
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
  /** Resolve a report's template by stable id, falling back to the name
   * snapshot; undefined when the template was deleted. */
  tplForReport: (templateId: string | null | undefined, templateName: string) => TemplateDef | undefined;
  fmt: (n: number) => string;
  startExam: (id: string) => void;
  endExam: () => void;
  togglePause: () => void;
  reviewFromReport: (report: ReportItem) => void;
  setField: (id: string, val: string) => void;
  setExamField: (idx: number, val: string) => void;
  setReportName: (name: string) => void;
  setReportStatus: (status: 'draft' | 'final') => void;
  openBuilder: (id: string) => void;
  newBuilder: () => void;
  duplicateTemplate: (id: string) => void;
  moveCat: (idx: number, dir: 1 | -1) => void;
  delCat: (id: string) => void;
  startEditCat: (id: string) => void;
  confirmAdd: () => void;
  saveTemplate: () => void;
  delTemplate: (id: string) => void;
  saveReport: () => void;
  sendReport: () => void;
  downloadReport: () => void;
  delReport: (id: string) => void;
  assignUnassigned: (index: number, catId: string) => void;
  dismissUnassigned: (index: number) => void;
}

const StethoscribeCtx = createContext<StethoscribeApi | null>(null);

export function StethoscribeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>(initialState);
  // Latest state readable from stable event handlers (popstate) without
  // re-subscribing the listener on every render.
  const stateRef = useRef(state);
  stateRef.current = state;
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const clockRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speechRef = useRef<WebSpeechSource | null>(null);
  // Bumped whenever we tear down voice (clearTimers) so an in-flight, async
  // startVoice() that was awaiting the mic grant can tell it's stale and bail
  // instead of starting recognition after the doctor already left the exam.
  const voiceEpochRef = useRef(0);
  const compiledRef = useRef<CompiledCategory[]>([]);
  const lastFinalRef = useRef('');
  const lastUiAtRef = useRef(0);
  // Fields the doctor fixed (or cleared) by hand while voice was capturing,
  // mapped to the finalized-transcript token count at the moment of the edit.
  // The whole transcript is re-segmented on every speech result, so without
  // this a manual fix would be overwritten by re-applying an older utterance.
  // Only anchors heard *after* the edit (capture.start >= mark) may write to
  // the field again — deliberate re-dictation wins, stale re-parses don't.
  const examEditMarksRef = useRef(new Map<number, number>()); // exam field index → token mark
  const reviewEditMarksRef = useRef(new Map<string, number>()); // review cat id → token mark
  // Unassigned speech (spec §6.3): each re-parse re-derives the live session's
  // unmatched segments from the full transcript, so the session list REPLACES
  // rather than appends; segments from earlier sessions (a pause/resume
  // restarts the transcript) are folded into the base. Combined at endExam
  // into review.unassigned for the doctor to file or dismiss.
  const examUnassignedBaseRef = useRef<string[]>([]);
  const examSessionUnassignedRef = useRef<string[]>([]);
  // Same for report-editor dictation; folded into review.unassigned on stop.
  const dictationUnassignedRef = useRef<string[]>([]);
  // Last value voice committed per field — detects genuinely NEW captures so
  // the confirmation earcon fires once per capture, not once per re-parse.
  const lastCaptureValuesRef = useRef(new Map<string, string>());
  const lastDictationCaptureValuesRef = useRef(new Map<string, string>());
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
    voiceEpochRef.current++;
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
    flushDictationUnassigned();
    releaseScreenWakeLock();
  };

  // Dictation's unmatched speech lands in review.unassigned only when the
  // session ends — mid-session the list would churn on every re-parse.
  const flushDictationUnassigned = () => {
    const segs = dictationUnassignedRef.current;
    if (!segs.length) return;
    dictationUnassignedRef.current = [];
    setState((s) => (s.review ? { ...s, review: { ...s.review, unassigned: [...s.review.unassigned, ...segs] } } : s));
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
        // Deliberately NOT pre-requesting the mic here. iOS Safari treats
        // getUserMedia and SpeechRecognition as separate audio sessions —
        // pre-requesting on sign-in prompts once, then SpeechRecognition.start()
        // prompts AGAIN when the doctor hits Start Exam. Better to let
        // SpeechRecognition.start() handle its own grant inside the user's
        // click gesture — one prompt total, and only when voice is invoked.
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
      // One-time cleanup of legacy default templates (cardio, derm, peds) for
      // existing accounts that were seeded before we trimmed the defaults.
      const cleanupKey = `cleanup-legacy-defaults-v1-${uid}`;
      if (!localStorage.getItem(cleanupKey)) {
        const legacyIds = ['cardio', 'derm', 'peds'];
        const toDelete = templates.filter((t) => legacyIds.includes(t.id));
        if (toDelete.length > 0) {
          Promise.all(toDelete.map((t) => deleteTemplateDoc(uid, t.id)))
            .then(() => localStorage.setItem(cleanupKey, '1'))
            .catch((err) => console.error('Legacy template cleanup failed', err));
        } else {
          localStorage.setItem(cleanupKey, '1');
        }
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
      return;
    }
    // Shared-machine hygiene: the persistent cache keeps report content in
    // IndexedDB after sign-out, readable by the next person at the device.
    // clearIndexedDbPersistence requires a terminated Firestore instance, and
    // a terminated instance can't be restarted — reload to boot clean (the
    // signed-out app lands on the public landing page anyway).
    try {
      await purgeOfflineCache();
    } catch (err) {
      // e.g. another signed-in tab still holds the IndexedDB lease.
      console.error('Offline cache purge failed', err);
    }
    window.location.reload();
  };

  const update = (patch: Partial<AppState> | ((s: AppState) => Partial<AppState>)) => {
    setState((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }));
  };

  const go = (screen: ScreenName, extra?: Partial<AppState>) => {
    clearTimers();
    update((s) => ({ screen, nav: extra?.nav ?? s.nav, ...extra }));
  };

  // Browser/hardware Back handling. Screen-as-state has no URL history, so
  // without this the phone Back gesture leaves the app entirely — jarring
  // mid-exam. We keep one "guard" history entry present while signed in; a
  // Back press pops it, we route to the current screen's parent (backTarget)
  // and immediately re-push the guard so the next Back is caught too. From a
  // root screen Back is a no-op that stays in the app (native-app behavior).
  const guardUid = state.user?.uid;
  useEffect(() => {
    if (guardUid && window.location.pathname !== '/privacy') {
      window.history.pushState({ ssGuard: true }, '');
    }
  }, [guardUid]);

  useEffect(() => {
    const onPop = () => {
      // /privacy is a real path rendered outside the signed-in app — let the
      // browser navigate it normally.
      if (window.location.pathname === '/privacy') return;
      const s = stateRef.current;
      if (!s.user) return; // signed-out: landing page owns its own navigation
      const target = backTarget(s);
      if (target.screen !== s.screen) go(target.screen, target.extra);
      window.history.pushState({ ssGuard: true }, '');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // go/backTarget only touch refs + functional setState, so the first-render
    // closure stays correct for the app's lifetime — subscribe once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tplById = (id: string) => state.templates.find((t) => t.id === id);
  const tplByName = (name: string) => state.templates.find((t) => t.name === name) || state.templates[0];
  // Resolves a report's template: by stable id first (survives renames), then
  // by the name snapshot (legacy docs saved before ids were stored). Returns
  // undefined when the template was deleted — callers fall back to the
  // report's own name snapshot for display.
  const tplForReport = (templateId: string | null | undefined, templateName: string): TemplateDef | undefined =>
    (templateId ? state.templates.find((t) => t.id === templateId) : undefined) ??
    state.templates.find((t) => t.name === templateName);
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
    // Snapshot the exam's unmatched speech before the refs reset; it becomes
    // the review's resolvable "unassigned" list.
    const unassigned = examUnassignedBaseRef.current.concat(examSessionUnassignedRef.current);
    examUnassignedBaseRef.current = [];
    examSessionUnassignedRef.current = [];
    setState((s) => {
      const cats = (s.examCats || []).map((c, idx) => ({
        id: 'f' + idx,
        name: c.name,
        nameHe: c.nameHe,
        aliases: c.aliases ?? null,
        type: c.type,
        options: c.options,
        optionsHe: c.optionsHe,
        unit: c.unit ?? null,
        min: c.min ?? null,
        max: c.max ?? null,
        sample: c.sample,
        sampleHe: c.sampleHe,
        low: !!c.low,
        override: c.override || null,
      }));
      const templateName = s.exam!.templateName;
      const templateId = s.exam!.templateId;
      const uid = s.user?.uid;
      const tplDisplayName = s.lang === 'he'
        ? (s.templates.find((tp) => tp.id === templateId)?.nameHe || templateName)
        : templateName;
      const sameTemplateCount = s.reports.filter((r) => r.template === templateName).length;
      const defaultName = `${tplDisplayName} ${sameTemplateCount + 1}`;
      if (uid) {
        const now = new Date();
        const hh = String(now.getHours()).padStart(2, '0');
        const mm = String(now.getMinutes()).padStart(2, '0');
        const date = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        saveReportDoc(uid, null, { date, time: hh + ':' + mm, template: templateName, templateId, name: defaultName, cats, unassigned, status: 'draft' })
          .then((id) => setState((prev) => prev.review ? { ...prev, review: { ...prev.review, reportId: id } } : prev))
          .catch((err) => console.error('Auto-save report failed', err));
      }
      return { ...s, screen: 'review', review: { templateName, templateId, name: defaultName, reportId: null, cats, unassigned, status: 'draft', loadedUpdatedAt: null, dirty: false }, editingId: null, voiceActive: false, dictating: false, dictationError: null };
    });
    notifyTranscript('');
  };

  // Drive live capture from the speech source. Re-segmenting the whole
  // transcript on each result keeps field assignment stable. Restarts itself
  // on resume; clearTimers() stops the mic when leaving the exam.
  const startVoice = async () => {
    // Establish the mic grant via getUserMedia BEFORE opening the speech
    // recognizer. The browser remembers this grant for the session (and, on
    // Chrome/Android, across reloads — queryable via the Permissions API), so
    // SpeechRecognition.start() below silently reuses it instead of raising its
    // own prompt. On the next exam in the same session, ensureMicPermission
    // sees 'granted' and resolves instantly with no prompt at all. This is what
    // makes it "ask once, then remembered" rather than prompting per start.
    const epoch = ++voiceEpochRef.current;
    const perm = await ensureMicPermission();
    // Bailed out (doctor left the exam / paused) while we awaited the grant.
    if (voiceEpochRef.current !== epoch) return;
    if (perm === 'denied') {
      update({ micError: 'not-allowed' });
      return;
    }
    lastFinalRef.current = '';
    lastUiAtRef.current = 0;
    // New recognizer session ⇒ fresh empty transcript, so old marks (token
    // offsets into the previous transcript) are meaningless — and safe to
    // drop: the stale utterances they guarded against are gone with it.
    examEditMarksRef.current.clear();
    // The finished session's unmatched segments are final now — fold them
    // into the base so the new session's list doesn't overwrite them.
    examUnassignedBaseRef.current = examUnassignedBaseRef.current.concat(examSessionUnassignedRef.current);
    examSessionUnassignedRef.current = [];
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
        examSessionUnassignedRef.current = result.unassigned;
        // Audible/tactile confirmation for genuinely new captures — the doctor
        // isn't looking at the screen. Detected against the last value voice
        // committed per field, honoring the manual-edit marks.
        let newCapture = false;
        for (const f of result.fields) {
          if (!f.value) continue;
          const editMark = examEditMarksRef.current.get(Number(f.id));
          if (editMark !== undefined && f.start < editMark) continue;
          if (lastCaptureValuesRef.current.get(f.id) !== f.value) {
            lastCaptureValuesRef.current.set(f.id, f.value);
            newCapture = true;
          }
        }
        if (newCapture) playCaptureFeedback();
        setState((s) => {
          if (!s.examCats || s.screen !== 'exam') return s;
          // Don't let voice clobber the field the doctor is manually editing,
          // nor re-apply utterances older than a manual fix (examEditMarksRef).
          const editingIdx = s.editingId?.startsWith('e') ? Number(s.editingId.slice(1)) : -1;
          const fields = result.fields.filter((f) => {
            const idx = Number(f.id);
            if (idx === editingIdx) return false;
            const mark = examEditMarksRef.current.get(idx);
            return mark === undefined || f.start >= mark;
          });
          const applied = applyCapture(s.examCats, fields);
          return { ...s, examCats: applied.cats, activeIdx: applied.activeIdx };
        });
        if (result.stop) endExam();
      },
      onError: (code) => {
        // The doctor may be mid-palpation and not looking — a dead mic must
        // be heard/felt, not just shown.
        if (FATAL_MIC_ERRORS.has(code)) playFailureFeedback();
        update({ micError: code });
      },
      onEnd: () => {},
    });
  };

  const startExam = (id: string) => {
    const t = tplById(id);
    if (!t) return;
    const cats = t.cats.map((c) => ({
      name: c.name,
      nameHe: c.nameHe,
      aliases: c.aliases ?? null,
      type: c.type,
      options: c.options,
      optionsHe: c.optionsHe,
      unit: c.unit ?? null,
      min: c.min ?? null,
      max: c.max ?? null,
      sample: c.sample,
      sampleHe: c.sampleHe,
      low: !!c.low,
      override: null,
      status: 'pending' as ExamCatStatus,
    }));
    if (cats[0]) cats[0].status = 'active';
    clearTimers();
    examUnassignedBaseRef.current = [];
    examSessionUnassignedRef.current = [];
    lastCaptureValuesRef.current.clear();
    // Voice exam is phone-only (spec §9). On a phone we do real voice (or show a
    // clear "unsupported browser" message); desktop keeps the simulated demo.
    const onPhone = isMobileDevice();
    const canVoice = onPhone && isSpeechSupported();
    update({
      screen: 'exam',
      exam: { templateName: t.name, templateId: t.id },
      examCats: cats,
      activeIdx: 0,
      elapsed: 0,
      paused: false,
      editingId: null,
      micError: onPhone && !canVoice ? 'unsupported' : null,
      voiceActive: canVoice,
    });
    // The doctor may not touch the device for minutes — a sleeping screen
    // suspends SpeechRecognition and silently kills the hands-free exam.
    keepScreenAwake();
    // Inside the tap gesture, so the browser lets the earcons play later.
    primeAudioFeedback();
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

  const startDictation = async () => {
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
    // Prime the mic grant up front (same rationale as startVoice) so the
    // recognizer reuses it instead of prompting — and so a grant established
    // by the exam carries over to dictation silently, and vice-versa.
    const epoch = ++voiceEpochRef.current;
    const perm = await ensureMicPermission();
    if (voiceEpochRef.current !== epoch) return; // toggled off while awaiting
    if (perm === 'denied') {
      update({ dictationError: 'not-allowed' });
      return;
    }
    lastDictationFinalRef.current = '';
    lastDictationUiAtRef.current = 0;
    // Fresh dictation session ⇒ fresh transcript; old marks are stale (see
    // the matching reset in startVoice).
    reviewEditMarksRef.current.clear();
    dictationUnassignedRef.current = [];
    lastDictationCaptureValuesRef.current.clear();
    // Same compile step the exam uses, but over the report's own categories, so
    // spoken section names route findings to the matching fields.
    compiledReviewRef.current = compileCats(state.review.cats);
    // Cat ids by compiled index — captured fields carry the index, marks are
    // keyed by id. Stable for the whole session (review order never changes).
    const reviewIds = state.review.cats.map((c) => c.id);
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
          // Same manual-fix guard as the commit below, so the ghost preview
          // never advertises a value the commit would then refuse to apply.
          const preview = processTranscript(previewText, compiledReviewRef.current).fields.filter((f) => {
            const mark = reviewEditMarksRef.current.get(reviewIds[Number(f.id)]);
            return mark === undefined || f.start >= mark;
          });
          notifyPartialFields(preview);
        }

        if (!finalChanged) return;
        lastDictationFinalRef.current = finalText;
        const result = processTranscript(finalText, compiledReviewRef.current);
        dictationUnassignedRef.current = result.unassigned;
        // Same new-capture earcon as the live exam (see startVoice).
        let newCapture = false;
        for (const f of result.fields) {
          if (!f.value) continue;
          const editMark = reviewEditMarksRef.current.get(reviewIds[Number(f.id)]);
          if (editMark !== undefined && f.start < editMark) continue;
          if (lastDictationCaptureValuesRef.current.get(f.id) !== f.value) {
            lastDictationCaptureValuesRef.current.set(f.id, f.value);
            newCapture = true;
          }
        }
        if (newCapture) playCaptureFeedback();
        setState((s) => {
          if (!s.review || s.screen !== 'review') return s;
          // Don't clobber a field the doctor is currently hand-editing.
          const editingIdx = s.review.cats.findIndex((c) => c.id === s.editingId);
          const cats = s.review.cats.slice();
          for (const f of result.fields) {
            const idx = Number(f.id);
            if (idx === editingIdx || !cats[idx]) continue;
            // Skip utterances older than a manual fix (see examEditMarksRef).
            const mark = reviewEditMarksRef.current.get(cats[idx].id);
            if (mark !== undefined && f.start < mark) continue;
            cats[idx] = { ...cats[idx], override: f.value, low: f.low };
          }
          return { ...s, review: { ...s.review, cats, dirty: true } };
        });
        // The preview above is now superseded by the committed value; clear
        // the ghost overlay so it doesn't sit duplicated on top of real text.
        notifyPartialFields([]);
      },
      onError: (code) => {
        dictationRef.current = null;
        notifyPartialFields([]);
        releaseScreenWakeLock();
        if (FATAL_MIC_ERRORS.has(code)) playFailureFeedback();
        flushDictationUnassigned();
        update({ dictationError: code, dictating: false });
      },
      onEnd: () => {},
    });
    notifyTranscript('');
    keepScreenAwake();
    primeAudioFeedback();
    update({ dictating: true, dictationError: null });
  };

  const stopDictation = () => {
    voiceEpochRef.current++; // cancel any startDictation still awaiting the mic
    dictationRef.current?.stop();
    dictationRef.current = null;
    notifyTranscript('');
    notifyPartialFields([]);
    releaseScreenWakeLock();
    flushDictationUnassigned();
    update({ dictating: false });
  };

  const toggleDictation = () => {
    if (state.dictating) stopDictation();
    else startDictation();
  };

  // Loads the report's actual captured findings from Firestore (the lightweight
  // list subscription only carries date/time/template/name, not field values).
  const reviewFromReport = async (report: ReportItem) => {
    const uid = state.user?.uid;
    let cats: ReviewCategory[] = [];
    let unassigned: string[] = [];
    if (uid) {
      try {
        const detail = await getReportDetail(uid, report.id);
        if (detail) {
          cats = detail.cats;
          unassigned = detail.unassigned;
        }
      } catch (err) {
        console.error('Load report failed', err);
      }
    }
    const tpl = tplForReport(report.templateId, report.template);
    go('review', {
      review: {
        templateName: tpl?.name ?? report.template,
        templateId: report.templateId ?? tpl?.id ?? null,
        name: report.name || '',
        reportId: report.id,
        cats,
        unassigned,
        status: report.status,
        loadedUpdatedAt: report.updatedAt,
        dirty: false,
      },
      editingId: null,
      nav: 'reports',
      dictating: false,
      dictationError: null,
    });
  };

  // Toggle draft/final. Marks the editor dirty so it persists on the next Save
  // (consistent with how name/field edits persist) and updates the list badge.
  const setReportStatus = (status: 'draft' | 'final') => {
    setState((s) => {
      if (!s.review) return s;
      const reports = s.review.reportId
        ? s.reports.map((r) => (r.id === s.review!.reportId ? { ...r, status } : r))
        : s.reports;
      return { ...s, review: { ...s.review, status, dirty: true }, reports };
    });
  };

  // Files an unassigned speech segment into a field (appended after any text
  // already there) and drops it from the list. Marks the field hand-edited so
  // a live dictation session won't clobber the result.
  const assignUnassigned = (index: number, catId: string) => {
    reviewEditMarksRef.current.set(catId, countTokens(lastDictationFinalRef.current));
    setState((s) => {
      if (!s.review || index < 0 || index >= s.review.unassigned.length) return s;
      const seg = s.review.unassigned[index];
      const unassigned = s.review.unassigned.filter((_, i) => i !== index);
      const cats = s.review.cats.map((c) =>
        c.id === catId ? { ...c, override: c.override?.trim() ? c.override + ' ' + seg : seg, low: false } : c,
      );
      return { ...s, review: { ...s.review, cats, unassigned, dirty: true } };
    });
  };

  const dismissUnassigned = (index: number) => {
    setState((s) =>
      s.review ? { ...s, review: { ...s.review, unassigned: s.review.unassigned.filter((_, i) => i !== index), dirty: true } } : s,
    );
  };

  const setField = (id: string, val: string) => {
    // Hand-edited — only speech spoken from this point on may write to this
    // field again (see reviewEditMarksRef). Outside a dictation session the
    // transcript is empty, so the mark is 0 and blocks nothing.
    reviewEditMarksRef.current.set(id, countTokens(lastDictationFinalRef.current));
    setState((s) => ({
      ...s,
      review: s.review
        ? { ...s.review, dirty: true, cats: s.review.cats.map((c) => (c.id === id ? { ...c, override: val, low: false } : c)) }
        : s.review,
    }));
  };

  // Manual override of a single field during the live exam (tap to fix what
  // voice mis-heard). Recomputes status/active exactly like applyCapture so a
  // filled field reads as "done" and the active marker moves to the next
  // still-empty one — clearing a field sends it back to pending/active.
  const setExamField = (idx: number, val: string) => {
    // Hand-fixed (or hand-cleared) — only speech spoken from this point on may
    // write to this field again (see examEditMarksRef).
    examEditMarksRef.current.set(idx, countTokens(lastFinalRef.current));
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
      const review = { ...s.review, name, dirty: true };
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
      aliases: c.aliases ? c.aliases.slice() : null,
      type: c.type,
      options: c.options ? c.options.slice() : null,
      optionsHe: c.optionsHe ? c.optionsHe.slice() : null,
      unit: c.unit ?? null,
      min: c.min ?? null,
      max: c.max ?? null,
    }));
    go('builder', { builder: { id: t.id, name: t.name, cats, hideEmpty: !!t.hideEmpty }, adding: false, editCatId: null, addName: '', addNameHe: '', addOptions: '', addAliases: '', addUnit: '', addMin: '', addMax: '', addType: 'Free text', nav: 'templates' });
  };

  // Copy a template into a new one (spec §5.1) — fresh id + "(copy)" suffix,
  // same categories and settings. The subscription reflects the write back.
  const duplicateTemplate = (id: string) => {
    const t = tplById(id);
    const uid = state.user?.uid;
    if (!t || !uid) return;
    const suffix = state.lang === 'he' ? DICT.he.copySuffix : DICT.en.copySuffix;
    const copy: TemplateDef = {
      ...t,
      id: 't' + Date.now(),
      name: t.name + suffix,
      nameHe: t.nameHe ? t.nameHe + suffix : null,
      cats: t.cats.map((c) => ({ ...c })),
    };
    saveTemplateDoc(uid, copy).catch((err) => console.error('Duplicate template failed', err));
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
        hideEmpty: false,
      },
      adding: false,
      editCatId: null,
      addName: '',
      addNameHe: '',
      addOptions: '',
      addAliases: '',
      addUnit: '',
      addMin: '',
      addMax: '',
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
    setState((s) =>
      s.builder
        ? {
            ...s,
            builder: { ...s.builder, cats: s.builder.cats.filter((c) => c.id !== id) },
            // Deleting the category whose edit form is open closes the form.
            editCatId: s.editCatId === id ? null : s.editCatId,
          }
        : s,
    );
  };

  // Opens the shared category form pre-filled with an existing category's
  // values; confirmAdd applies the changes back to that category.
  const startEditCat = (id: string) => {
    const c = state.builder?.cats.find((x) => x.id === id);
    if (!c) return;
    update({
      editCatId: id,
      adding: false,
      addName: c.name,
      addNameHe: c.nameHe ?? '',
      addAliases: (c.aliases ?? []).join(', '),
      addType: c.type,
      addOptions: (c.options ?? []).join(', '),
      addUnit: c.unit ?? '',
      addMin: c.min != null ? String(c.min) : '',
      addMax: c.max != null ? String(c.max) : '',
    });
  };

  // Confirms the shared category form: appends a new category, or — when
  // editCatId is set — applies the values back onto that existing category.
  const confirmAdd = () => {
    setState((s) => {
      if (!s.builder) return s;
      const name = s.addName.trim() || DICT[s.lang].types[s.addType as CategoryType];
      const nameHe = s.addNameHe.trim() || null;
      const opts = s.addType === 'List' ? s.addOptions.split(',').map((o) => o.trim()).filter(Boolean) : null;
      const aliases = s.addAliases.split(',').map((a) => a.trim()).filter(Boolean);
      const parseBound = (v: string): number | null => {
        if (s.addType !== 'Number' || v.trim() === '') return null;
        const n = Number(v);
        return Number.isFinite(n) ? n : null;
      };
      const values = {
        name,
        nameHe,
        aliases: aliases.length ? aliases : null,
        type: s.addType,
        options: opts,
        unit: s.addType === 'Number' ? s.addUnit.trim() || null : null,
        min: parseBound(s.addMin),
        max: parseBound(s.addMax),
      };
      let cats: BuilderCategory[];
      if (s.editCatId) {
        cats = s.builder.cats.map((c) => {
          if (c.id !== s.editCatId) return c;
          // The form edits the primary options list only; keep the Hebrew
          // option translations while the list is unchanged, but drop them
          // once it changes — a misaligned translation silently mislabels
          // choices, whereas dropping falls back to the primary options.
          const sameOptions = JSON.stringify(c.options ?? null) === JSON.stringify(opts);
          return { ...c, ...values, optionsHe: sameOptions ? c.optionsHe ?? null : null };
        });
      } else {
        cats = s.builder.cats.concat([{ id: 'c' + Date.now(), ...values, optionsHe: null }]);
      }
      return {
        ...s,
        builder: { ...s.builder, cats },
        adding: false,
        editCatId: null,
        addName: '',
        addNameHe: '',
        addOptions: '',
        addAliases: '',
        addUnit: '',
        addMin: '',
        addMax: '',
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
      aliases: c.aliases ?? null,
      type: c.type,
      options: c.options ?? null,
      optionsHe: c.optionsHe ?? null,
      unit: c.unit ?? null,
      min: c.min ?? null,
      max: c.max ?? null,
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
      hideEmpty: b.hideEmpty,
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
      templateId: review.templateId,
      name: review.name.trim() || null,
      cats: review.cats,
      unassigned: review.unassigned,
      status: review.status,
    }).catch((err) => console.error('Save report failed', err));
    go('reports', { nav: 'reports' });
  };

  const sendReport = async () => {
    const uid = state.user?.uid;
    const review = state.review;
    const user = state.user;
    if (!uid || !review || !user?.email) return;
    if (state.sending) return;
    // Validated in the export screen too, but the sender is the last line of
    // defense — this also keeps CRLF out of gmailSend's hand-built MIME headers.
    const to = state.recipient.trim();
    if (!isValidEmail(to)) {
      update({ sendError: 'recipient' });
      return;
    }

    update({ sending: true, sendError: null });

    try {
      // Refresh the token FIRST — before any dynamic imports or async work —
      // so the signInWithPopup call stays inside Safari's user-gesture window.
      // Safari blocks popups that fire after an async boundary (like await
      // import()), which caused "sign-in expired" errors on the second send.
      if (!isTokenFresh()) {
        clearAccessToken();
        const cred = await signInWithPopup(auth, googleProvider);
        captureAccessToken(cred);
      }
      const token = getAccessToken();
      if (!token) throw new Error('No access token after sign-in');

      const { sendReportEmail } = await import('../mail/gmailSend');

      const tpl = tplForReport(review.templateId, review.templateName);
      const templateDisplayName = (tpl ? locImpl(state.lang, tpl, 'name') : '') || review.templateName;
      const reportDisplayName = review.name?.trim() || templateDisplayName;
      const subject = `Stethoscribe. ${reportDisplayName}`;
      const body = DICT[state.lang].emailBody;

      const attachments = await buildReportAttachments({
        review,
        templateName: templateDisplayName,
        lang: state.lang,
        formats: state.exportFormats,
        hideEmpty: tpl?.hideEmpty,
      });
      if (!attachments.length) throw new Error('No format selected');

      await sendReportEmail({
        accessToken: token,
        to,
        from: user.email,
        subject,
        body,
        attachments,
      });

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
        templateId: review.templateId,
        name: review.name.trim() || null,
        cats: review.cats,
        unassigned: review.unassigned,
        status: review.status,
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

  // Local export (spec §5.4): produce the same files the email path sends,
  // but hand them to the user directly — the native share sheet where files
  // are supported (phones: save to Files, AirDrop, messaging apps), plain
  // anchor downloads otherwise. Works with no Gmail scope at all.
  const downloadReport = async () => {
    const review = state.review;
    if (!review || state.downloading) return;
    update({ downloading: true, sendError: null });
    try {
      const tpl = tplForReport(review.templateId, review.templateName);
      const templateDisplayName = (tpl ? locImpl(state.lang, tpl, 'name') : '') || review.templateName;
      const attachments = await buildReportAttachments({
        review,
        templateName: templateDisplayName,
        lang: state.lang,
        formats: state.exportFormats,
        hideEmpty: tpl?.hideEmpty,
      });
      if (!attachments.length) throw new Error('No format selected');

      const files = attachments.map((a) => new File([a.blob], a.filename, { type: a.mimeType }));
      let handled = false;
      if ('canShare' in navigator && navigator.canShare({ files })) {
        try {
          await navigator.share({ files });
          handled = true;
        } catch (err) {
          // Doctor closed the share sheet — that's a completed interaction,
          // not a failure. Anything else falls back to plain downloads.
          if ((err as Error).name === 'AbortError') handled = true;
        }
      }
      if (!handled) {
        for (const att of attachments) {
          const url = URL.createObjectURL(att.blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = att.filename;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 10_000);
        }
      }
      update({ downloading: false });
    } catch (err) {
      console.error('Export download failed', err);
      update({ downloading: false, sendError: 'download' });
    }
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
    tplForReport,
    fmt,
    startExam,
    endExam,
    togglePause,
    reviewFromReport,
    setField,
    setExamField,
    setReportName,
    setReportStatus,
    openBuilder,
    newBuilder,
    duplicateTemplate,
    moveCat,
    delCat,
    startEditCat,
    confirmAdd,
    saveTemplate,
    delTemplate,
    saveReport,
    sendReport,
    downloadReport,
    delReport,
    assignUnassigned,
    dismissUnassigned,
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
