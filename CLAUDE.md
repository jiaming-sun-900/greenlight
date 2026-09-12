# Greenlight - Project Guidelines

Visa eligibility screener and job application tracker for international students on F-1 visas. See `SPEC.md` for the full product spec. This file holds cross-cutting conventions to keep the codebase consistent.

## Project layout

- `frontend/` - React + Vite + Tailwind CSS v4. Dev server on port 5173 (falls back to 5174).
- `backend/` - FastAPI. Two routes: `POST /screen`, which calls the Claude API, and `GET /health`, a liveness check that returns `{"status": "ok"}`. Dev server on port 8000.
- The backend reads `ANTHROPIC_API_KEY` from `backend/.env` (gitignored, never commit it).
- CORS on the backend allows `http://localhost:5173` and `http://localhost:5174`.
- Backend tests live in `backend/tests/`. `pytest` runs the offline ones (schema validation, free). `pytest --eval` additionally runs the screening eval against the live Claude API, which costs money, so it is opt-in. When you change a screening rule, add the posting that motivated it to `backend/tests/postings.py` first.

## Typography scale

Use a fixed font size hierarchy across the whole frontend. The scale is defined as Tailwind text tokens in `frontend/src/index.css` (the `@theme` block). Do not use ad hoc `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl` sizes, and do not add a sixth tier. Pick the tier by the element's role:

| Token          | Size                  | Pairing                              | Use for |
|----------------|-----------------------|--------------------------------------|---------|
| `text-micro`   | 12px                  | `font-medium` for chips and badges; plain, plus `tabular-nums`, for counts | Deadline badge, view-toggle tracked count, panel char count, panel status ("Editable"), column counts |
| `text-label`   | 14px                  | `font-medium uppercase tracking-wide` for field labels; `font-medium` alone for small text buttons; plain for passive metadata | Field labels ("POSITION TITLE"), "+ Add skill", column hints, fine print, the screener's panel empty state, empty column text, card company name |
| `text-body`    | 16px                  | `font-normal` for prose, `font-medium` for buttons and links, `font-semibold` for a Kanban card title | Base body text, form inputs, buttons, view-toggle labels, interactive links ("Why this verdict?"), field values, list items, verdict badge, Kanban card title, the tracker's empty-board copy |
| `text-title`   | 20px                  | `font-semibold`                       | Panel headers ("Job description", "Analysis"), column headings, modal titles, the card modal's position-title field, empty-state headings; the brand wordmark adds `tracking-tight` |
| `text-display` | 28px → 36px (fluid)   | `font-semibold tracking-tight`        | The page title only ("Screen a job posting", "Application Tracker"). One per view |

Notes on the scale:

- `text-display` is a `clamp()`, not a fixed size: 28px on narrow viewports, ramping to 36px by roughly 1000px wide. That keeps the top of the scale loud on a desktop without swamping a 375px phone. It is reserved for the `h1` of a view; nothing else should use it.
- There is no separate tier for panel headers. Panel headers, column headings, modal titles, and empty-state headings are all the same rank and all use `text-title`, because that is how they actually read.
- A Kanban card title is the exception that proves it: at `text-body font-semibold` it outranks the company name under it without competing with the column heading above it. Weight, not size, does that work.
- Weight and tracking are part of the tier, not a per-instance choice. Use the pairing in the table. Color is a separate axis from size: see "Text color" below.
- Icon and glyph sizes are not type. Decorative glyphs use the `icon-lg` utility (backed by `--icon-lg` in `@theme`), never a `text-*` token borrowed as a font-size hack.

## Text color

Three text colors, and no ad hoc `text-gray-*` shades. Size encodes rank, color encodes how closely the reader is meant to parse the text, and the two are chosen independently.

| Token        | Value     | Use for |
|--------------|-----------|---------|
| `text-text`  | `#111111` | The `h1` of a view and the brand wordmark. Nothing else |
| `text-ink`   | `#1f2937` | Body copy and anything read word by word: field values, panel headers, column headings, card titles, list items, prose |
| `text-muted` | `#4b5563` | Passive metadata, scanned rather than read: field labels, char counts, column counts and hints, deadlines, placeholder text, empty-state copy, fine print |

`text-text` is also the root default set on the app shell in `App.jsx`, so an element that sets no color inherits it. That is a fallback, not a choice: anything carrying real text picks `ink` or `muted` explicitly.

`ink` and `muted` are defined in the `@theme` block of `frontend/src/index.css`. Both are deliberately darker than a typical gray ramp's 500/400: at these sizes the lighter shades read as disabled rather than secondary. Neither is pure black. An icon-only button that is `text-muted` at rest goes to `text-ink` on hover rather than to a third shade.

## Layout and responsiveness

- **One breakpoint carries the app: `md` (768px).** Below it the screener's two panels stack into a single column and the page scrolls normally. From `md` up they sit side by side and the app is pinned to the viewport (`md:h-dvh md:overflow-hidden` in `App.jsx`), with each panel scrolling internally. Keep the stacking breakpoint and the pinning breakpoint the same; splitting them produces a width where side-by-side panels are not height-managed.
- **Panels are fluid, text is not.** Containers stretch with the viewport (the screener caps at `1800px`, the tracker at `1600px`). Prose, form fields, and buttons inside a panel are held to a readable measure of roughly 70 characters via the `MEASURE` constant in `views/Screener.jsx`. Panel header rows are exempt: their title and metadata belong at the panel's edges.
- **The tracker board does not reflow.** Columns keep a fixed `w-72` and the row scrolls horizontally, which is what makes five stages usable on a phone. No scroll snapping: it fights an in-progress drag.
- Horizontal page padding steps `px-4` -> `sm:px-6` -> `xl:px-10` rather than sitting at a single value, so a 375px viewport does not lose 48px to gutters.

## Writing style

- No em dashes in anything the user sees: UI text, and messages written to the user. Use hyphens, colons, or reworded sentences instead. Em dashes inside code comments or internal prompt strings (things the user will not read) are fine.
- Keep chat responses, explanations, and code comments concise. Don't restate context back to the user.

## Verdict model

The screener returns a Red / Yellow / Green verdict plus tiered sub-reasons. Each entry in `verdict_reasons` is `{ tag, detected_phrase }`, where `tag` is one of the sub-reason strings documented in `SPEC.md` and `detected_phrase` is the quoted text (or `null` for `silent_no_signal`). The verdict tier and the sub-reason tags should always agree (green tags -> green verdict, etc.). `/screen` validates the model's output against the `ScreenResult` model in `backend/main.py` before returning it: an unknown tag, an empty reasons list, or a non-`YYYY-MM-DD` deadline is retried once and then fails with a 502. A tier mismatch is the exception. It logs a warning and the response still renders, because a mismatched tag is a prompt-quality problem rather than a reason to deny the user an otherwise usable verdict.
