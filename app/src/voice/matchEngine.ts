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

function captureValue(rawOriginal: string, cat: CompiledCategory, anchorScore: number): CapturedField {
  const raw = rawOriginal.trim();
  if (!raw) return { id: cat.id, value: '', low: true };

  if (cat.type === 'Number') {
    const m = normalize(raw).match(/-?\d+(?:\.\d+)?/);
    if (m) return { id: cat.id, value: m[0], low: anchorScore < ANCHOR_LOW };
    return { id: cat.id, value: raw, low: true };
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
    if (best && best.score >= OPTION_THRESHOLD) {
      return { id: cat.id, value: best.value, low: best.score < OPTION_LOW };
    }
    return { id: cat.id, value: raw, low: true };
  }

  // Free text — keep the doctor's words, light cleanup, flag if the anchor was weak.
  const value = raw.charAt(0).toUpperCase() + raw.slice(1);
  return { id: cat.id, value, low: anchorScore < ANCHOR_THRESHOLD + 0.08 };
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
    // Last mention wins, so a doctor can simply re-state a field to correct it.
    fields.set(cat.id, captureValue(rawValue, cat, hit.score));
  }

  return { fields: [...fields.values()], unassigned: unassigned.filter(Boolean), stop };
}
