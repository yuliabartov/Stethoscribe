# Physical Exam Voice Assistant — Product Specification (Phase 1)

**Document type:** Functional & technical specification
**Status:** Draft v1 for review
**Scope:** Phase 1 (MVP) — basic interface, free/basic voice, no patient identity management

---

## 1. Overview

A voice-assisted documentation tool for doctors. While performing a physical
examination, the doctor speaks the **category** of an exam and its **finding**
out loud. The app captures the speech, routes each finding into the correct
field of a **template** the doctor defined in advance, and produces a structured
report. The doctor reviews and edits the report on screen, then exports it to
**Word** and **PDF** and emails it to themselves.

The product's core value is **hands-free documentation**: the doctor starts the
exam with one tap and does not touch the device again until finished. This
removes the constant "stop, type, resume" interruptions that slow down a
physical examination.

---

## 2. Goals and Non-Goals

### 2.1 Phase 1 goals
- Let a doctor build and manage reusable **exam templates**.
- Let a doctor run a **hands-free voice exam session** that fills the template.
- Support **mixed Hebrew speech with English medical terminology**.
- Allow the doctor to **review and edit** the generated report on web and mobile.
- **Export** the report to Word and PDF.
- **Send** the report by email (to the doctor's own Google account).
- **Save** finished reports and allow editing them later.
- Keep all saved data **anonymized** — no patient-identifying details.
- Work **offline** for editing/review and **sync** across devices when the
  network returns.

### 2.2 Explicit non-goals for Phase 1
- No patient database, patient list, or patient-identity records.
- No premium/paid speech-to-text service (planned as a future upgrade).
- No clinical decision support, diagnosis suggestions, or coding (ICD, etc.).
- No multi-doctor / clinic-wide accounts (single doctor per account in Phase 1).
- No integration with external EMR/EHR systems.

---

## 3. Target User

A single physician who performs physical examinations and wants to dictate
findings hands-free. The doctor is comfortable using a phone and a web browser
but is not technical. The doctor authenticates with a **personal Google
account**.

---

## 4. Key Concepts (Glossary)

- **Template** — a predefined structure for a type of exam, made of ordered
  **categories**. The doctor selects a template before starting an exam.
- **Category** — one item to document. Each category has a **name** (the spoken
  anchor) and a **type** that controls how its value is captured and validated.
- **Category types (Phase 1):**
  - **Free text** — any spoken description.
  - **Number** — a numeric value (with an optional unit label).
  - **List** — one option chosen from a predefined list the doctor configured.
- **Exam session** — a single hands-free dictation run that produces one report.
- **Report** — the structured, editable output of an exam session. Always
  anonymized.

---

## 5. Core User Flows

### 5.1 Create / manage a template
1. Doctor opens **Templates** (web or mobile).
2. Creates a template, gives it a name (e.g. "Knee exam").
3. Adds categories in order. For each category the doctor sets:
   - Category **name** (this is what they will speak aloud).
   - Optional **spoken aliases / synonyms** (alternate phrasings the engine
     should also recognize for this category).
   - **Type**: free text / number / list.
   - For **number**: optional unit label and optional valid range.
   - For **list**: the set of allowed options (each option may also have spoken
     aliases).
4. Saves. Templates can be edited, duplicated, reordered, and deleted.

### 5.2 Run a hands-free exam
1. Doctor selects a template and taps **Start Exam**.
2. The app begins continuous listening. **From this point the doctor does not
   touch the device.**
3. The doctor speaks a **category name**, then the **finding**, e.g.
   *"מישוש — רגישות קלה מעל L4"* ("Palpation — mild tenderness over L4").
4. The app detects the category name, captures everything after it as that
   category's value, and waits for the next category name.
5. The doctor continues category by category, in any order.
6. The doctor ends the session by saying the stop keyword (e.g. **"סיום בדיקה"**
   / "end exam") **or** by tapping **End Exam**.
7. The app shows the assembled draft report for review.

### 5.3 Review and edit
- The doctor reviews each captured field. Fields with low recognition
  confidence are visually flagged.
- The doctor can correct any field by typing (the always-available fallback).
- Editing is available on **both** mobile and web; web is intended for
  comfortable larger-screen editing.

### 5.4 Export and send
- Doctor exports the report to **Word (.docx)** and/or **PDF**.
- Doctor sends the report by email; the report is attached as Word + PDF.
- The recipient is entered/selected at send time (default: the doctor's own
  Google account email).

### 5.5 Manage saved reports
- All finished reports are saved (anonymized) and listed by **date/time** and
  **template name**.
- The doctor can reopen, edit, re-export, and re-send any past report.
- The doctor can delete a report.

---

## 6. Voice Dictation Design (Core Mechanism)

This is the heart of the product. The design below targets the **free/basic
speech engine** in Phase 1.

### 6.1 Mixed Hebrew + English handling
The doctor speaks Hebrew but uses English medical terms inside Hebrew sentences
(code-switching). The recognition layer must tolerate this. Because the basic
engine will not transcribe English terms perfectly inside Hebrew speech, the app
relies on **fuzzy matching** (see 6.3) rather than exact text matches, and
always offers a typing fallback.

### 6.2 Category anchoring and boundary detection
- The **category names** (and their aliases) act as **anchors** in the speech
  stream.
- When the app recognizes a category name, it starts capturing the value.
- Capture continues until the **next** recognized category name or the **stop
  keyword**.
- The doctor may dictate categories in **any order**; only the ones spoken get
  filled. Unspoken categories remain empty.

### 6.3 Fuzzy matching and confidence
- Each spoken anchor is matched to the closest template category using
  approximate string matching (to absorb transcription errors and accent/term
  variation).
- Each captured field carries a **confidence level**. Low-confidence fields are
  flagged for the doctor's attention during review.
- If an anchor cannot be matched confidently to any category, the segment is
  placed in an **"Unassigned"** bucket the doctor can resolve during review.

### 6.4 Per-type capture
- **Free text** — the captured speech becomes the field value verbatim (after
  light cleanup).
- **Number** — the app extracts the numeric value from the spoken segment;
  applies the unit label; warns if outside a configured valid range.
- **List** — the spoken value is matched against the category's predefined
  options (and their aliases); the closest option is selected, with the
  confidence flag applied.

### 6.5 Session controls
- **Start Exam** — explicit button. Begins listening.
- **End Exam** — spoken stop keyword or button. Ends listening and assembles the
  draft.
- A simple on-screen state indicator shows whether the app is **listening** (for
  the rare case the doctor glances at it), without requiring interaction.

### 6.6 Corrections
- All corrections happen in **review mode**, by typing or re-selecting list
  options.
- Phase 1 does not attempt voice-driven correction commands (e.g. "delete that")
  — kept simple to reduce error.

---

## 7. Template System Specification

| Field | Applies to | Description |
|---|---|---|
| Template name | template | Display name, e.g. "Knee exam" |
| Category name | category | The primary spoken anchor |
| Aliases | category / list option | Alternate spoken phrasings recognized as the same item |
| Type | category | `free_text` \| `number` \| `list` |
| Unit label | number | Optional, e.g. "cm", "°" |
| Valid range | number | Optional min/max for validation warnings |
| Options | list | The allowed choices for a list category |
| Order | category | Display/order index within the template |

Templates are owned by the authenticated doctor and synced across their devices.

---

## 8. Data Model (Phase 1)

Entities (all owned by the authenticated doctor; **no patient identity**):

- **User** — derived from Google account (email, display name, Google user id).
- **Template** — name, ordered list of categories (with their types/options).
- **Report** — reference to the template used, the captured/edited field values,
  created timestamp, last-edited timestamp, status (draft/final), and sync
  metadata. **Contains no patient-identifying fields.**

> **Privacy rule:** the system must not provide any field for patient name, ID
> number, date of birth, or other direct identifiers. This is a deliberate
> design constraint, not just a UI omission.

---

## 9. Platforms

Both **iOS (iPhone)** and **Android** must be fully supported.

- **Mobile (iOS + Android)** — primary device for **running the hands-free exam**
  (the doctor carries it during the exam) and for quick review/edit/send.
  Because reliable hands-free *continuous* dictation is required on **both**
  iPhone and Android, the mobile experience must be a **native or hybrid app**
  (e.g. a single React Native / Flutter / Capacitor codebase targeting both
  platforms), **not** a pure web page. This is what allows use of each operating
  system's free, built-in speech recognition (see Section 14). A browser-based
  Web Speech API approach is explicitly rejected for the exam flow because its
  continuous mode is unreliable/unsupported on iOS.
- **Web** — primary surface for **comfortable editing**, template management, and
  browsing/managing saved reports. Full feature parity for editing. The web app
  is **not** used for the hands-free exam dictation.
- The same account and data are shared across mobile and web via sync
  (Section 10).

---

## 10. Offline Support and Sync

- The app is **offline-first** for: viewing templates, editing templates,
  reviewing/editing reports, and reading saved reports.
- Changes made offline are stored locally and **synced automatically when network
  access is restored**, across web and mobile.
- Conflict handling for Phase 1: last-write-wins per field is acceptable for a
  single-doctor account, with a simple "this report was also edited elsewhere"
  notice if a conflict is detected.

> **Voice + offline note.** Using each OS's **native** speech recognition (the
> recommended approach, Section 14) improves the offline story: on newer iPhones
> and Android devices, on-device recognition can work **without a network
> connection** (subject to the language pack being available on the device). Where
> on-device recognition is unavailable, dictation falls back to needing a network,
> and typing remains the universal fallback. This is a clear improvement over the
> browser Web Speech API, which is cloud-dependent and unreliable on iOS.

---

## 11. Authentication and Email

- **Authentication:** Google Sign-In (OAuth) with the doctor's personal Google
  account.
- **Email sending:** the report (Word + PDF attachments) is sent via the doctor's
  Google account, by default to their own email address. The send screen lets
  the doctor confirm or change the recipient before sending.
- Sending is an explicit, confirmed action initiated by the doctor.

> The exact Google permission scopes (sign-in only vs. send-email scope) should
> be chosen to request the **minimum** needed. Sending email on the user's behalf
> requires additional Google review/scopes — flag this in planning.

---

## 12. Report Generation

- Output formats: **Word (.docx)** and **PDF**.
- Layout follows the template order: each category renders as a labeled
  section/line with its value; empty categories can be hidden or shown per a
  template setting.
- A simple, clean clinical layout (title, date/time, body of findings). No
  patient identifiers appear anywhere in the output.

---

## 13. Privacy, Security, and Compliance

Even though reports are anonymized, **medical findings are sensitive**, so:

- All data encrypted **in transit** (HTTPS/TLS) and **at rest**.
- Access restricted to the authenticated doctor's account.
- No patient-identifying data is collected or stored, by design.
- Audio: define and disclose whether raw audio is **discarded immediately** after
  transcription (recommended for Phase 1) or retained. Recommendation: **do not
  retain audio**.
- Be transparent about the speech engine: native OS speech recognition may
  process audio on-device or via the platform vendor's servers depending on the
  device. This must be acknowledged in the app's privacy notice.
- Israeli context: the Privacy Protection Law and Ministry of Health guidance on
  medical information apply to health data. Anonymization reduces but does not
  fully eliminate obligations — **legal/compliance review is recommended before
  real patient use**, even with anonymized records.

> This section flags requirements; it is not legal advice. A privacy/compliance
> professional should review before clinical deployment.

---

## 14. Technical Approach for Phase 1 (and its limits)

- **Mobile app shell:** a **native or hybrid app** targeting both **iOS and
  Android** (e.g. React Native, Flutter, or Capacitor — a single codebase for
  both platforms is preferred to control cost and effort).
- **Speech-to-text:** each operating system's **built-in, free speech
  recognition** — Apple's **Speech framework (SFSpeechRecognizer)** on iOS and
  Android's **SpeechRecognizer / on-device recognition**. These are free OS
  services (no paid third-party subscription) and handle **continuous dictation**
  far better than the browser Web Speech API. On supported devices they can also
  run **on-device/offline**.
  - Pros: free, available on both required platforms, better continuous-dictation
    behavior, possible offline use, reasonable Hebrew support.
  - Cons/considerations: session-length limits and session restarts must be
    handled in code; Hebrew + embedded-English accuracy still varies (handled by
    the fuzzy-match layer); Android device variation in language packs.
- **Why not the browser Web Speech API:** its `continuous` mode is unreliable or
  unsupported on iOS Safari and breaks once installed as a PWA, so it cannot
  deliver the hands-free, whole-exam flow on iPhone. It is therefore **not** used
  for the exam dictation. (It could optionally power a "dictate into a field"
  convenience on the web app, but that is not part of the core exam flow.)
- **Fallback:** typing is always available on every platform, so the app remains
  fully usable even where voice underperforms.
- **Isolation for future upgrades:** the voice layer sits behind the
  anchor/fuzzy-match logic, so a higher-accuracy paid engine (even better Hebrew +
  medical terms) can replace the native engine later without reworking the rest of
  the app.

### 14.1 Recommended early validation
Before building the full app, run a **small dictation prototype on a real iPhone
and a real Android device**, using the native speech engines and **real
Hebrew+English exam phrasing**, to measure accuracy, continuous-session behavior,
and offline capability. This de-risks the single biggest assumption in Phase 1.

---

## 15. Phasing Summary

**Phase 1 (this spec):** templates, hands-free voice via each OS's free native
speech engine (iOS + Android hybrid app) + typing fallback, anonymized reports,
review/edit on web + mobile, Word/PDF export, email to self, offline edit + sync,
Google sign-in.

**Likely future phases:** higher-accuracy paid voice engine; voice correction
commands; multi-doctor/clinic accounts; richer report styling and letterhead;
optional (consented, secured) patient identity and history; EMR integration.

---

## 16. Open Questions / Risks

1. **Native-engine accuracy** for Hebrew + English medical terms — must be
   measured early on real iPhone + Android devices (Section 14.1). Biggest risk.
2. **Continuous-session handling** — native speech engines have session-length
   limits; the app must restart sessions seamlessly to keep the exam hands-free.
3. **Offline voice** — confirm which target devices support on-device recognition;
   typing remains the fallback where they don't.
4. **Google email-send scopes** — confirm the permission model and any Google
   verification requirements.
5. **Report visual style** — confirm desired layout/branding for the Word/PDF
   output.
6. **Audio retention policy** — confirm "discard immediately" (recommended).

---

## 17. Phase 1 Acceptance Criteria

- [ ] Doctor can sign in with a Google account.
- [ ] Doctor can create, edit, duplicate, reorder, and delete templates with
      free-text, number, and list categories (including aliases and list options).
- [ ] Doctor can start a hands-free exam with one tap and end it by voice keyword
      or button, without touching the screen in between.
- [ ] Spoken category names route values to the correct fields; numbers and list
      selections are handled per type; low-confidence fields are flagged.
- [ ] Doctor can review and edit the report by typing on both mobile and web.
- [ ] Doctor can export the report to Word and PDF.
- [ ] Doctor can send the report by email (default: self) with attachments, as a
      confirmed action.
- [ ] Finished reports are saved anonymized, listed by date/time + template, and
      remain editable later.
- [ ] Editing/review works offline and syncs across devices when the network
      returns.
- [ ] No patient-identifying data is collected or stored anywhere.
