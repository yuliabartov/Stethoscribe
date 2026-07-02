// PDF generator for a completed exam report.
//
// Strategy: build an off-screen HTML block with the report content, snapshot
// it via html2canvas, and drop the image into a jsPDF page. This delegates
// all Hebrew bidi / RTL text shaping to the browser's layout engine — no
// manual reversal, no font-embedding gymnastics. The resulting PDF is
// image-based (not text-searchable) but renders Hebrew perfectly and mirrors
// the on-screen appearance the doctor already trusts.
import type { Lang, ReviewState } from '../types';
import { loc } from '../i18n';

interface ReportPdfInput {
  review: ReviewState;
  templateName: string;
  lang: Lang;
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
  const rows = review.cats.map((c) => {
    const name = loc(lang, c, 'name');
    const content = (c.override ?? '').trim();
    const text = content ? `${name} - ${content}` : `${name} -`;
    return `<p style="font-size:15px;margin:0 0 10px;line-height:1.55;color:#111;">${escapeHtml(text)}</p>`;
  }).join('');

  return `
    <div style="direction:${rtl ? 'rtl' : 'ltr'};text-align:${rtl ? 'right' : 'left'};font-family:'Assistant','David','Arial Hebrew',system-ui,sans-serif;padding:48px 40px;width:794px;background:#ffffff;color:#111;box-sizing:border-box;">
      <h1 style="font-size:26px;margin:0 0 24px;font-weight:800;color:#111;line-height:1.3;">${escapeHtml(title)}</h1>
      ${rows}
    </div>
  `;
}

export async function generateReportPdf(input: ReportPdfInput): Promise<Blob> {
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

export function reportPdfFilename(templateName: string, reportName: string): string {
  const base = (reportName?.trim() || templateName || 'report')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return `${base}.pdf`;
}
