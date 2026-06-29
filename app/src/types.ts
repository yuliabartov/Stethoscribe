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
}

export type ExamCatStatus = 'pending' | 'active' | 'done';

export interface ExamCategory {
  name: string;
  nameHe?: string | null;
  type: CategoryType;
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
  cats: ReviewCategory[];
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

export interface AppState {
  lang: Lang;
  screen: ScreenName;
  nav: NavName;
  selectedTemplateId: string;
  templates: TemplateDef[];
  reports: ReportItem[];
  exam: ExamState | null;
  examCats: ExamCategory[] | null;
  activeIdx: number;
  elapsed: number;
  review: ReviewState | null;
  editingId: string | null;
  builder: BuilderState | null;
  adding: boolean;
  addType: CategoryType;
  addName: string;
  addOptions: string;
  exportFormats: ExportFormats;
  recipient: string;
  sent: boolean;
  search: string;
  sort: 'recent' | 'oldest';
}
