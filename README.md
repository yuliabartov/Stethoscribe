> **AI-assisted development note.** This repo is developed primarily with Claude Code (the CLI). `CLAUDE.md` in the root contains project-specific instructions for that workflow; you can ignore it if you're not using an AI coding agent.

# Stethoscribe

**Stethoscribe** is a hands-free voice-documentation app for doctors: speak your exam findings as you work, and they fill into a structured report automatically — no typing, no stopping the exam to take notes.

Live deployments:
- Firebase Hosting: https://matans-assistant-dev.web.app
- Vercel: https://app-one-azure-12.vercel.app

Fully bilingual English / Hebrew with full RTL. Built in React + Vite + TypeScript.

## What it does

- **Sign in** with Google (Firebase Auth) — per-user templates and reports sync across devices via Firestore (with offline cache).
- **Templates** — build reusable exam structures with typed categories (free text, number, list of options); starter templates are seeded for new accounts.
- **Active exam** — real hands-free voice capture on phones (Web Speech API) with a fuzzy anchor-matching engine that routes speech to the right category, handles spoken numbers in EN/HE, list-option matching, and stop-keywords.
- **Review & edit** — correct captured findings; manual edits are protected from being overwritten by later speech.
- **Export & send** — generate a real `.docx` and a searchable `.pdf` (bidi-correct Hebrew via an embedded David Libre font); send via Gmail with attachments, or download / share locally.
- **Saved reports** — search, sort, and reopen past reports; edits are merge-written so timestamps are preserved.

> **Platform gap.** The Phase 1 product spec targets a native/hybrid iOS + Android app using the OS's native speech engine. The current build runs the exam in the *mobile browser's* Web Speech API as a deliberate stopgap — the recognizer sits behind a swappable `SpeechSource` interface (`app/src/voice/speechSource.ts`) so a native engine can slot in later. See [`physical-exam-voice-assistant-spec.md`](physical-exam-voice-assistant-spec.md) for the full spec.

## Getting started

```
cd app
npm install
cp .env.example .env   # then fill in your Firebase web config
npm run dev
```

Then open the printed local URL (default `http://localhost:5173`).

### Firebase setup

The app needs a Firebase project (Auth + Firestore). Copy `app/.env.example` to `app/.env` and fill in the six `VITE_FIREBASE_*` values from Firebase Console → Project Settings → Your apps → Web app → *SDK setup and configuration*. These values are public identifiers, not secrets — access is enforced by Firebase Auth and the Firestore security rules in `app/firestore.rules` (per-uid isolation under `users/{uid}/**`).

## Available scripts

Run from the `app/` directory:

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with hot-reload |
| `npm run build` | Type-check the whole project and build for production |
| `npm run lint` | Run oxlint |
| `npm test` | Run the vitest unit tests (currently the capture engine) |
| `npm run preview` | Locally preview the production build |

Type-check only (no build output): `npx tsc --noEmit` from `app/`.

## Deployment

**Firebase Hosting** (primary):
```
cd app
npm run build
npx firebase deploy --only hosting
```

**Vercel** (secondary):
```
cd app
vercel deploy --prod
```
On Vercel, the `VITE_FIREBASE_*` variables must be set in **Project Settings → Environment Variables** (they're baked into the bundle at build time). After deploying to any new domain, add that domain in Firebase Console → Authentication → Settings → Authorized domains so Google sign-in works.

## Tech stack

- **UI:** React 19 + TypeScript, Vite
- **State:** a single React Context (`src/state/StethoscribeContext.tsx`), no Redux/Zustand, no router — navigation is state
- **Auth & data:** Firebase Auth (Google sign-in) + Firestore with offline persistent cache
- **Speech:** Web Speech API on phones, behind a swappable `SpeechSource` abstraction; pure, unit-tested match engine (Dice-coefficient fuzzy anchor matching, spoken-number parsing EN/HE)
- **Docs & PDFs:** `docx` for .docx generation; `jsPDF` + `bidi-js` + embedded David Libre TTF for searchable, bidi-correct Hebrew PDFs
- **Mail:** hand-rolled MIME + Gmail REST API (`gmail.send` scope — Google verification in progress)
- **i18n:** flat DICT + per-field `<field>` / `<field>He` convention; CSS logical properties for RTL

## Repository layout

- `app/` — the React/Vite application (all source, tests, and deploy config live here)
- `design/` — brand assets and the original design exploration files (not wired into the build)
- `physical-exam-voice-assistant-spec.md` — the full Phase 1 product specification
- `CLAUDE.md` — architecture notes for AI coding agents working in this repo

## Privacy & compliance

Reports are anonymized by design — no patient-identity fields exist in templates or storage. Free-text dictation can still contain identifiers, so the in-app privacy page (`/privacy`) instructs doctors not to speak them. The `gmail.send` OAuth scope is *restricted*, gated on Google's app-verification review; keep the privacy page accurate when data handling changes.
