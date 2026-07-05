// One deliverable address: something@something.tld, no whitespace or control
// characters — which also keeps CRLF out of the hand-built MIME headers in
// gmailSend.ts. Deliberately loose beyond that; the mailbox's existence can't
// be validated client-side anyway.
export function isValidEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}
