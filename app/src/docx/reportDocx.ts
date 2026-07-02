// Word (.docx) generator for a completed exam report.
//
// First-pass minimal formatting: each field is a single "{Name} - {Content}"
// paragraph, in the order they were captured; empty content still emits the
// name (so nothing is silently dropped). Structure is deliberately split into
// (1) a header block, (2) a per-field renderer, and (3) the document
// assembly — later iterations can swap the field renderer for a table row or
// add branded headers/footers without disturbing the pipeline shape.
import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { Lang, ReviewState } from '../types';
import { loc } from '../i18n';

interface ReportDocxInput {
  review: ReviewState;
  templateName: string;
  lang: Lang;
}

function renderField(name: string, content: string): Paragraph {
  const text = content ? `${name} - ${content}` : `${name} -`;
  return new Paragraph({
    children: [new TextRun({ text, font: 'Calibri', size: 22 })],
    spacing: { after: 120 },
    bidirectional: true,
  });
}

function renderHeader(templateName: string, reportName: string): Paragraph[] {
  const title = reportName?.trim() || templateName;
  return [
    new Paragraph({
      children: [new TextRun({ text: title, bold: true, font: 'Calibri', size: 32 })],
      spacing: { after: 200 },
      bidirectional: true,
    }),
  ];
}

export async function generateReportDocx({ review, templateName, lang }: ReportDocxInput): Promise<Blob> {
  const fieldParagraphs = review.cats.map((c) => {
    const name = loc(lang, c, 'name');
    const content = (c.override ?? '').trim();
    return renderField(name, content);
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [...renderHeader(templateName, review.name), ...fieldParagraphs],
      },
    ],
  });

  return Packer.toBlob(doc);
}

export function reportFilename(templateName: string, reportName: string): string {
  const base = (reportName?.trim() || templateName || 'report')
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 80);
  return `${base}.docx`;
}
