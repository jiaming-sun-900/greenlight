# Greenlight - Product Specification

Visa eligibility screener and job application tracker for international students on F-1 visas.

---

## Overview

Greenlight is a two-part web application:
1. A job posting screener that uses an LLM to analyze pasted job descriptions and return a Red / Yellow / Green visa eligibility verdict.
2. A Kanban-style application tracker where screened jobs are stored as draggable cards.

No user accounts. No login. All data persists in browser localStorage.

---

## Tech Stack

- **Frontend:** React + Tailwind CSS
- **Backend:** FastAPI (Python) - `POST /screen` for screening, plus a `GET /health` liveness check
- **LLM:** Claude API (`claude-haiku-4-5-20251001`) via Anthropic SDK
- **Drag and drop:** `dnd-kit`
- **Deployment:** none configured yet. No deploy target has been chosen and the repo contains no
  deployment config; the frontend's backend URL is currently hardcoded to `http://localhost:8000`.
- **Persistence:** localStorage only (no database for MVP)

---

## Page Structure

The app has two main views accessible via a top navigation bar:

1. **Screener** (default landing view)
2. **Tracker**

---

## View 1 - Screener

### Layout

Two-panel layout side by side, inspired by Google Translate.

- **Left panel:** Plain text input area. Placeholder text: "Paste a full job description here..."
- **Right panel:** Structured AI-generated output (see below)
- A single **"Analyze"** button between or below the panels triggers the API call.
- While loading, show a subtle spinner or skeleton in the right panel.

### Right Panel Output

After analysis, the right panel displays:

**At the top - Verdict Badge**

A large badge showing one of three states:
- 🟢 **Greenlight** - CPT, OPT, or H-1B sponsorship explicitly supported
- 🟡 **Yellow** - Mixed signals or vague language
- 🔴 **Red** - Requires US citizenship or permanent residency, or explicitly states no sponsorship

Below the badge, a small **"Why this verdict?"** link. Clicking it opens a modal that lists the exact phrases detected that led to the verdict (e.g., "Detected: 'Open to OPT/CPT' → Greenlight" or "Detected: 'Must not require sponsorship now or in the future' → Red").

**Structured Job Summary (all fields editable inline)**

- Position Title
- Company Name
- Job Functions (2–3 sentence plain English summary of what the role does)
- Preferred Skills (bullet list of key requirements/skills mentioned)
- Application Deadline - date input (`YYYY-MM-DD`), user can type or select a date (optional)

All fields are editable directly in the right panel. The user can correct any AI parsing errors before saving to the tracker.

**Add to Tracker Button**

At the bottom of the right panel, a button: **"Add to Tracker →"**

Clicking this creates a card in the Tracker's **Saved** column using the current right panel data (including any user edits) and the verdict color. It then navigates the user to the Tracker view.

---

## View 2 - Tracker

### Kanban Board

Five columns, left to right:

1. **Saved** - Screened but not yet applied
2. **Applied** - Application submitted
3. **Interviewing** - Active interview process
4. **Offer** - Received an offer
5. **Closed** - Rejected, withdrawn, or expired

Cards can be dragged between any columns freely.

### Job Card (front face)

Each card displays:
- Colored left border (light green / light yellow / light red matching the verdict)
- Card background is white or near-white so text is always readable
- **Position Title** (bold)
- **Company Name**
- **Deadline badge** - four states, so a deadline entered on a card is never invisible:

| Deadline | Badge |
|----------|-------|
| Past | grey "Closed" |
| Today | orange "Due today" |
| Within 3 days | orange countdown, e.g. "2 days left" |
| Further out | muted date, e.g. "Oct 15, 2026" |

No deadline entered means no badge. The "Due today" and muted far-future states go beyond the
original two-state design and are intentional: a bare countdown left far-off deadlines with no
visible indication that a deadline existed at all.

### Card Expand (click to open)

Clicking a card opens a centered modal overlay showing the full AI-generated report, still editable. Fields shown:
- Verdict badge + "Why this verdict?" link (same modal behavior as screener)
- Position Title (editable)
- Company Name (editable)
- Application Deadline (editable)
- Job Functions (editable)
- Preferred Skills (editable)
- Notes field - free text, user can add anything (interview notes, contacts, etc.)
- **Stage** dropdown - moves the card between columns from inside the modal. Intentional addition
  to the original field list: dragging is the primary gesture, but it is awkward on narrow screens
  and impossible from the keyboard, so the dropdown is the accessible path to the same action.

A **"Close"** button dismisses the modal. Edits auto-save on every keystroke rather than on close:
each change is written straight through to the card store, which persists to localStorage. This is
intentional, and means a card can never lose edits to a refresh or a stray click on the backdrop.
By the time the modal closes, everything is already saved.

A **"Delete Card"** button (red, bottom of modal) removes the card after a confirmation prompt.

---

## LLM Screening Logic

### API Call

The backend receives the raw pasted text and calls the Claude API (`claude-haiku-4-5-20251001`)
with a structured prompt.

### Verdict Rules

- **Green** - Text explicitly mentions CPT, OPT, F-1, or H-1B sponsorship as supported. Phrases like "Open to OPT/CPT candidates," "will sponsor H-1B," "F-1 students welcome."
- **Yellow** - Language is vague, contradictory, or unclear. Examples: "US work authorization required" with no mention of OPT/CPT. "Sponsorship available for exceptional candidates." Contradictions between a platform filter tag and the job body.
- **Red** - Either the text excludes international students outright ("must not require work sponsorship now or in the future," "US citizens and permanent residents only"), or it rules out sponsorship in present-tense or role-scoped terms ("no sponsorship is available at this time") so that the role has no path past the OPT window. Both are red, but they mean different things to the user: see "Now and future are two questions" below.

### Important Edge Case

If a posting says both "US work authorization required" AND explicitly names OPT or CPT as accepted, the explicit mention of OPT/CPT overrides the generic work authorization language. For an internship or temporary role, or where later sponsorship is addressed positively, that makes it **Green** (`optcpt_overrides_generic`). For a full-time role with nothing said about the period after OPT, the override still holds but only settles the "now" question, so it is **Yellow** (`optcpt_future_unstated`).

### Now and Future Are Two Questions

Whether a student may be hired *today* on existing OPT or CPT authorization, and whether the
employer will sponsor a work visa *after* that authorization expires, are separate questions. A
posting can answer one and say nothing about the other, and most of the hard cases come from
treating an answer to one as an answer to both.

Three consequences the screener has to get right:

- **Hedged wording is present-tense.** "at this time," "for this position," "for this requisition,"
  and "currently" scope a statement to now or to one opening. "No sponsorship is available at this
  time" is `no_future_sponsorship_only`, not `no_sponsorship_now_or_future`.
- **E-Verify and Form I-983 are not sponsorship.** E-Verify participation is a STEM OPT compliance
  requirement and I-983 is a STEM OPT training plan. An employer can do both, hire a student on STEM
  OPT, and still never file an H-1B. Neither counts as evidence of sponsorship on its own.
- **OPT acceptance is sufficient for an internship, not for a career.** For an internship or co-op
  ending inside the OPT window, explicit OPT/CPT acceptance fully answers the question and is green.
  For a full-time role with nothing said about the period after OPT, the future question is still
  open, and that is `optcpt_future_unstated` (yellow).

Tags are chosen by applying these in order and stopping at the first that fits:

1. Bars the candidate outright, now and in future -> red (`citizens_only`,
   `no_sponsorship_now_or_future`, `explicit_no_visa`).
2. Rules out sponsorship in present-tense or role-scoped terms, but does not bar someone holding
   their own work authorization -> red (`no_future_sponsorship_only`).
3. Explicitly commits to sponsoring a work visa -> green (`explicit_h1b_sponsor`).
4. Explicitly accepts OPT/CPT/F-1: internship or temporary role, or later sponsorship also addressed
   positively -> green (`explicit_optcpt`, plus `optcpt_overrides_generic` where generic
   work-authorization language appears too). Full-time with the future unstated -> yellow
   (`optcpt_future_unstated`), even when generic work-authorization language is present;
   `optcpt_overrides_generic` belongs to the green branch only.
5. Otherwise, the remaining yellow tags.

### Verdict Sub-Reasons (tiered)

Beyond the top-level verdict, each detected signal is tagged with a **sub-reason** that explains *why* it points where it does. Every verdict must carry at least one sub-reason from its tier. The `silent_no_signal` case is special: it applies when the posting says nothing at all about visa status, so there is no phrase to quote.

**Green sub-reasons**

- `explicit_optcpt` - Posting explicitly states OPT, CPT, or F-1 status is accepted (e.g. "open to OPT/CPT candidates," "F-1 students welcome"), and either the role is an internship, co-op, or other temporary position ending inside the OPT window, or the posting also speaks positively about sponsorship beyond it.
- `explicit_h1b_sponsor` - Posting explicitly states the employer will sponsor H-1B or other work visas.
- `optcpt_overrides_generic` - Posting contains generic "work authorization required" language AND explicit OPT/CPT/sponsorship language elsewhere; the explicit mention overrides the generic phrase (the edge case above).

**Yellow sub-reasons**

- `generic_authorization_only` - Posting requires "US work authorization" (or similar) with no explicit OPT/CPT mention and no explicit exclusion. Ambiguous - could include or exclude international students.
- `silent_no_signal` - Posting contains zero language about visa status, sponsorship, or work authorization anywhere. No signal in either direction.
- `vague_conditional` - Posting offers sponsorship conditionally, not as a commitment (e.g. "sponsorship available for exceptional candidates," "considered on a case-by-case basis").
- `contradictory` - Posting contains both inclusive and exclusive signals in different sections (e.g. a platform filter tag that conflicts with the job body).
- `optcpt_future_unstated` - Posting explicitly accepts OPT/CPT/F-1 for a full-time or permanent role but says nothing either way about sponsorship after the OPT window. The student can be hired; whether there is an H-1B path is simply unanswered.

**Red sub-reasons**

- `citizens_only` - Posting explicitly requires US citizenship or permanent residency.
- `no_sponsorship_now_or_future` - Posting explicitly states no sponsorship now or in the future.
- `explicit_no_visa` - Posting explicitly states it cannot accommodate visa holders at all, so the student cannot be hired even on existing OPT/CPT authorization.
- `no_future_sponsorship_only` - Posting rules out sponsorship in present-tense or role-scoped terms ("sponsorship is not available for this position," "no sponsorship is available at this time") without barring someone who already holds work authorization. The student can usually still be hired on OPT or STEM OPT; the path after it expires is what is missing.

### Prompt Output Format

The LLM must return a JSON object with this exact shape:

```json
{
  "verdict": "green" | "yellow" | "red",
  "verdict_reasons": [
    { "tag": "sub-reason string", "detected_phrase": "exact quoted phrase or null" }
  ],
  "position_title": "string",
  "company_name": "string",
  "job_functions": "string (2-3 sentences)",
  "preferred_skills": ["skill 1", "skill 2", "skill 3"],
  "deadline": "YYYY-MM-DD or null"
}
```

Each entry in `verdict_reasons` is an object with a `tag` (one of the sub-reason strings above, matching the top-level verdict's tier) and a `detected_phrase` (the exact quoted text that triggered it, or `null` for `silent_no_signal`).

`deadline` must be an ISO calendar date in `YYYY-MM-DD` form, or `null`. The model converts prose
dates itself ("March 15, 2026" becomes "2026-03-15"). If the posting names no application deadline,
or the date is too vague to resolve to a single day, it returns `null`.

### Output Validation

The model's response is validated against the `ScreenResult` model in `backend/main.py` before it is
returned to the client. Validation rejects an invalid verdict, an unknown sub-reason tag, an empty
`verdict_reasons` list, a wrongly typed field, and a deadline that is neither `null` nor
`YYYY-MM-DD`. An empty-string deadline is normalized to `null` rather than rejected. A validation
failure follows the same path as unparseable JSON: retry the call once, then return a 502.

The tier cross-check is deliberately softer. If the sub-reason tags do not match the tier of the
top-level verdict, the backend logs a warning naming the verdict, the mismatched tags, and the full
reasons list, then returns the response unchanged. A mismatch means the prompt needs work, not that
the analysis is worthless, so the user still sees their verdict instead of an error.

---

## localStorage Schema

All tracker data is stored under a single key `greenlight_cards`.

Value is a JSON array of card objects:

```json
[
  {
    "id": "uuid",
    "column": "saved" | "applied" | "interviewing" | "offer" | "closed",
    "verdict": "green" | "yellow" | "red",
    "verdict_reasons": [
      { "tag": "sub-reason string", "detected_phrase": "exact quoted phrase or null" }
    ],
    "position_title": "string",
    "company_name": "string",
    "job_functions": "string",
    "preferred_skills": ["..."],
    "deadline": "YYYY-MM-DD or empty string",
    "notes": "string",
    "created_at": "ISO date string"
  }
]
```

---

## Visual Design Guidelines

- Clean, minimal aesthetic. Lots of white space.
- Accent colors tied to verdict only: use muted/pastel versions - `#d1fae5` (light green), `#fef9c3` (light yellow), `#fee2e2` (light red).
- Primary font: Inter or system-ui.
- The traffic light / signal metaphor should be present but not overdone. One clear icon or badge per verdict is enough.
- Dark mode is a future consideration, not MVP.

---

## Out of Scope for MVP

- User accounts or authentication
- Cross-device sync
- H-1B employer database cross-referencing (planned for v2)
- Browser extension
- URL input with automatic job description fetching
- Email or calendar integration for deadlines

---

## Known Issues

Accepted for now, tracked here so they do not get rediscovered as surprises:

- **Backend URL is hardcoded.** `SCREEN_ENDPOINT` in `frontend/src/views/Screener.jsx` points at
  `http://localhost:8000` with no environment variable, so the frontend cannot be aimed at a
  deployed backend without a code change. Blocks deployment.
- **No test suite.** There are no tests and no CI anywhere in the repo. ESLint is configured
  (`npm run lint`) but nothing enforces it.
- **npm audit vulnerabilities.** `npm audit` reports 9 findings (1 low, 2 moderate, 6 high), all in
  transitive dev-tooling dependencies (babel, browserslist, postcss, and similar). None are in
  runtime dependencies shipped to the browser. All are fixable via `npm audit fix`.
- **Dead files in the frontend.** `src/App.css` is the unmodified Vite template stylesheet and is
  imported nowhere; `src/assets/hero.png`, `react.svg`, and `vite.svg` are unreferenced.

---

## Build Order

1. Scaffold React frontend + FastAPI backend
2. Build the two-panel Screener UI (static, no API yet)
3. Wire in Claude API call and display structured output in right panel
4. Add verdict badge and "Why this verdict?" modal
5. Build editable fields in right panel
6. Build Kanban board with dnd-kit (static cards first)
7. Wire "Add to Tracker" button - create card from screener data
8. Implement localStorage persistence (save, load, update, delete)
9. Add deadline countdown badge logic
10. Polish: transitions, loading states, empty states, mobile responsiveness
