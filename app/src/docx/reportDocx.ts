import { Document, Packer, Paragraph, TextRun } from 'docx';
import type { Lang, ReviewState } from '../types';
import { loc } from '../i18n';

interface ReportDocxInput {
  review: ReviewState;
  templateName: string;
  lang: Lang;
}

function rtlParagraph(runs: TextRun[], extra?: Record<string, unknown>): Paragraph {
  return new Paragraph({
    ...extra,
    children: runs,
    bidirectional: true,
    alignment: 'right' as never,
  });
}

function renderField(name: string, content: string): Paragraph {
  const text = content ? `${name} - ${content}` : `${name} -`;
  return rtlParagraph(
    [new TextRun({ text, font: 'David', size: 22, rightToLeft: true })],
    { spacing: { after: 120 } },
  );
}

function renderHeader(templateName: string, reportName: string): Paragraph[] {
  const title = reportName?.trim() || templateName;
  return [
    rtlParagraph(
      [new TextRun({ text: title, bold: true, font: 'David', size: 32, rightToLeft: true })],
      { spacing: { after: 200 } },
    ),
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
