# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

Two things live side by side here:

- **`app/`** — a working React + Vite + TypeScript implementation of "Stethoscribe," a hands-free voice-documentation app for doctors. This is a **UI prototype**, not the real product: it is a faithful port of an interactive Claude Design mockup (`.dc.html`), built to demonstrate the full bilingual (English/Hebrew, with RTL) UX across all 8 screens with realistic sample data and simulated interactions.
- **`physical-exam-voice-assistant-spec.md`** (repo root) — the actual Phase 1 product spec for the real product. It describes a much bigger system than what's in `app/`: native iOS/Android apps, real on-device speech recognition with fuzzy category-anchor matching, Google sign-in, offline sync, real Word/PDF export and email sending. **Do not assume any of that exists in the code.** Treat this doc as the long-term target/requirements reference, not a description of current behavior.
- **`design/`** — static brand/icon assets (PNG/SVG) and an exported design bundle, not wired into the app's build.

Concretely, in `app/`: voice capture is a `setInterval`-driven animation that walks through canned sample values (see `startExam`/`advance` in `StethoscribeContext.tsx`); there is no speech recognition, no backend, no auth, and "export/send" just flips in-memory flags. All state lives in one `useState` in a React Context and is lost on reload.

## Commands

All commands run from the `app/` subdirectory (that's where `package.json` is — not the repo root):

```
cd app
npm install        # first-time setup
npm run dev         # Vite dev server, http://localhost:5173, HMR
npm run build       # tsc -b && vite build (full project type-check, then production build)
npm run lint        # oxlint (see app/.oxlintrc.json)
npm run preview     # serve the production build locally
```

There is no test suite/runner configured in this project.

To type-check only (no build output): `npx tsc --noEmit` from `app/`.

A `.claude/launch.json` at the repo root is already configured for Claude Code's preview tooling (`preview_start` with name `stethoscribe-web`), pointing at `npm run dev --prefix app` on port 5173.

## Architecture

**State is one flat Context, not Redux/Zustand/router.** `src/state/StethoscribeContext.tsx` holds the entire app in a single `AppState` object (see `src/types.ts`) via one `useState`. There is no React Router — navigation *is* state: `state.screen` is a `ScreenName` string, and `App.tsx`'s `Screen()` component is a plain `switch` over it. The context exposes:
- `update(patch)` — generic patcher (object or updater function) for trivial field changes; most simple UI state (search text, form inputs, toggles) is set directly via `update()` from screen components rather than through a dedicated context method.
- `go(screen, extraPatch?)` — the universal navigation function. It sets `state.screen` and optionally patches other fields in the same call (e.g. seeding `review`/`builder`/`exam` sub-state for the destination screen, or setting `nav` for bottom-nav highlighting). Always clears the exam timers (see below) on navigation.
- Named methods only exist for logic with real branching (`startExam`, `endExam`, `openBuilder`, `saveTemplate`, `moveCat`, `confirmAdd`, `sendReport`, etc.) — read `StethoscribeContext.tsx` before adding a new one; it may already be trivially expressible via `update()`/`go()`.

**The bottom nav is a sibling, not a per-screen component.** `AppShell` in `App.tsx` renders `<BottomNav />` once, gated by `showNav = screen === 'home' || 'templates' || 'reports'`. Individual screen components never render their own nav — this mirrors the original design's structure exactly and matters if you add a new screen that should (or shouldn't) show the nav.

**Screens** (`src/screens/*.tsx`) are one file per `ScreenName`, each a function component that calls `useStethoscribe()` and returns a `<>...</>` fragment with 1–2 direct children (typically a fixed header/footer plus one `className="scr"` scrollable body). This matters because screens are rendered directly as flex children of `PhoneFrame`'s inner container (`display:flex; flex-direction:column`) — don't wrap a screen's output in an extra div or the flex layout breaks.

**i18n is a flat dictionary plus a per-field locator, not per-screen bundles.** `src/i18n.ts` exports one `DICT = { en: {...}, he: {...} }` with every UI string as a flat key (`DICT.en.startExam`, etc.) — add new strings there, not inline. Separately, `loc(lang, obj, key)` resolves *data* fields that follow the `<field>`/`<field>He` convention (template/category names, sample values, options) — it returns `obj[key + 'He']` in Hebrew unless that's null/undefined/empty, in which case it falls back to `obj[key]`. `rtl`/`dir` are derived purely from `state.lang === 'he'`, never from browser locale.

**RTL layout convention:** prefer CSS logical properties (`insetInlineStart/End`, `marginInlineStart`, `textAlign: 'start'`, default flexbox mirroring under the ancestor `dir` attribute set in `PhoneFrame.tsx`) over manual `rtl ? a : b` branches — most layout mirrors automatically this way. Manual `rtl` checks + `transform: scaleX(-1)` are reserved specifically for directional chevron/arrow SVG icons, which don't auto-mirror.

**Theming is one flat color object.** `src/theme.ts` exports `color = {...}` — every color used anywhere in the app should be a named constant there, not an inline hex literal in a screen component. When porting a new color from the design, add it to `theme.ts` first.

**Global CSS keyframes live in `index.css`** (`ssPulse`, `ssBar`, `ssFade`, `ssBlink`, `ssPop`) and are referenced by name from inline `style={{ animation: '...' }}` strings in screen components (e.g. the exam screen's pulsing mic, the export screen's success-checkmark pop). Don't redefine animations locally — add new ones to `index.css` if needed.

**Sample data** (`src/sampleData.ts`) seeds `INITIAL_TEMPLATES`/`INITIAL_REPORTS` into the context's initial state. There is no persistence layer; anything created at runtime (a new template, a "sent" report) only exists for the current page session.

**`PhoneFrame.tsx`** renders a fixed-aspect, rounded "phone" viewport centered on the page — this is a deliberate prototype/demo affordance to present the mobile UI on desktop, not a responsive web layout. Don't "fix" it to be full-width/responsive without checking with the user first; that would change the product's presentation intentionally chosen for this mockup.
