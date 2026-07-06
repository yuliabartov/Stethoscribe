// Builds the report's export files. Shared by the email-send and local
// download/share paths so both always produce byte-identical files. The heavy
// docx/pdf generators stay lazy-imported (out of the main bundle) and the
// selected formats are generated in parallel.
import type { ExportFormats, Lang, ReviewState } from '../types';

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MIME_PDF = 'application/pdf';

export interface ReportAttachment {
  blob: Blob;
  filename: string;
  mimeType: string;
}

export async function buildReportAttachments(input: {
  review: ReviewState;
  templateName: string;
  lang: Lang;
  formats: ExportFormats;
}): Promise<ReportAttachment[]> {
  const { review, templateName, lang, formats } = input;
  const attachments: ReportAttachment[] = [];
  const jobs: Promise<void>[] = [];
  if (formats.word) {
    jobs.push((async () => {
      const { generateReportDocx, reportFilename } = await import('../docx/reportDocx');
      const blob = await generateReportDocx({ review, templateName, lang });
      attachments.push({ blob, filename: reportFilename(templateName, review.name), mimeType: MIME_DOCX });
    })());
  }
  if (formats.pdf) {
    jobs.push((async () => {
      const { generateReportPdf, reportPdfFilename } = await import('../pdf/reportPdf');
      const blob = await generateReportPdf({ review, templateName, lang });
      attachments.push({ blob, filename: reportPdfFilename(templateName, review.name), mimeType: MIME_PDF });
    })());
  }
  await Promise.all(jobs);
  return attachments;
}
