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
- **Deployment:** Vercel, both halves under one domain. The frontend builds to `frontend/dist` and
  is served as static files; the FastAPI app runs as Python Serverless Functions. `backend/asgi.py`
  mounts `backend/main.py` under `/api`, and `api/screen.py` and `api/health.py` are the entry points
  Vercel routes to by filename. The
  frontend calls the same-origin `/api/screen`, so there is no CORS allow-list to maintain and no
  hardcoded backend URL. `ANTHROPIC_API_KEY` is set in the Vercel project settings and stays
  server-side.
- **Persistence:** localStorage only (no database for MVP)

---

## Page Structure

The app has two main views. There is no app header: each view owns its own title row, and a
Screener/Tracker toggle rides along in it. Both views share one page container
(`frontend/src/components/ViewShell.jsx`), so the title and the toggle sit in exactly the same
place in each and nothing shifts when the user switches.

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

Below the badge, a small **"Why this verdict?"** link. Clicking it opens a modal that explains the
verdict rather than just naming it. The modal shows, in order:

1. The verdict badge and a one-line summary of what this tier means for the reader.
2. One block per detected signal: what was found, the exact phrase quoted from the posting, what it
   actually implies for an F-1 candidate, and the single next step worth taking.
3. For any signal where the honest answer is "ask the employer" (generic authorization only, silent,
   vague conditional, contradictory, `optcpt_future_unstated`, `no_future_sponsorship_only`), a
   copyable recruiter question. It separates the present-tense fact from the future need and pins
   the ask to the specific requisition, which is what produces a usable answer instead of "the
   company has sponsored before".

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

The model must commit to `role_term` before choosing any tag. `internship_or_temporary` is only for
a role that clearly ends inside the OPT window: an internship, co-op, summer or seasonal role, a
fellowship with a fixed end, or a contract with a stated end date. Everything else, including
unspecified, is `ongoing`. Deciding this first matters because "Full-time" usually appears in the
header of a posting, far from the work-authorization section at the bottom.

Tags are chosen by applying these in order and stopping at the first that fits:

1. Two explicit statements in the posting directly oppose each other, and neither is merely a
   narrower scope of the other -> yellow (`contradictory`), with one entry per opposing phrase.
   This is applied before every other step, including the red ones, and the verdict is yellow
   however strict one of the two statements sounds: a posting that both promises sponsorship and
   forbids it has not answered the question, so the candidate needs to ask rather than be told no.
   It does not apply when a job-board tag, benefits blurb, or boilerplate line is corrected or
   narrowed by a specific statement in the job body (the specific statement wins, carry on), nor
   when a generic work-authorization phrase merely sits alongside an explicit OPT/CPT mention
   (that is `optcpt_overrides_generic`).
2. Bars the candidate outright, now and in future -> red (`citizens_only`,
   `no_sponsorship_now_or_future`, `explicit_no_visa`).
3. Rules out sponsorship in present-tense or role-scoped terms, but does not bar someone holding
   their own work authorization -> red (`no_future_sponsorship_only`).
4. Explicitly commits to sponsoring a work visa -> green (`explicit_h1b_sponsor`).
5. Explicitly accepts OPT/CPT/F-1: internship or temporary role, or later sponsorship also addressed
   positively -> green (`explicit_optcpt`, plus `optcpt_overrides_generic` where generic
   work-authorization language appears too). Full-time with the future unstated -> yellow
   (`optcpt_future_unstated`), even when generic work-authorization language is present;
   `optcpt_overrides_generic` belongs to the green branch only.
6. Otherwise, the remaining yellow tags.

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
- `contradictory` - Posting contains two explicit, directly opposing statements in different sections (e.g. a benefits section promising H-1B sponsorship against a requirement that candidates never need sponsorship). A job-board filter tag narrowed by a specific statement in the body is *not* this: the specific statement wins. Outranks every other tag, including the red ones.
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
  "role_term": "internship_or_temporary" | "ongoing",
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
`YYYY-MM-DD`. The deadline check is a real calendar check, not just a shape check: `2026-13-45` and
`2026-02-31` match the pattern but are rejected, because a date picker cannot render them and
`new Date()` would silently roll them over into a different, plausible-looking day. An empty-string
deadline is normalized to `null` rather than rejected. A validation failure follows the same path as
unparseable JSON: retry the call once, then return a 502.

A reply wrapped in a code fence, or prefixed with a conversational preamble, is unwrapped before
parsing rather than being spent as a retry. A reply cut off at `max_tokens` is retried once with a
larger ceiling. A refusal is not retried at all: it returns a 422, because the same posting refused
once will be refused again.

One rule is enforced in code rather than left to the prompt. If the verdict is green, `role_term` is
`ongoing`, and the only green tags present are `explicit_optcpt` or `optcpt_overrides_generic`, the
backend rewrites the result to yellow with `optcpt_future_unstated`, preserving the detected phrase,
and logs the demotion. Green off OPT/CPT acceptance alone is only correct for a role that ends
inside the OPT window. The model applies this reliably on short postings and unreliably on realistic
ones, where the "Full-time" marker is far from the visa language, so the rule lives where it cannot
be talked out of. An explicit `explicit_h1b_sponsor` tag leaves green untouched.

`POST /screen` guards the request as well as the response. A blank body is a 400; a body over
20,000 characters is a 400 with a plain-English message (not FastAPI's default 422, whose `detail`
is a list of objects that the frontend would render as `[object Object]`). Calls are rate limited
per IP, 10 per minute and 60 per hour by default, overridable with `SCREEN_RATE_LIMIT_PER_MINUTE`
and `SCREEN_RATE_LIMIT_PER_HOUR` and disabled by setting either to 0. Over the limit is a 429 with
`Retry-After`. The client address is read from the headers the platform sets rather than from the
leftmost `x-forwarded-for` entry, which the caller controls and could rotate to buy itself unlimited
quota. The counter is per warm instance and the dict is capped, so it is a real limit rather than a
complete one; the hard ceiling on spend is the limit set in the Anthropic console.

Upstream failures keep their own status codes: a timeout is a 504, an upstream rate limit is a 429,
anything else from the Claude API is a 502. No `detail` returned to the client carries upstream
exception text or a pydantic error dump; those go to the server log.

The tier cross-check is deliberately softer. If the sub-reason tags do not match the tier of the
top-level verdict, the backend logs a warning naming the verdict, the mismatched tags, and the full
reasons list, then returns the response unchanged. A mismatch means the prompt needs work, not that
the analysis is worthless, so the user still sees their verdict instead of an error.

---

## Application Priority

The verdict says whether the door is open. It does not say where a posting ranks against the
other thirty in the tracker, and most postings land on yellow, because most postings genuinely say
nothing about sponsorship. Priority is the second axis: it separates "the employer named OPT/CPT and
left one question open" from "this posting is silent", which one badge colour cannot do.

| Priority | Means | Applies to |
|----------|-------|------------|
| **A** Apply | Both questions answered. Spend an application here. | any green verdict |
| **B** Ask first | A real signal, and one question would resolve it. | yellow with `optcpt_future_unstated`, `vague_conditional`, or `contradictory` |
| **C** Low signal | Nothing to go on, or a role with a known end date. | yellow with only `generic_authorization_only` or `silent_no_signal`; red with only `no_future_sponsorship_only` |
| **D** Skip | Excluded outright. | every other red |

Two deliberate consequences. A posting demoted by the ongoing-role rule is a **B**, not an A: it is
still worth an application, but the future question is open, which is exactly what the recruiter
question in the verdict modal is for. And a red `no_future_sponsorship_only` is a **C** rather than a
D, because a role you can hold until OPT runs out is not a closed door.

Priority is derived from the verdict and tags, never asked of the model: it is a deterministic
reading of a decision already made. The backend computes it and sends it on `priority`.
`frontend/src/lib/priority.js` carries a copy for cards saved before the field existed; the two
mappings must be changed together.

Priority does not change the verdict, the badge, or which column a card sits in. It sorts cards
within a column, and the tracker offers a Priority / Newest toggle.

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
    "priority": "A" | "B" | "C" | "D",
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

- **No CI.** `backend/tests/` covers schema validation offline and the screening rules against the
  live API (`pytest --eval`), but nothing runs either automatically. ESLint is configured
  (`npm run lint`) and equally unenforced. The frontend has no tests at all.
- **npm audit vulnerabilities.** `npm audit` reports 9 findings (1 low, 2 moderate, 6 high), all in
  transitive dev-tooling dependencies (babel, browserslist, postcss, and similar). None are in
  runtime dependencies shipped to the browser. All are fixable via `npm audit fix`.
- **No frontend tests.** The behaviour of `useCards`, `useScreening`, `useDialog`, and the date
  helpers is covered only by manual checks. The backend suite has no counterpart here.

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
