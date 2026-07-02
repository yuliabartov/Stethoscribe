// Google OAuth access token cache for the Gmail API.
//
// Firebase Auth manages the ID token / refresh cycle for us, but it does NOT
// persist or expose the Google OAuth access token — that's only handed back
// once, in the credential from signInWithPopup. We stash it here so the send
// flow can reach it without threading it through React state (where it would
// leak into every serialized state snapshot).
//
// Access tokens are short-lived (~1 hour). When getToken() returns null (never
// captured, or cleared after a failure), the caller re-runs signInWithPopup
// silently — the doctor's account and scope grant are still cached by Google,
// so it's typically a brief popup flash, not a full sign-in.
import { GoogleAuthProvider, type UserCredential } from 'firebase/auth';

let accessToken: string | null = null;

export function captureAccessToken(cred: UserCredential): void {
  const credential = GoogleAuthProvider.credentialFromResult(cred);
  if (credential?.accessToken) accessToken = credential.accessToken;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function clearAccessToken(): void {
  accessToken = null;
}
