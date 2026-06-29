# Stethoscribe

**Stethoscribe** is a hands-free voice-documentation app concept for doctors: speak your exam findings as you work, and they fill into a structured report automatically — no typing, no stopping the exam to take notes.

This repository contains a fully bilingual (English / Hebrew, with RTL support) interactive UI prototype, built in React + Vite + TypeScript, faithfully ported from the original Claude Design mockup. It covers all 8 core screens with realistic sample data:

- **Sign-in**
- **Home** — start an exam, pick a template, jump to a recent report
- **Templates** — list of reusable exam structures
- **Template builder** — create/edit a template's categories (free text, number, or list type)
- **Active exam** — simulated hands-free voice capture with live status per category
- **Review & edit** — check and correct captured findings before sending
- **Export & send** — choose PDF/Word, send to an email recipient
- **Saved reports** — search, sort, and reopen past reports

> **Note:** this is a UI/UX prototype, not the production product. Voice capture is simulated (a timed animation that fills in canned sample values) — there's no real speech recognition, backend, or authentication yet. The full Phase 1 product spec, describing the intended native iOS/Android app with real on-device speech recognition, Google sign-in, and offline sync, lives in [`physical-exam-voice-assistant-spec.md`](physical-exam-voice-assistant-spec.md).

## Getting started

```
cd app
npm install
npm run dev
```

Then open the printed local URL (default `http://localhost:5173`).

## Available scripts

Run from the `app/` directory:

| Command | Description |
|---|---|
| `npm run dev` | Start the Vite dev server with hot-reload |
| `npm run build` | Type-check the whole project and build for production |
| `npm run lint` | Run oxlint |
| `npm run preview` | Locally preview the production build |

## Tech stack

- React 19 + TypeScript
- Vite
- No router, no external state library — a single React Context holds all app state
- All UI strings and bilingual sample data are hand-authored (no translation service)

## Repository layout

- `app/` — the React/Vite application (see above)
- `design/` — brand assets and the original design exploration files
- `physical-exam-voice-assistant-spec.md` — the full Phase 1 product specification
- `CLAUDE.md` — architecture notes for AI coding agents working in this repo
