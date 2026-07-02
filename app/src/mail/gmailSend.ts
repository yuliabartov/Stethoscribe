// Gmail send-with-attachment via the REST API.
//
// We hand-roll the RFC-822 multipart/mixed MIME message and base64url-encode
// it, then POST to users.messages.send. No SDK is needed for a single endpoint
// like this — pulling in googleapis or gapi would balloon the bundle for one
// call. Distinct error codes ('auth' | 'network' | 'unknown') let the caller
// pick the right message and decide whether to re-run the sign-in popup.
export type GmailSendError = 'auth' | 'network' | 'unknown';

export class GmailSendFailure extends Error {
  readonly code: GmailSendError;
  constructor(code: GmailSendError, message: string) {
    super(message);
    this.code = code;
  }
}

export interface MailAttachment {
  blob: Blob;
  filename: string;
  mimeType: string;
}

interface SendReportEmailInput {
  accessToken: string;
  to: string;
  from: string;
  subject: string;
  body: string;
  attachments: MailAttachment[];
}

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  // btoa needs a binary string; chunking avoids the "call stack exceeded"
  // that a single String.fromCharCode(...bytes) hits above ~65k bytes.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

// Gmail wants a base64URL-safe encoding of the whole RFC-822 message (no '=' padding).
function base64UrlEncode(str: string): string {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function buildMimeMessage(input: SendReportEmailInput): Promise<string> {
  const boundary = 'sscribe_' + Math.random().toString(36).slice(2);
  const CRLF = '\r\n';

  const attachmentParts: string[] = [];
  for (const att of input.attachments) {
    const b64 = await blobToBase64(att.blob);
    attachmentParts.push(
      `--${boundary}`,
      `Content-Type: ${att.mimeType}`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${att.filename}"`,
      '',
      b64,
      '',
    );
  }

  const lines = [
    `From: ${input.from}`,
    `To: ${input.to}`,
    `Subject: =?UTF-8?B?${btoa(unescape(encodeURIComponent(input.subject)))}?=`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    btoa(unescape(encodeURIComponent(input.body))),
    '',
    ...attachmentParts,
    `--${boundary}--`,
    '',
  ];
  return lines.join(CRLF);
}

export const MIME_DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const MIME_PDF = 'application/pdf';

export async function sendReportEmail(input: SendReportEmailInput): Promise<void> {
  const raw = base64UrlEncode(await buildMimeMessage(input));

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 30_000);

  let res: Response;
  try {
    res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
      signal: abort.signal,
    });
  } catch (err) {
    const msg = (err as Error).name === 'AbortError' ? 'Request timed out' : ((err as Error).message || 'Network error');
    throw new GmailSendFailure('network', msg);
  } finally {
    clearTimeout(timer);
  }

  if (res.ok) return;

  // 401 → token expired or revoked; 403 → missing gmail.send scope. Both are
  // fixed by re-running signInWithPopup, so the caller collapses them to 'auth'.
  if (res.status === 401 || res.status === 403) {
    throw new GmailSendFailure('auth', `Gmail auth failed (${res.status})`);
  }
  const body = await res.text().catch(() => '');
  throw new GmailSendFailure('unknown', `Gmail send failed (${res.status}): ${body}`);
}
