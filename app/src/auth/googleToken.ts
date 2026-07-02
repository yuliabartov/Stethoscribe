import { GoogleAuthProvider, type UserCredential } from 'firebase/auth';

let accessToken: string | null = null;
let capturedAt = 0;

// Google access tokens live ~3600s; treat as stale after 50 min.
const MAX_AGE_MS = 50 * 60 * 1000;

export function captureAccessToken(cred: UserCredential): void {
  const credential = GoogleAuthProvider.credentialFromResult(cred);
  if (credential?.accessToken) {
    accessToken = credential.accessToken;
    capturedAt = Date.now();
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function isTokenFresh(): boolean {
  return accessToken !== null && Date.now() - capturedAt < MAX_AGE_MS;
}

export function clearAccessToken(): void {
  accessToken = null;
  capturedAt = 0;
}
