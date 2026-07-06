// PDF generator for a completed exam report.
//
// Primary path (generateTextPdf): a real *text* PDF — selectable, searchable,
// screen-reader friendly, and small — built with jsPDF. Hebrew needs two
// things the 14 standard PDF fonts can't give: Hebrew glyphs (we embed the
// open-source David Libre TTF) and correct bidi ordering (jsPDF draws glyphs
// in the order given, so we reorder each line to visual order with bidi-js —
// Hebrew has no cursive shaping, so reorder-then-draw renders correctly).
//
// Fallback (generateImagePdf): the original html2canvas snapshot → image PDF.
// Used automatically if the text path can't run — e.g. the bundled font can't
// be fetched (offline, first use, uncached). It renders Hebrew perfectly via
// the browser but isn't searchable. So we degrade to "correct but not
// searchable" rather than failing.
import type { Lang, ReviewState } from '../types';
import { loc } from '../i18n';
import davidRegularUrl from './fonts/DavidLibre-Regular.ttf?url';
import davidBoldUrl from './fonts/DavidLibre-Bold.ttf?url';

interface ReportPdfInput {
  review: ReviewState;
  templateName: string;
  lang: Lang;
}

/** Logical field lines for the report body, unit label appended (spec §6.4).
 * `isolate` wraps the value in a First-Strong Isolate so a "number unit" value
 * (e.g. "122/78 mmHg", "37.2 °C") keeps its own direction and internal order
 * inside an RTL line instead of the unit being reordered ahead of the number.
 * Only the text-PDF path needs this; the HTML fallback lets the browser's
 * layout engine handle bidi. */
const FSI = '⁨'; // First-Strong Isolate
const PDI = '⁩'; // Pop Directional Isolate

function reportLines({ review, lang }: ReportPdfInput, isolate = false): string[] {
  return review.cats.map((c) => {
    const name = loc(lang, c, 'name');
    let content = (c.override ?? '').trim();
    if (content && c.type === 'Number' && c.unit) content = `${content} ${c.unit}`;
    if (!content) return `${name} -`;
    return isolate ? `${name} - ${FSI}${content}${PDI}` : `${name} - ${content}`;
  });
}

// Zero-width bidi control/formatting chars — stripped from the visual string
// after reordering so the (glyph-less) controls don't render as tofu boxes.
const BIDI_CONTROLS = /[⁦-⁩‎‏‪-‮]/g;

async function fetchFontBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Font fetch failed: ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // btoa needs a binary string; chunk to avoid the call-stack limit on spread.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

async function generateTextPdf(input: ReportPdfInput): Promise<Blob> {
  const [{ jsPDF }, bidiMod, regular, bold] = await Promise.all([
    import('jspdf'),
    import('bidi-js'),
    fetchFontBase64(davidRegularUrl),
    fetchFontBase64(davidBoldUrl),
  ]);
  const bidi = bidiMod.default();

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  doc.addFileToVFS('DavidLibre-Regular.ttf', regular);
  doc.addFont('DavidLibre-Regular.ttf', 'David', 'normal');
  doc.addFileToVFS('DavidLibre-Bold.ttf', bold);
  doc.addFont('DavidLibre-Bold.ttf', 'David', 'bold');

  const rtl = input.lang === 'he';
  const base = rtl ? 'rtl' : 'ltr';
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxW = pageW - margin * 2;
  const xStart = rtl ? pageW - margin : margin; // leading edge
  const align = rtl ? 'right' : 'left';
  let y = margin + 4;

  // Logical → visual order for one already-wrapped line (no line breaks),
  // then drop the zero-width bidi controls the isolates introduced.
  const toVisual = (line: string): string =>
    bidi.getReorderedString(line, bidi.getEmbeddingLevels(line, base)).replace(BIDI_CONTROLS, '');

  doc.setTextColor(17, 17, 17);
  const paragraph = (text: string, sizePt: number, style: 'normal' | 'bold', gapAfterMm: number) => {
    doc.setFont('David', style);
    doc.setFontSize(sizePt);
    const lineH = sizePt * 0.3528 * 1.32; // pt→mm with line spacing
    // Wrap on the logical string (width is order-independent), then reorder
    // each wrapped line to visual order for drawing.
    for (const ln of doc.splitTextToSize(text, maxW) as string[]) {
      if (y + lineH > pageH - margin) {
        doc.addPage();
        y = margin + 4;
      }
      doc.text(toVisual(ln), xStart, y, { align, baseline: 'top' });
      y += lineH;
    }
    y += gapAfterMm;
  };

  const title = input.review.name?.trim() || input.templateName;
  paragraph(title, 20, 'bold', 5);
  for (const line of reportLines(input, true)) paragraph(line, 12, 'normal', 2.5);

  return doc.output('blob');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function buildHtml({ review, templateName, lang }: ReportPdfInput): string {
  const rtl = lang === 'he';
  const title = review.name?.trim() || templateName;
  const rows = reportLines({ review, templateName, lang })
    .map((text) => `<p style="font-size:15px;margin:0 0 10px;line-height:1.55;color:#111;">${escapeHtml(text)}</p>`)
    .join('');

  return `
    <div style="direction:${rtl ? 'rtl' : 'ltr'};text-align:${rtl ? 'right' : 'left'};font-family:'Assistant','David','Arial Hebrew',system-ui,sans-serif;padding:48px 40px;width:794px;background:#ffffff;color:#111;box-sizing:border-box;">
      <h1 style="font-size:26px;margin:0 0 24px;font-weight:800;color:#111;line-height:1.3;">${escapeHtml(title)}</h1>
      ${rows}
    </div>
  `;
}

async function generateImagePdf(input: ReportPdfInput): Promise<Blob> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ]);

  // The container must be attached to the DOM (and not display:none) for
  // html2canvas to measure layout — hide it off-screen instead.
  const container = document.createElement('div');
  container.style.position = 'fixed';
  container.style.top = '0';
  container.style.left = '-10000px';
  container.style.zIndex = '-1';
  container.innerHTML = buildHtml(input);
  document.body.appendChild(container);

  try {
    const target = container.firstElementChild as HTMLElement;
    const canvas = await html2canvas(target, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL('image/jpeg', 0.92);

    // Slice the tall canvas into A4-sized pages when the content overflows.
    let remaining = imgHeight;
    let offset = 0;
    pdf.addImage(imgData, 'JPEG', 0, offset, imgWidth, imgHeight);
    remaining -= pageHeight;
    while (remaining > 0) {
      offset -= pageHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'JPEG', 0, offset, imgWidth, imgHeight);
      remaining -= pageHeight;
    }

    return pdf.output('blob');
  } finally {
    document.body.removeChild(container);
  }
}

export async function generateReportPdf(input: ReportPdfInput): Promise<Blob> {
  try {
    return await generateTextPdf(input);
  } catch (err) {
    // Font unavailable (offline/uncached) or an unexpected jsPDF issue — fall
    // back to the always-works image renderer rather than failing the export.
    console.warn('Searchable PDF unavailable, using image fallback', err);
    return generateImagePdf(input);
  }
}

export function reportPdfFilename(templateName: string, reportName: string): string {
  const base = (reportName?.trim() || templateName || 'report')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return `${base}.pdf`;
}
