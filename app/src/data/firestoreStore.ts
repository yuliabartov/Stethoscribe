// Firestore persistence for templates and reports — one doctor's data, scoped
// to users/{uid}/..., synced across every device they sign into. Offline
// support comes from the persistentLocalCache configured in firebase.ts; this
// module just defines the document shapes and read/write/subscribe calls.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '../firebase';
import { INITIAL_TEMPLATES } from '../sampleData';
import type { CategoryDef, ReportItem, ReviewCategory, TemplateDef } from '../types';

const templatesCol = (uid: string) => collection(db, 'users', uid, 'templates');
const templateDoc = (uid: string, id: string) => doc(db, 'users', uid, 'templates', id);
const reportsCol = (uid: string) => collection(db, 'users', uid, 'reports');
const reportDoc = (uid: string, id: string) => doc(db, 'users', uid, 'reports', id);

// Firestore rejects `undefined` field values, so writes go through these
// sanitizers rather than writing app objects (which use `undefined` for "no
// value") directly. These return write-shaped data, not CategoryDef/
// ReviewCategory — the app types intentionally allow `undefined`, Firestore
// docs don't.
function sanitizeCats(cats: CategoryDef[]): DocumentData[] {
  return cats.map((c) => ({
    name: c.name,
    nameHe: c.nameHe ?? null,
    type: c.type,
    options: c.options ?? null,
    optionsHe: c.optionsHe ?? null,
    sample: c.sample,
    sampleHe: c.sampleHe ?? null,
    low: c.low ?? false,
  }));
}

function sanitizeReviewCats(cats: ReviewCategory[]): DocumentData[] {
  return cats.map((c) => ({
    id: c.id,
    name: c.name,
    nameHe: c.nameHe ?? null,
    type: c.type,
    sample: c.sample,
    sampleHe: c.sampleHe ?? null,
    low: c.low,
    override: c.override ?? null,
  }));
}

function toTemplateDef(d: QueryDocumentSnapshot<DocumentData>): TemplateDef {
  const data = d.data();
  return {
    id: d.id,
    name: data.name,
    nameHe: data.nameHe ?? null,
    short: data.short,
    shortHe: data.shortHe ?? null,
    accent: data.accent,
    soft: data.soft,
    cats: (data.cats as CategoryDef[]) || [],
  };
}

function toReportItem(d: QueryDocumentSnapshot<DocumentData>): ReportItem {
  const data = d.data();
  return { id: d.id, date: data.date, time: data.time, template: data.template, name: data.name ?? null };
}

/**
 * Subscribes to the doctor's templates. `onChange`'s second argument is true
 * exactly once, on the very first snapshot, if it came back empty — the
 * caller uses that single signal to seed starter templates for a new account
 * without re-seeding ones the doctor has since deleted.
 */
export function subscribeTemplates(uid: string, onChange: (templates: TemplateDef[], firstSnapshotEmpty: boolean) => void): Unsubscribe {
  let first = true;
  return onSnapshot(templatesCol(uid), (snap) => {
    const list = snap.docs.map(toTemplateDef);
    const firstSnapshotEmpty = first && list.length === 0;
    first = false;
    onChange(list, firstSnapshotEmpty);
  });
}

export async function seedDefaultTemplates(uid: string): Promise<void> {
  const batch = writeBatch(db);
  for (const t of INITIAL_TEMPLATES) {
    batch.set(templateDoc(uid, t.id), {
      name: t.name,
      nameHe: t.nameHe ?? null,
      short: t.short,
      shortHe: t.shortHe ?? null,
      accent: t.accent,
      soft: t.soft,
      cats: sanitizeCats(t.cats),
    });
  }
  await batch.commit();
}

export async function saveTemplateDoc(uid: string, t: TemplateDef): Promise<void> {
  await setDoc(templateDoc(uid, t.id), {
    name: t.name,
    nameHe: t.nameHe ?? null,
    short: t.short,
    shortHe: t.shortHe ?? null,
    accent: t.accent,
    soft: t.soft,
    cats: sanitizeCats(t.cats),
  });
}

export async function deleteTemplateDoc(uid: string, id: string): Promise<void> {
  await deleteDoc(templateDoc(uid, id));
}

export function subscribeReports(uid: string, onChange: (reports: ReportItem[]) => void): Unsubscribe {
  const q = query(reportsCol(uid), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => onChange(snap.docs.map(toReportItem)));
}

interface ReportPayload {
  date: string;
  time: string;
  template: string;
  name: string | null;
  cats: ReviewCategory[];
}

/** Creates a new report, or overwrites an existing one when `id` is given —
 * re-sending an edited report updates it in place instead of duplicating it. */
export async function saveReportDoc(uid: string, id: string | null, data: ReportPayload): Promise<string> {
  const ref = id ? reportDoc(uid, id) : doc(reportsCol(uid));
  await setDoc(ref, {
    date: data.date,
    time: data.time,
    template: data.template,
    name: data.name,
    cats: sanitizeReviewCats(data.cats),
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deleteReportDoc(uid: string, id: string): Promise<void> {
  await deleteDoc(reportDoc(uid, id));
}

/** Fetches a single report's captured findings (not included in the lightweight
 * list subscription above, to keep the reports list cheap to sync). */
export async function getReportCats(uid: string, id: string): Promise<ReviewCategory[] | null> {
  const snap = await getDoc(reportDoc(uid, id));
  if (!snap.exists()) return null;
  return (snap.data().cats as ReviewCategory[]) || [];
}
