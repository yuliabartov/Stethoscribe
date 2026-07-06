import { Document, Packer, Paragraph, TextRun, AlignmentType } from 'docx';
import type { Lang, ReviewState } from '../types';
import { loc } from '../i18n';

interface ReportDocxInput {
  review: ReviewState;
  templateName: string;
  lang: Lang;
}

function rtlParagraph(runs: TextRun[], extra?: Record<string, unknown>): Paragraph {
  // bidirectional -> <w:bidi/> gives the paragraph an RTL base direction.
  // Alignment MUST be 'start' (leading edge), NOT 'right': in a bidi
  // paragraph, <w:jc w:val="right"/> is interpreted logically as the END of
  // the line, which for RTL is the physical LEFT edge — that's what pushed
  // the text to the left. 'start' = the physical right edge for RTL.
  return new Paragraph({
    ...extra,
    children: runs,
    bidirectional: true,
    alignment: AlignmentType.START,
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
    let content = (c.override ?? '').trim();
    // Captured numbers render with their template unit label (spec §6.4).
    if (content && c.type === 'Number' && c.unit) content = `${content} ${c.unit}`;
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
