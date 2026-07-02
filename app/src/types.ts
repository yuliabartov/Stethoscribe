export type Lang = 'en' | 'he';

export type CategoryType = 'Free text' | 'Number' | 'List';

export interface CategoryDef {
  name: string;
  nameHe?: string | null;
  type: CategoryType;
  options?: string[] | null;
  optionsHe?: string[] | null;
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
  template: string;
  name: string | null;
}

export type ExamCatStatus = 'pending' | 'active' | 'done';

export interface ExamCategory {
  name: string;
  nameHe?: string | null;
  type: CategoryType;
  options?: string[] | null;
  optionsHe?: string[] | null;
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
  type: CategoryType;
  options?: string[] | null;
  optionsHe?: string[] | null;
  sample: string;
  sampleHe?: string;
  low: boolean;
  override: string | null;
}

export interface BuilderCategory {
  id: string;
  name: string;
  nameHe?: string | null;
  type: CategoryType;
  options?: string[] | null;
  optionsHe?: string[] | null;
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
}

export interface ReviewState {
  templateName: string;
  name: string;
  reportId: string | null;
  cats: ReviewCategory[];
}

export interface BuilderState {
  id: string | null;
  name: string;
  cats: BuilderCategory[];
}

export interface ExportFormats {
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
  exportFormats: ExportFormats;
  recipient: string;
  /** Gmail send in-flight — export screen shows "Sending…" and disables the button. */
  sending: boolean;
  /** Post-send failure code; null on success or before an attempt. */
  sendError: 'auth' | 'network' | 'unknown' | null;
  sent: boolean;
  search: string;
  sort: 'recent' | 'oldest';
}
