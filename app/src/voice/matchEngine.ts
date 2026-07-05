// Voice capture engine — pure, platform-independent. (Spec §6, §14.2)
//
// Given the running speech transcript and the active template's categories,
// it works out which spoken finding belongs in which field, with a confidence
// flag. It is deliberately isolated from the speech *source* (Web Speech today,
// a native engine later) so the source can be swapped without touching this.
//
// Strategy: the doctor speaks "<category name> <finding>", in any order. We
// detect category names (and Hebrew names / aliases) as *anchors* via fuzzy
// matching, then capture the text between one anchor and the next as that
// field's value. Unmatched leading speech goes to an "Unassigned" bucket.

export type FieldType = 'Free text' | 'Number' | 'List';

export interface CompiledOption {
  /** Canonical text to store/display when this option is chosen. */
  value: string;
  /** Normalized spoken forms that select this option (text, Hebrew, aliases). */
  terms: string[];
}

export interface CompiledCategory {
  /** Index of the category within the template (used to map back to examCats). */
  id: string;
  type: FieldType;
  /** Normalized spoken anchors: category name + Hebrew name + aliases. */
  anchors: string[];
  options?: CompiledOption[];
}

export interface CapturedField {
  id: string;
  value: string;
  /** True when recognition confidence is low — flagged for review. */
  low: boolean;
  /** Token index in the processed transcript where this capture's anchor
   * begins — lets callers drop captures older than a manual edit. */
  start: number;
}

export interface ProcessResult {
  fields: CapturedField[];
  unassigned: string[];
  /** Stop keyword ("end exam" / "סיום בדיקה") detected in the stream. */
  stop: boolean;
}

const STOP_TERMS = [
  'end exam', 'stop exam', 'finish exam',
  'סיום בדיקה', 'סיים בדיקה', 'סוף בדיקה',
];

const ANCHOR_THRESHOLD = 0.62;
const ANCHOR_LOW = 0.78;
const OPTION_THRESHOLD = 0.5;
const OPTION_LOW = 0.72;

/** Lowercase, strip Hebrew niqqud and surrounding punctuation; keep the token. */
export function normalizeToken(t: string): string {
  return t
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function normalize(s: string): string {
  return (s || '')
    .split(/\s+/)
    .map(normalizeToken)
    .filter(Boolean)
    .join(' ');
}

function bigrams(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
  return out;
}

/** Fuzzy similarity in [0,1]: Dice bigram coefficient with exact/substring boosts. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length >= 3 && b.length >= 3 && (a.includes(b) || b.includes(a))) return 0.9;
  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;
  const counts = new Map<string, number>();
  for (const g of B) counts.set(g, (counts.get(g) || 0) + 1);
  let inter = 0;
  for (const g of A) {
    const c = counts.get(g) || 0;
    if (c > 0) {
      inter++;
      counts.set(g, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

// Spoken number words → digit value. Covers English and Hebrew (both genders)
// for the ranges clinical values fall in, plus decimals ("point"/"נקודה").
// Speech engines often already return digits ("78"), but small numbers and most
// Hebrew come back as words ("five", "חמש", "שלושים ושבע"); this normalizes both.
const NUMWORD: Record<string, number> = {
  // English units / teens
  zero: 0, oh: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  // English tens / scales
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  hundred: 100, thousand: 1000,
  // Hebrew units (masculine + feminine forms doctors may use interchangeably)
  אפס: 0,
  אחת: 1, אחד: 1,
  שתיים: 2, שניים: 2, שתים: 2, שנים: 2, שתי: 2, שני: 2,
  שלוש: 3, שלושה: 3,
  ארבע: 4, ארבעה: 4,
  חמש: 5, חמישה: 5,
  שש: 6, שישה: 6,
  שבע: 7, שבעה: 7,
  שמונה: 8,
  תשע: 9, תשעה: 9,
  // Hebrew ten / teens-component / tens / hundreds
  עשר: 10, עשרה: 10,
  עשרים: 20, שלושים: 30, ארבעים: 40, חמישים: 50, שישים: 60, שבעים: 70, שמונים: 80, תשעים: 90,
  מאה: 100, מאתיים: 200,
};

const POINT_WORDS = new Set(['point', 'dot', 'decimal', 'נקודה']);

// Curated physical-exam vocabulary used to nudge misheard clinical words back
// to the correct spelling (e.g. a recognizer guess like "rails" -> "rales").
// This is the practical free accuracy lever available here: the Web Speech
// API's own vocabulary-hint mechanism (SpeechGrammarList) was removed from
// the spec and has no effect on any engine today, so there's no way to bias
// the recognizer itself for free — only to correct its output afterward.
const CLINICAL_TERMS = [
  // English — general / vitals
  'afebrile', 'tachycardia', 'bradycardia', 'tachypnea', 'bradypnea', 'hypertension', 'hypotension',
  'distress', 'diaphoresis', 'cyanosis', 'pallor', 'jaundice', 'edema', 'erythema', 'induration',
  // HEENT / neuro
  'pupils', 'sclera', 'conjunctiva', 'oropharynx', 'lymphadenopathy', 'nystagmus', 'ptosis',
  'dysarthria', 'cranial', 'reflexes', 'sensation', 'strength', 'gait', 'orientation', 'alert',
  // cardiovascular
  'murmur', 'gallop', 'thrill', 'bruit', 'auscultation', 'systolic', 'diastolic', 'rhythm', 'tachycardic', 'bradycardic',
  // respiratory
  'wheezes', 'wheeze', 'rales', 'rhonchi', 'crackles', 'stridor', 'dyspnea', 'orthopnea',
  // abdomen
  'tenderness', 'guarding', 'rebound', 'peristalsis', 'hepatomegaly', 'splenomegaly', 'distension',
  // musculoskeletal / skin
  'clubbing', 'crepitus', 'atrophy', 'laceration', 'ecchymosis',
  // Hebrew
  'טכיקרדיה', 'ברדיקרדיה', 'חום', 'אוושה', 'חרחורים', 'צפצופים', 'קוצר', 'נשימה',
  'בצקת', 'אדמומיות', 'ציאנוזה', 'חיוורון', 'צהבת', 'רגישות', 'נוקשות', 'נפיחות', 'הזעה',
  'רפלקסים', 'תחושה', 'עוצמה', 'הליכה', 'ערני', 'מכוון', 'קצב', 'סדיר', 'תקין',
];
const CLINICAL_TERMS_NORM = CLINICAL_TERMS.map((term) => ({ term, norm: normalize(term) }));
// Measured empirically: genuine mis-hears of clinical terms ("diaforesis" for
// "diaphoresis") score ~0.72-0.78 here, but so do unrelated word collisions
// ("tender"/"gender" ~0.8) — the ranges overlap, so no threshold is fully
// precise. Since captureValue now always flags an applied correction as
// low-confidence for doctor review, a wrong swap is never presented as fact —
// so this can lean toward catching more real mis-hears instead of firing rarely.
const CORRECTION_THRESHOLD = 0.8;

/**
 * Snaps close-but-not-exact free-text words toward the nearest known clinical
 * term (e.g. "resis" heard for "rales"). Deliberately conservative — only
 * longer tokens with a high-confidence match are touched — since this is a
 * heuristic correction pass, not a real domain-tuned recognition model.
 */
export function correctClinicalTerms(text: string): string {
  if (!text) return text;
  return text
    .split(/(\s+)/) // keep the whitespace runs so original spacing survives
    .map((chunk) => {
      if (!chunk.trim()) return chunk;
      const stripped = chunk.replace(/[^\p{L}\p{N}]/gu, '');
      if (stripped.length < 4) return chunk;
      const normTok = normalize(stripped);
      let best: { term: string; score: number } | null = null;
      for (const c of CLINICAL_TERMS_NORM) {
        if (normTok === c.norm) return chunk; // already exact — leave untouched
        const score = similarity(normTok, c.norm);
        if (!best || score > best.score) best = { term: c.term, score };
      }
      if (best && best.score >= CORRECTION_THRESHOLD) {
        return chunk.replace(stripped, best.term);
      }
      return chunk;
    })
    .join('');
}

/**
 * Parses a spoken value into a numeric string, e.g. "five" → "5",
 * "thirty seven point two" → "37.2", "שלושים ושבע נקודה שתיים" → "37.2".
 * Returns null when no number is present. Works on the raw (un-normalized)
 * text so decimal points survive — normalize() strips them.
 */
export function parseSpokenNumber(raw: string): string | null {
  const cleaned = (raw || '').toLowerCase().normalize('NFKD').replace(/[֑-ׇ]/g, '');
  const tokens = cleaned
    .split(/\s+/)
    .map((tok) => tok.replace(/[^\p{L}\p{N}.]/gu, ''))
    .filter(Boolean);

  let current = 0;
  let decimals = '';
  let inDecimal = false;
  let saw = false;

  for (let tok of tokens) {
    // Hebrew joins "and" as a prefix vav: "ושבע" → "שבע", "ועשרים" → "עשרים".
    if (tok.length > 1 && tok.startsWith('ו') && NUMWORD[tok] === undefined) {
      const stripped = tok.slice(1);
      if (NUMWORD[stripped] !== undefined || POINT_WORDS.has(stripped)) tok = stripped;
    }
    if (POINT_WORDS.has(tok)) { inDecimal = true; saw = true; continue; }
    if (tok === 'and' || tok === 'ו') continue;

    // A digit literal the engine already produced (e.g. "78", "37.2").
    if (/^\d+(?:\.\d+)?$/.test(tok)) {
      if (tok.includes('.')) return tok;
      if (inDecimal) decimals += tok;
      else current += Number(tok);
      saw = true;
      continue;
    }

    const w = NUMWORD[tok];
    if (w === undefined) continue; // skip unit words ("degrees", "מעלות", etc.)
    saw = true;
    if (inDecimal) {
      if (w < 10) decimals += String(w);
      continue;
    }
    if (w >= 100) current = (current || 1) * w;
    else current += w;
  }

  if (!saw) return null;
  return decimals ? `${current}.${decimals}` : String(current);
}

interface AnchorHit {
  catId: string;
  start: number;
  end: number;
  score: number;
}

/** Scan normalized tokens for the best anchor match at each position. */
function findHits(norm: string[], cats: CompiledCategory[]): AnchorHit[] {
  const hits: AnchorHit[] = [];
  for (let i = 0; i < norm.length; i++) {
    if (!norm[i]) continue;
    let best: AnchorHit | null = null;
    for (const cat of cats) {
      for (const anchor of cat.anchors) {
        const len = anchor.split(' ').length;
        const window = norm.slice(i, i + len).join(' ');
        if (!window) continue;
        const score = similarity(window, anchor);
        if (score >= ANCHOR_THRESHOLD && (!best || score > best.score)) {
          best = { catId: cat.id, start: i, end: i + len, score };
        }
      }
    }
    if (best) {
      hits.push(best);
      i = best.end - 1; // don't re-match inside a recognized anchor
    }
  }
  return hits;
}

function captureValue(rawOriginal: string, cat: CompiledCategory, anchorScore: number): Omit<CapturedField, 'start'> | null {
  const raw = rawOriginal.trim();
  if (!raw) return { id: cat.id, value: '', low: true };

  if (cat.type === 'Number') {
    // Convert spoken number words ("five", "חמש", "thirty seven point two") to
    // digits. Runs on the raw text so decimals survive (normalize() drops '.').
    // A Number field only ever holds digits — if nothing parseable was heard,
    // leave the field untouched rather than writing non-numeric text into it.
    const parsed = parseSpokenNumber(raw);
    return parsed ? { id: cat.id, value: parsed, low: anchorScore < ANCHOR_LOW } : null;
  }

  if (cat.type === 'List' && cat.options?.length) {
    const normRaw = normalize(raw);
    let best: { value: string; score: number } | null = null;
    for (const opt of cat.options) {
      for (const term of opt.terms) {
        const score = similarity(normRaw, term);
        if (!best || score > best.score) best = { value: opt.value, score };
      }
    }
    // A List field only ever holds one of its defined options — if nothing
    // heard was close enough to any of them, leave the field untouched
    // instead of writing free text into what's meant to be a fixed choice.
    return best && best.score >= OPTION_THRESHOLD ? { id: cat.id, value: best.value, low: best.score < OPTION_LOW } : null;
  }

  // Free text — keep the doctor's words, light cleanup, flag if the anchor was weak.
  const cleaned = correctClinicalTerms(raw);
  const value = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  // Bigram similarity can't cleanly tell a genuine mis-hear ("diaforesis" for
  // "diaphoresis", ~0.74) from an unrelated word that just shares letters
  // ("tender"/"gender", ~0.8) — measured ranges overlap, so any string-only
  // threshold will sometimes swap in the wrong clinical term. Rather than
  // silently trust the correction, force the existing "low confidence · review"
  // flag whenever one was applied, so it's always surfaced for the doctor to
  // confirm — the same visibility every other uncertain capture already gets.
  const corrected = cleaned !== raw;
  return { id: cat.id, value, low: corrected || anchorScore < ANCHOR_THRESHOLD + 0.08 };
}

export function isStopKeyword(text: string): boolean {
  const n = normalize(text);
  return STOP_TERMS.some((term) => n.includes(normalize(term)));
}

/**
 * Process the full accumulated transcript against the template's categories.
 * Re-segmenting the whole transcript each time keeps the logic idempotent and
 * robust to interim/duplicate speech results.
 */
export function processTranscript(fullText: string, cats: CompiledCategory[]): ProcessResult {
  const stop = isStopKeyword(fullText);
  const original = fullText.split(/\s+/).filter(Boolean);
  const norm = original.map(normalizeToken);
  const hits = findHits(norm, cats);

  const fields = new Map<string, CapturedField>();
  const unassigned: string[] = [];

  if (hits.length === 0) {
    if (original.length) unassigned.push(original.join(' '));
    return { fields: [], unassigned, stop };
  }

  if (hits[0].start > 0) {
    unassigned.push(original.slice(0, hits[0].start).join(' '));
  }

  for (let h = 0; h < hits.length; h++) {
    const hit = hits[h];
    const valEnd = h + 1 < hits.length ? hits[h + 1].start : original.length;
    const rawValue = original.slice(hit.end, valEnd).join(' ');
    const cat = cats.find((c) => c.id === hit.catId);
    if (!cat) continue;
    const captured = captureValue(rawValue, cat, hit.score);
    // null means the heard text failed type validation (non-numeric for a
    // Number field, no matching option for a List field) — skip it so the
    // field is left as-is rather than overwritten with an invalid value.
    if (!captured) continue;
    // Last mention wins, so a doctor can simply re-state a field to correct it.
    fields.set(cat.id, { ...captured, start: hit.start });
  }

  return { fields: [...fields.values()], unassigned: unassigned.filter(Boolean), stop };
}
