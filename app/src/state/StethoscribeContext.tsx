import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { DICT, loc as locImpl } from '../i18n';
import { INITIAL_REPORTS, INITIAL_TEMPLATES } from '../sampleData';
import type { AppState, BuilderCategory, CategoryType, NavName, ReportItem, ScreenName, TemplateDef } from '../types';

const initialState: AppState = {
  lang: 'en',
  screen: 'signin',
  nav: 'home',
  selectedTemplateId: 'gp',
  templates: INITIAL_TEMPLATES,
  reports: INITIAL_REPORTS,
  exam: null,
  examCats: null,
  activeIdx: -1,
  elapsed: 0,
  paused: false,
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

type Updater = AppState | ((s: AppState) => AppState);

interface StethoscribeApi {
  state: AppState;
  t: typeof DICT.en;
  rtl: boolean;
  dir: 'rtl' | 'ltr';
  loc: (obj: Record<string, unknown> | null | undefined, key: string) => string;
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

  const clearTimers = () => {
    if (tickRef.current) clearInterval(tickRef.current);
    if (clockRef.current) clearInterval(clockRef.current);
    tickRef.current = null;
    clockRef.current = null;
  };

  useEffect(() => () => clearTimers(), []);

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
      status: 'pending' as const,
    }));
    if (cats[0]) cats[0].status = 'active';
    clearTimers();
    update({ screen: 'exam', exam: { templateName: t.name }, examCats: cats, activeIdx: 0, elapsed: 0, paused: false });
    tickRef.current = setInterval(advance, 1850);
    clockRef.current = setInterval(() => setState((s) => (s.paused ? s : { ...s, elapsed: s.elapsed + 1 })), 1000);
  };

  const togglePause = () => update((s) => ({ paused: !s.paused }));

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
      return { ...s, screen: 'review', review: { templateName: s.exam!.templateName, cats }, editingId: null };
    });
  };

  const reviewFromReport = (report: ReportItem) => {
    const t = tplByName(report.template);
    const cats = t.cats.map((c, idx) => ({
      id: 'f' + idx,
      name: c.name,
      nameHe: c.nameHe,
      type: c.type,
      sample: c.sample,
      sampleHe: c.sampleHe,
      low: !!c.low,
      override: null,
    }));
    go('review', { review: { templateName: t.name, cats }, editingId: null, nav: 'reports' });
  };

  const setField = (id: string, val: string) => {
    setState((s) => ({
      ...s,
      review: s.review
        ? { ...s.review, cats: s.review.cats.map((c) => (c.id === id ? { ...c, override: val, low: false } : c)) }
        : s.review,
    }));
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

  const saveTemplate = () => {
    setState((s) => {
      const b = s.builder;
      if (!b) return s;
      const nm = b.name.trim() || DICT[s.lang].newTemplate;
      const cats = b.cats.map((c) => ({
        name: c.name,
        nameHe: c.nameHe,
        type: c.type,
        options: c.options || undefined,
        optionsHe: c.optionsHe || undefined,
        sample: DICT.en.normal,
        sampleHe: DICT.he.normal,
      }));
      let templates: TemplateDef[];
      if (b.id) {
        templates = s.templates.map((t) => (t.id === b.id ? { ...t, name: nm, cats } : t));
      } else {
        const id = 't' + Date.now();
        templates = s.templates.concat([
          { id, name: nm, nameHe: null, short: nm.slice(0, 2), shortHe: null, accent: '#8FB6A6', soft: '#DDEAE3', cats },
        ]);
      }
      return { ...s, templates, screen: 'templates' };
    });
  };

  const delTemplate = (id: string) => {
    setState((s) => {
      if (s.templates.length <= 1) return s;
      const templates = s.templates.filter((t) => t.id !== id);
      return { ...s, templates, selectedTemplateId: s.selectedTemplateId === id ? templates[0].id : s.selectedTemplateId };
    });
  };

  const sendReport = () => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    setState((s) => ({
      ...s,
      sent: true,
      reports: [{ id: 'r' + Date.now(), date: 'Jun 28, 2026', time: hh + ':' + mm, template: s.review!.templateName }].concat(s.reports),
    }));
  };

  const delReport = (id: string) => {
    setState((s) => ({ ...s, reports: s.reports.filter((r) => r.id !== id) }));
  };

  const rtl = state.lang === 'he';
  const api: StethoscribeApi = {
    state,
    t: DICT[state.lang],
    rtl,
    dir: rtl ? 'rtl' : 'ltr',
    loc: (obj, key) => locImpl(state.lang, obj, key),
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
