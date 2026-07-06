# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

- **`app/`** — a working React + Vite + TypeScript web app implementing "Stethoscribe," a hands-free voice-documentation tool for doctors. This is a **real, deployed application** (Firebase Hosting: https://matans-assistant-dev.web.app), not a mockup: it has Google sign-in (Firebase Auth), per-user Firestore persistence with offline cache and cross-device sync, real speech recognition (Web Speech API on phones, behind a swappable abstraction), a fuzzy category-anchor matching engine, real .docx/.pdf generation, Gmail send with attachments, and a local download/share path. Bilingual English/Hebrew with full RTL.
- **`physical-exam-voice-assistant-spec.md`** (repo root) — the Phase 1 product spec and requirements reference. Most of it is now implemented in `app/`; the main remaining gap is the **platform**: the spec targets a native/hybrid iOS+Android app using native OS speech engines, while the current exam runs on the *mobile browser's* Web Speech API as a deliberate stopgap (see `src/voice/speechSource.ts` — the native engine is meant to slot in behind the same interface).
- **`design/`** — static brand/icon assets (PNG/SVG) and an exported design bundle, not wired into the app's build.

## Commands

All commands run from the `app/` subdirectory (that's where `package.json` is — not the repo root):

```
cd app
npm install         # first-time setup
npm run dev         # Vite dev server, http://localhost:5173, HMR
npm run build       # tsc -b && vite build (full project type-check, then production build)
npm run lint        # oxlint (see app/.oxlintrc.json)
npm test            # vitest run (src/voice/matchEngine.test.ts — the capture engine)
npm run preview     # serve the production build locally
npx firebase deploy --only hosting   # deploy dist/ to Firebase Hosting (build first)
```

To type-check only (no build output): `npx tsc --noEmit` from `app/`.

Firebase config lives in `app/.env` (git-ignored; see `app/.env.example`). Firestore security rules are in `app/firestore.rules` (per-uid isolation under `users/{uid}/**`).

A `.claude/launch.json` at the repo root is already configured for Claude Code's preview tooling (`preview_start` with name `stethoscribe-web`), pointing at `npm run dev --prefix app` on port 5173.

## Architecture

**State is one flat Context, not Redux/Zustand/router.** `src/state/StethoscribeContext.tsx` holds the entire app in a single `AppState` object (see `src/types.ts`) via one `useState`. There is no React Router — navigation *is* state: `state.screen` is a `ScreenName` string, and `App.tsx`'s `Screen()` component is a plain `switch` over it. (One exception: `/privacy` is a real URL path routed in `AppShell` before the auth gate — Firebase Hosting rewrites every path to `index.html`.) The context exposes:
- `update(patch)` — generic patcher (object or updater function) for trivial field changes; most simple UI state (search text, form inputs, toggles) is set directly via `update()` from screen components rather than through a dedicated context method.
- `go(screen, extraPatch?)` — the universal navigation function. It sets `state.screen` and optionally patches other fields in the same call. Always runs `clearTimers()` (stops speech sources, timers, wake lock, flushes dictation state) on navigation.
- Named methods only exist for logic with real branching (`startExam`, `endExam`, `sendReport`, `downloadReport`, `saveTemplate`, `assignUnassigned`, etc.) — read `StethoscribeContext.tsx` before adding a new one; it may already be trivially expressible via `update()`/`go()`.

**Auth & data flow.** `onAuthStateChanged` drives sign-in state; `src/data/firestoreStore.ts` owns every Firestore read/write/subscription (templates + reports under `users/{uid}/...`). Templates/reports arrive via `onSnapshot` subscriptions — write methods write to Firestore and let the subscription reflect the change back into state. Offline persistence comes from `persistentLocalCache` in `src/firebase.ts`; **sign-out purges the local IndexedDB cache and reloads** (shared-machine hygiene — a terminated Firestore instance can't be restarted). Reports reference templates by **stable `templateId`** with the display name kept only as a fallback snapshot; resolve with `tplForReport(templateId, templateName)`, never by name alone. Report docs preserve `createdAt`/`date`/`time` on update (merge writes) and track `updatedAt`.

**The voice pipeline is deliberately layered** — keep it that way:
- `src/voice/speechSource.ts` — `WebSpeechSource` wraps the browser Web Speech API (continuous, auto-restarting sessions; phone-only by product decision — desktop gets a simulated demo). A future native engine replaces only this file.
- `src/voice/matchEngine.ts` — **pure, platform-free, unit-tested**. Fuzzy anchor matching (Dice bigrams), per-type capture (spoken-number parsing EN/HE, list-option matching, number range flagging), clinical-term correction, stop-keyword detection, unassigned-segment collection. Captured fields carry a `start` token index so callers can ignore captures older than a manual edit.
- The context wires them: full-transcript re-segmentation on each finalized result (idempotent), **manual-edit marks** (`examEditMarksRef`/`reviewEditMarksRef` — a hand-edited field only accepts speech spoken *after* the edit), unassigned-speech accumulation across recognizer sessions, wake lock (`src/voice/wakeLock.ts`), and audio/haptic feedback (`src/voice/feedback.ts` — capture earcon + failure buzz; `primeAudioFeedback()` must be called inside a tap gesture).

**Exports.** `src/export/reportAttachments.ts` builds the .docx (`src/docx/reportDocx.ts`, bidi-correct via `bidirectional` + `START` alignment) and .pdf (`src/pdf/reportPdf.ts`, html2canvas snapshot → image PDF, delegating Hebrew bidi to the browser) — shared by `sendReport` (Gmail REST API, `src/mail/gmailSend.ts`, hand-rolled MIME) and `downloadReport` (Web Share API with files, anchor-download fallback). Generators are lazy-imported; keep them out of the main bundle. Recipient addresses are validated (`src/mail/emailAddress.ts`) and sends to a non-self address require a confirm dialog.

**Perf conventions that look odd but are load-bearing:** interim speech transcripts bypass React state entirely (listener sets: `onLiveTranscript`, `onPartialFields` — writing them through `setState` re-rendered several times/sec and cancelled in-progress touch scrolls on iOS); `ExamFields` is memoized with ref-pinned callbacks; the exam's live-transcript box has a fixed height. Read the comments before "simplifying" any of it.

**The bottom nav is a sibling, not a per-screen component.** `AppShell` in `App.tsx` renders `<BottomNav />` once, gated on `screen === 'home' | 'templates' | 'reports'`. Individual screen components never render their own nav.

**Screens** (`src/screens/*.tsx`) are one file per `ScreenName`, each returning a `<>...</>` fragment with 1–2 direct children (typically a fixed header/footer plus one `className="scr"` scrollable body). Screens render directly as flex children of `PhoneFrame`'s inner container — don't wrap a screen's output in an extra div or the flex layout breaks. Pre-auth, `AppShell` renders the full-width responsive `LandingPage` instead (`SignInScreen` is legacy/unused).

**i18n is a flat dictionary plus a per-field locator.** `src/i18n.ts` exports one `DICT = { en: {...}, he: {...} }` — add new UI strings there (both languages), not inline. `loc(lang, obj, key)` resolves *data* fields following the `<field>`/`<field>He` convention with English fallback. `rtl`/`dir` derive purely from `state.lang === 'he'`. Long-form document copy (e.g. `PrivacyPage.tsx`) lives in its component, not in DICT.

**RTL layout convention:** prefer CSS logical properties (`insetInlineStart/End`, `marginInlineStart`, `textAlign: 'start'`, flexbox auto-mirroring under the ancestor `dir` attribute) over manual `rtl ? a : b` branches. Manual `rtl` checks + `transform: scaleX(-1)` are reserved for directional chevron/arrow SVGs, which don't auto-mirror.

**Theming is one flat color object** (`src/theme.ts` exports `color`) — no inline hex literals in screens. **Global CSS keyframes live in `index.css`** (`ssPulse`, `ssBar`, `ssFade`, `ssBlink`, `ssPop`, `ssSpin`) and are referenced by name from inline styles — add new ones there, don't define locally.

**Sample data** (`src/sampleData.ts`) seeds starter templates into Firestore for brand-new accounts only (`seedDefaultTemplates`, triggered by the first-empty-snapshot signal).

**`PhoneFrame.tsx`/`.phone-frame`** fills the viewport on phones; on desktop it renders a centered ~720px editing column (spec §9 — web is the comfortable-editing surface).

## Compliance notes

- The `gmail.send` OAuth scope is **restricted** — Google verification is in progress and gates rollout beyond test users. The privacy policy at `/privacy` is a prerequisite; keep it accurate when data handling changes.
- Reports are anonymized **by design** (no patient-identifier fields), but free-text dictation can contain identifiers — the privacy page instructs doctors not to speak them. Don't add patient-identity fields; that's a deliberate spec constraint (§8).
