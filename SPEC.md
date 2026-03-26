# Greenlight — Product Specification

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
- **Backend:** FastAPI (Python) or Node/Express — single API route for screening
- **LLM:** Claude API (`claude-sonnet-4-20250514`) via Anthropic SDK
- **Drag and drop:** `dnd-kit`
- **Deployment:** Vercel (frontend) + Railway or Render (backend)
- **Persistence:** localStorage only (no database for MVP)

---

## Page Structure

The app has two main views accessible via a top navigation bar:

1. **Screener** (default landing view)
2. **Tracker**

---

## View 1 — Screener

### Layout

Two-panel layout side by side, inspired by Google Translate.

- **Left panel:** Plain text input area. Placeholder text: "Paste a full job description here..."
- **Right panel:** Structured AI-generated output (see below)
- A single **"Analyze"** button between or below the panels triggers the API call.
- While loading, show a subtle spinner or skeleton in the right panel.

### Right Panel Output

After analysis, the right panel displays:

**At the top — Verdict Badge**

A large badge showing one of three states:
- 🟢 **Greenlight** — CPT, OPT, or H-1B sponsorship explicitly supported
- 🟡 **Yellow** — Mixed signals or vague language
- 🔴 **Red** — Requires US citizenship or permanent residency, or explicitly states no sponsorship

Below the badge, a small **"Why this verdict?"** link. Clicking it opens a modal that lists the exact phrases detected that led to the verdict (e.g., "Detected: 'Open to OPT/CPT' → Greenlight" or "Detected: 'Must not require sponsorship now or in the future' → Red").

**Structured Job Summary (all fields editable inline)**

- Position Title
- Company Name
- Job Functions (2–3 sentence plain English summary of what the role does)
- Preferred Skills (bullet list of key requirements/skills mentioned)
- Application Deadline — input field, user can type or select a date (optional)

All fields are editable directly in the right panel. The user can correct any AI parsing errors before saving to the tracker.

**Add to Tracker Button**

At the bottom of the right panel, a button: **"Add to Tracker →"**

Clicking this creates a card in the Tracker's **Saved** column using the current right panel data (including any user edits) and the verdict color. It then navigates the user to the Tracker view.

---

## View 2 — Tracker

### Kanban Board

Five columns, left to right:

1. **Saved** — Screened but not yet applied
2. **Applied** — Application submitted
3. **Interviewing** — Active interview process
4. **Offer** — Received an offer
5. **Closed** — Rejected, withdrawn, or expired

Cards can be dragged between any columns freely.

### Job Card (front face)

Each card displays:
- Colored left border (light green / light yellow / light red matching the verdict)
- Card background is white or near-white so text is always readable
- **Position Title** (bold)
- **Company Name**
- **Deadline badge** — if a deadline was entered and it is within 3 days, show a small orange countdown badge (e.g., "2 days left"). If past deadline, show a grey "Closed" badge.

### Card Expand (click to open)

Clicking a card opens a centered modal overlay showing the full AI-generated report, still editable. Fields shown:
- Verdict badge + "Why this verdict?" link (same modal behavior as screener)
- Position Title (editable)
- Company Name (editable)
- Application Deadline (editable)
- Job Functions (editable)
- Preferred Skills (editable)
- Notes field — free text, user can add anything (interview notes, contacts, etc.)

A **"Close"** button dismisses the modal. Changes auto-save to localStorage on close.

A **"Delete Card"** button (red, bottom of modal) removes the card after a confirmation prompt.

---

## LLM Screening Logic

### API Call

The backend receives the raw pasted text and calls the Claude API with a structured prompt.

### Verdict Rules

- **Green** — Text explicitly mentions CPT, OPT, F-1, or H-1B sponsorship as supported. Phrases like "Open to OPT/CPT candidates," "will sponsor H-1B," "F-1 students welcome."
- **Yellow** — Language is vague, contradictory, or unclear. Examples: "US work authorization required" with no mention of OPT/CPT. "Sponsorship available for exceptional candidates." Contradictions between a platform filter tag and the job body.
- **Red** — Text explicitly excludes international students. Phrases like "must not require work sponsorship now or in the future," "US citizens and permanent residents only," "no visa sponsorship."

### Important Edge Case

If a posting says both "US work authorization required" AND explicitly names OPT or CPT as accepted, treat it as **Green**, not Yellow. The explicit mention of OPT/CPT overrides the generic work authorization language.

### Prompt Output Format

The LLM must return a JSON object with this exact shape:

```json
{
  "verdict": "green" | "yellow" | "red",
  "verdict_reasons": ["phrase 1 detected", "phrase 2 detected"],
  "position_title": "string",
  "company_name": "string",
  "job_functions": "string (2-3 sentences)",
  "preferred_skills": ["skill 1", "skill 2", "skill 3"],
  "deadline": "string or null"
}
```

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
    "verdict_reasons": ["..."],
    "position_title": "string",
    "company_name": "string",
    "job_functions": "string",
    "preferred_skills": ["..."],
    "deadline": "ISO date string or null",
    "notes": "string",
    "created_at": "ISO date string"
  }
]
```

---

## Visual Design Guidelines

- Clean, minimal aesthetic. Lots of white space.
- Accent colors tied to verdict only: use muted/pastel versions — `#d1fae5` (light green), `#fef9c3` (light yellow), `#fee2e2` (light red).
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

## Build Order

1. Scaffold React frontend + FastAPI backend
2. Build the two-panel Screener UI (static, no API yet)
3. Wire in Claude API call and display structured output in right panel
4. Add verdict badge and "Why this verdict?" modal
5. Build editable fields in right panel
6. Build Kanban board with dnd-kit (static cards first)
7. Wire "Add to Tracker" button — create card from screener data
8. Implement localStorage persistence (save, load, update, delete)
9. Add deadline countdown badge logic
10. Polish: transitions, loading states, empty states, mobile responsiveness
