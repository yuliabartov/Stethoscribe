export type Lang = 'en' | 'he';

export type CategoryType = 'Free text' | 'Number' | 'List';

export interface CategoryDef {
  name: string;
  nameHe?: string | null;
  /** Alternate spoken phrasings recognized as this category (spec §7). */
  aliases?: string[] | null;
  type: CategoryType;
  options?: string[] | null;
  optionsHe?: string[] | null;
  /** Number fields: optional unit label shown after the value, e.g. "bpm". */
  unit?: string | null;
  /** Number fields: optional valid range — captures outside it are flagged. */
  min?: number | null;
  max?: number | null;
  sample: string;
  sampleHe?: string;
  low?: boolean;
}

export interface TemplateDef {
  id: string;
  name: string;
  nameHe?: string | null;
  short: string;
  shortHe?: string | null;
  accent: string;
  soft: string;
  cats: CategoryDef[];
}

export interface ReportItem {
  id: string;
  date: string;
  time: string;
  /** Display-name snapshot of the template (kept for docs whose template was
   * since deleted); resolution should prefer templateId. */
  template: string;
  /** Stable id of the template used — survives template renames. Null on
   * legacy docs saved before ids were stored. */
  templateId: string | null;
  name: string | null;
}

export type ExamCatStatus = 'pending' | 'active' | 'done';

export interface ExamCategory {
  name: string;
  nameHe?: string | null;
  aliases?: string[] | null;
  type: CategoryType;
  options?: string[] | null;
  optionsHe?: string[] | null;
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  sample: string;
  sampleHe?: string;
  low: boolean;
  override: string | null;
  status: ExamCatStatus;
}

export interface ReviewCategory {
  id: string;
  name: string;
  nameHe?: string | null;
  aliases?: string[] | null;
  type: CategoryType;
  options?: string[] | null;
  optionsHe?: string[] | null;
  unit?: string | null;
  min?: number | null;
  max?: number | null;
  sample: string;
  sampleHe?: string;
  low: boolean;
  override: string | null;
}

export interface BuilderCategory {
  id: string;
  name: string;
  nameHe?: string | null;
  aliases?: string[] | null;
  type: CategoryType;
  options?: string[] | null;
  optionsHe?: string[] | null;
  unit?: string | null;
  min?: number | null;
  max?: number | null;
}

export type ScreenName =
  | 'signin'
  | 'home'
  | 'templates'
  | 'builder'
  | 'exam'
  | 'review'
  | 'export'
  | 'reports';

export type NavName = 'home' | 'templates' | 'reports';

export interface ExamState {
  templateName: string;
  templateId: string;
}

export interface ReviewState {
  templateName: string;
  templateId: string | null;
  name: string;
  reportId: string | null;
  cats: ReviewCategory[];
  /** Speech heard during capture that didn't match any category anchor —
   * surfaced for the doctor to file into a field or dismiss (spec §6.3). */
  unassigned: string[];
}

export interface BuilderState {
  id: string | null;
  name: string;
  cats: BuilderCategory[];
}

export interface ExportFormats {
  pdf: boolean;
  word: boolean;
}

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface AppState {
  lang: Lang;
  screen: ScreenName;
  nav: NavName;
  user: AuthUser | null;
  authReady: boolean;
  dataReady: boolean;
  selectedTemplateId: string;
  templates: TemplateDef[];
  reports: ReportItem[];
  exam: ExamState | null;
  examCats: ExamCategory[] | null;
  activeIdx: number;
  elapsed: number;
  paused: boolean;
  voiceActive: boolean;
  micError: string | null;
  /** Report-editor dictation: whether the mic is currently listening. */
  dictating: boolean;
  /** Report-editor dictation error code (unsupported / not-allowed / …). */
  dictationError: string | null;
  review: ReviewState | null;
  editingId: string | null;
  builder: BuilderState | null;
  adding: boolean;
  addType: CategoryType;
  addName: string;
  addOptions: string;
  addAliases: string;
  addUnit: string;
  addMin: string;
  addMax: string;
  exportFormats: ExportFormats;
  recipient: string;
  /** Gmail send in-flight — export screen shows "Sending…" and disables the button. */
  sending: boolean;
  /** Post-send failure code; null on success or before an attempt. */
  sendError: 'auth' | 'network' | 'recipient' | 'download' | 'unknown' | null;
  sent: boolean;
  /** Local export (share/download) in flight. */
  downloading: boolean;
  search: string;
  sort: 'recent' | 'oldest';
}
