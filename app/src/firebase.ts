// Firebase initialization for Stethoscribe.
//
// The config values below are PUBLIC identifiers (safe to ship in the client
// bundle). Security is enforced by Firebase Auth + Firestore security rules,
// not by hiding these values. Fill app/.env with your project's values — see
// app/.env.example.
import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);

// Google Sign-In with the doctor's personal account. Requests the Gmail send
// scope so the export flow can attach the .docx report and send it directly
// from the physician's own inbox — no server-side sender, no PHI leaving their
// account. Existing users signed in before this change will see a one-time
// "grant additional access" prompt from Google the next time they sign in.
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.addScope('https://www.googleapis.com/auth/gmail.send');

// Offline-first cache: keep data locally and sync when the network returns.
// Multi-tab manager keeps several open tabs consistent. (Used heavily once
// persistence/sync land; enabling it now is harmless.)
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
