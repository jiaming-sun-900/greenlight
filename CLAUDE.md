# Greenlight - Project Guidelines

Visa eligibility screener and job application tracker for international students on F-1 visas. See `SPEC.md` for the full product spec. This file holds cross-cutting conventions to keep the codebase consistent.

## Project layout

- `frontend/` - React + Vite + Tailwind CSS v4. Dev server on port 5173 (falls back to 5174).
- `backend/` - FastAPI. Two routes: `POST /screen`, which calls the Claude API, and `GET /health`, a liveness check that returns `{"status": "ok"}`. Dev server on port 8000.
- `api/screen.py` and `api/health.py` are the Vercel Serverless Function entry points: 12-line shims that put `backend/` on the import path and import `backend/asgi.py`, which mounts the app from `backend/main.py` under `/api`. Vercel routes by filename, so they land on `/api/screen` and `/api/health`. `vercel.json` holds the build command and function config; `api/requirements.txt` pins the production deps and `backend/requirements.txt` adds the local-only ones on top.
- The backend reads `ANTHROPIC_API_KEY` from `backend/.env` (gitignored, never commit it).
- **No CORS origin is hardcoded, and by default no CORS middleware is installed at all.** The frontend and API are same-origin in both environments: Vercel serves them under one domain, and the Vite dev server proxies `/api` to the local backend with the prefix stripped (see `frontend/vite.config.js`). `ALLOWED_ORIGINS` is a comma-separated escape hatch for running the frontend cross-origin; the middleware is added only when it is set.
- `POST /screen` is rate limited per IP (10/min, 60/hr by default, via `SCREEN_RATE_LIMIT_PER_MINUTE` / `SCREEN_RATE_LIMIT_PER_HOUR`, set one to 0 to disable that window; both must be 0 to turn the limiter off) and rejects a job description over `MAX_JOB_DESCRIPTION_CHARS` (20,000) with a 400. The frontend mirrors that cap in `hooks/useScreening.js` so an over-long paste is caught before a round trip. A body whose `Content-Length` exceeds `MAX_REQUEST_BYTES` is refused with a 413 by middleware, before anything reads it: a field-level `max_length` only fires once Starlette has buffered the whole body and `json.loads` has built it in memory.
- **Identical postings are screened once.** `/screen` keeps a content-addressed cache of validated results, keyed on the normalised posting plus the model plus a fingerprint of `SYSTEM_PROMPT`, so a prompt change invalidates every entry. Popular listings get pasted by a lot of people, and a hit costs nothing and returns in milliseconds instead of seconds. It is checked after the rate limit, deliberately: a hit still spends the caller's quota, or one posting could be replayed for free forever. Per warm instance and bounded, like the rate limiter.
- **Every billed call logs its token usage.** `logging.basicConfig` runs at import (`LOG_LEVEL`, default `INFO`) because without it the module logger inherits the root WARNING default and every `logger.info` is dropped, including that usage line. It is the only way to know what a screening costs. Note `cache_read` in that line will stay 0: prompt caching needs a prefix of at least 4096 tokens on Haiku 4.5 and `SYSTEM_PROMPT` is about 2500, so a `cache_control` breakpoint would be ignored in silence rather than rejected. Re-check the threshold for the model in use before adding one.
- **Forwarding headers are only trusted when something is known to rewrite them.** `TRUST_PROXY_HEADERS` is on automatically on Vercel (the platform sets `VERCEL`) and otherwise has to be set by the operator. Without it the rate limiter keys on the socket peer, because a directly exposed uvicorn will repeat whatever `x-real-ip` the caller invented and every request lands in a bucket of its own.
- Backend tests live in `backend/tests/`. `pytest` runs the 74 offline ones for free: `test_validation.py` covers the `ScreenResult` schema and the priority table, `test_screen_route.py` covers the `/screen` route, the retry loop, the status codes and the rate limiter with `_call_model` stubbed. `pytest --eval` additionally runs the screening eval against the live Claude API, which costs money, so it is opt-in. When you change a screening rule, add the posting that motivated it to `backend/tests/postings.py` first.

## Typography scale

Use a fixed font size hierarchy across the whole frontend. The scale is defined as Tailwind text tokens in `frontend/src/index.css` (the `@theme` block). Do not use ad hoc `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl` sizes, and do not add a sixth tier. Pick the tier by the element's role:

| Token          | Size                  | Pairing                              | Use for |
|----------------|-----------------------|--------------------------------------|---------|
| `text-micro`   | 12px                  | `font-medium` for chips and badges; plain, plus `tabular-nums`, for counts | Deadline badge, view-toggle tracked count, panel char count, panel status ("Analyzing…" / "Editable" / "Preview"), column counts |
| `text-label`   | 14px                  | `font-medium uppercase tracking-wide` for field labels; `font-medium` alone for small text buttons; plain for passive metadata | Field labels ("POSITION TITLE"), "+ Add skill", the tracker's Sort label and its two buttons, column hints, fine print, the screener's panel empty state, empty column text, card company name |
| `text-body`    | 16px                  | `font-normal` for prose, `font-medium` for buttons and links, `font-semibold` for a Kanban card title | Base body text, form inputs, buttons, view-toggle labels, interactive links ("Why this verdict?"), field values, list items, verdict badge, Kanban card title, the tracker's empty-board copy |
| `text-title`   | 20px                  | `font-semibold`                       | Panel headers ("Job description", "Analysis"), column headings, modal titles, the card modal's position-title field, empty-state headings; the brand wordmark adds `tracking-tight` |
| `text-display` | 28px → 36px (fluid)   | `font-semibold tracking-tight`        | The page title only ("Screen a job posting", "Application Tracker"). One per view |

Notes on the scale:

- `text-display` is a `clamp()`, not a fixed size: 28px on narrow viewports, ramping to 36px by roughly 1000px wide. That keeps the top of the scale loud on a desktop without swamping a 375px phone. It is reserved for the `h1` of a view; nothing else should use it.
- There is no separate tier for panel headers. Panel headers, column headings, modal titles, and empty-state headings are all the same rank and all use `text-title`, because that is how they actually read.
- A Kanban card title is the exception that proves it: at `text-body font-semibold` it outranks the company name under it without competing with the column heading above it. Weight, not size, does that work.
- Weight and tracking are part of the tier, not a per-instance choice. Use the pairing in the table. Color is a separate axis from size: see "Text color" below.
- Icon and glyph sizes are not type. Decorative glyphs use the `icon-lg` utility (backed by `--icon-lg` in `@theme`), never a `text-*` token borrowed as a font-size hack.
- Solid accent controls are built as tinted glass in four layers: the body gradient, a specular sheen across the top third, a bright inner rim, and a coloured bloom on the page beneath. All of the luminosity lives in the last three, which is what lets the fill stay dark enough for its label while the button still reads as bright. Hover raises the whole surface (`brightness`) as well as widening the bloom, because on a light ground the shadow work alone is close to invisible; press sinks it, dims it, and collapses the bloom into a tight halo on a much shorter transition, so a click has a bottom to it.
- Button size is a utility, not a per-instance choice. There are two shapes, both defined in `index.css`: `btn-pill` for a hero call to action (Analyze, the empty board's "Screen a job posting") and `btn-block` for an action belonging to a panel or a modal footer (Add to Tracker, both modal Close buttons, Delete). Both carry `text-body font-medium` and the same height, so a footer does not change size when its buttons swap. Pair either with `btn-accent` for the accent fill, whose gradient is deliberately a step darker than the brand green: white on `#059669` is 3.77:1, under the 4.5:1 AA bar, and that green carries the label of every primary action.
- Focus is visible on everything, in one of two ways. Buttons, links, and anything else that is not a form control take `focus-ring`. Form controls keep the inline treatment in `JobFields.jsx` (`focus:border-accent` plus a soft accent ring), because a field that already has a border should thicken it rather than grow a second ring outside it. Do not put both on one element. The job-description textarea is the exception that needs neither: it is borderless and fills its panel, so the ring sits on its wrapper via `focus-within`.

## Surfaces and dark mode

**No component in this app knows what theme it is in.** There is not one `dark:` utility anywhere in `frontend/src`, and there must not be. Every colour goes through a semantic token defined in the `@theme` block of `frontend/src/index.css` and redefined once, wholesale, under `.dark`. If a surface is named for what it is, it flips for free; if you reach for `bg-white` or a `gray-N` shade, you have just written a component that only works in daylight.

| Token | Use for |
|-------|---------|
| `bg-bg` | the page behind everything |
| `bg-surface` | panels, tracker columns, cards, modals |
| `bg-sunken` | a box inset into a surface (a reason item, a far-off deadline chip) |
| `border-border` | the edge of a surface |
| `border-border-soft` | a divider inside a surface |
| `bg-hover` | the fill a quiet control takes on hover |
| `bg-selected` | a control that is chosen, not merely pointed at |
| `bg-overlay` | the modal backdrop |

Status colour is a **pair**, never a loose fill and a loose foreground: `good`, `warn`, `bad`, `urgent`, and `neutral` each have a `-bg` and the one `-fg` guaranteed readable on it in both themes. Never mix a fill from one pair with a foreground from another. `dot-*` and `edge-*` carry the verdict dot and the 4px rule down a card's left edge; `danger` is destructive text and flips with the theme, while `danger-fill` is the solid confirm button and does not, since white has to stay readable on it either way.

Both palettes are anchored on the two colours of jiaming-sun-900.github.io: ivory `#f0eee6` and ink `#1f1e1d`. Light is ivory ground with ink text, dark is the same pair swapped. There is no pure white and no pure black anywhere, and the greys lean warm in both: a cool blue-grey dark beside a warm ivory light reads as two different products.

The theme itself is a class on `<html>`, set by an inline script in `index.html` before first paint (React mounts too late to avoid a white flash) and kept in sync afterwards by `hooks/useTheme.js`, which owns the `greenlight_theme` key. Switching cross-fades over 500ms rather than snapping. The transition is enabled by a `theme-transition` class that `useTheme` puts on `<html>` for the length of the fade and then removes, so the app does not pay for those transitions on every hover for the rest of the session, and it is never present on first paint. Whether to fade is decided by comparing the DOM's current class against the target, not by a "have I run before" ref: a ref survives StrictMode's double-invoke and would fade the app in from the theme it is already in. The same trap applies to any cleanup with a side effect, which is why the tracker's just-added ring is cleared in the tab-change handler in `App.jsx` rather than in an unmount cleanup. Three states: `light`, `dark`, and `system`, which is the default and stays live, following the OS if it flips at sunset. `ThemeToggle.jsx` is a plain two-way switch that pins the choice; the glyph shows the theme you will get, not the one you are in. `color-scheme` is set alongside the class so the browser's own scrollbars, form controls and date picker follow.

**Both themes must pass WCAG AA on every visible text node.** That is checkable, not a matter of taste: resolve each element's painted background (compositing translucent layers and any positioned overlay behind it) and require 4.5:1, or 3:1 for text at 24px or at 18.66px bold.

## Text color

Three text colors, and no ad hoc `text-gray-*` shades. All three are tokens and all three flip with the theme. Size encodes rank, color encodes how closely the reader is meant to parse the text, and the two are chosen independently.

| Token        | Value     | Use for |
|--------------|-----------|---------|
| `text-text`  | `#111111` | The `h1` of a view and the brand wordmark. Nothing else |
| `text-ink`   | `#1f2937` | Body copy and anything read word by word: field values, panel headers, column headings, card titles, list items, prose |
| `text-muted` | `#4b5563` | Passive metadata, scanned rather than read: field labels, char counts, column counts and hints, deadlines, placeholder text, empty-state copy, fine print |

`text-text` is also the root default set on the app shell in `App.jsx`, so an element that sets no color inherits it. That is a fallback, not a choice: anything carrying real text picks `ink` or `muted` explicitly.

`ink` and `muted` are defined in the `@theme` block of `frontend/src/index.css`, with dark-theme values under `.dark`. In light mode both are deliberately darker than a typical gray ramp's 500/400: at these sizes the lighter shades read as disabled rather than secondary. In dark mode they are correspondingly lighter, and the greys lean blue rather than neutral, which reads as a deliberate surface rather than as a screen that failed to light up. Nothing in either theme is pure black or pure white. An icon-only button that is `text-muted` at rest goes to `text-ink` on hover rather than to a third shade.

## State ownership

**The two views are swapped by a conditional render in `App.jsx`, so each one unmounts completely every time the user switches.** Anything that must survive that lives in `App`, not in the view. Today that is the card store (`useCards`), the screener's whole working session (`useScreening`: the pasted posting, the draft, the in-flight request, the error), the board's sort order, the just-added highlight id, and the theme. Putting new screener or tracker state inside the view is the natural thing to do and it silently re-breaks the bug this exists to fix: a user who pasted a posting, analyzed it, corrected it by hand, and then looked at the tracker came back to an empty panel.

The request lifecycle is a matched pair across the two halves and has to be changed as one: the browser aborts an analysis after 60s (`REQUEST_TIMEOUT_MS` in `useScreening.js`), and the backend allows at most two 20s SDK attempts inside Vercel's 60s `maxDuration` (`vercel.json`). The in-flight request is aborted when a new Analyze starts and when the user presses Cancel, because an orphaned call still bills a Claude request nobody will read. It is not aborted on a view switch: the session lives in `App` precisely so that switching views does not disturb it.

## Layout and responsiveness

- **Both views share one page container.** `components/ViewShell.jsx` owns the max-width, the gutter ladder, the sticky title row, the `h1`, the subtitle, and the slot the view toggle sits in. Neither view sets those itself. This exists because they used to: the tracker was missing the `xl:px-10` step and capped 200px narrower than the screener, so toggling views slid the title and the toggle sideways by up to 84px. Anything that would move when the user switches views belongs in `ViewShell`, not in a view.
- The view toggle is aligned to the *top* of the title row, not centred on it, so its position does not depend on how many lines the subtitle wraps to. The tracker's sort control sits above the board for the same reason: inside the title row it made that row taller than the screener's and dropped the toggle 14px on every switch.
- **One breakpoint carries the app: `md` (768px).** Below it the screener's two panels stack into a single column and the page scrolls normally. From `md` up they sit side by side and the app is pinned to the viewport (`md:h-dvh md:overflow-hidden` in `App.jsx`), with each panel scrolling internally. Keep the stacking breakpoint and the pinning breakpoint the same; splitting them produces a width where side-by-side panels are not height-managed. This applies to the tracker too: it pins from `md` up and scrolls as a page below, exactly as the screener does.
- **Panels are fluid, text is not.** The container stretches with the viewport and caps at `1800px` for both views. Prose, form fields, and buttons inside a panel are held to a readable measure of roughly 70 characters via the `MEASURE` constant in `views/Screener.jsx`. Panel header rows are exempt: their title and metadata belong at the panel's edges.
- **The tracker board is elastic with a floor, not fixed.** Columns are `min-w-56 flex-1`: given room they share the row evenly so the board always reaches both edges of the container, and below the floor the row overflows and scrolls horizontally, which is what keeps five stages usable on a phone. The floor is 224px because that is the width at which all five columns still fit a 13 inch laptop; a fixed `w-72` made the board scroll by a few dozen pixels on every laptop and left dead space on every monitor. No scroll snapping: it fights an in-progress drag. The drag overlay copies the dragged card's measured width rather than assuming one.
- Column header hints reserve two lines whether or not they need them. At the narrow end of the range only "Rejected, withdrawn, or expired" wraps, which started that column's cards lower than the rest.
- Horizontal page padding steps `px-4` -> `sm:px-6` -> `xl:px-10` rather than sitting at a single value, so a 375px viewport does not lose 48px to gutters.

## Disclaimers are load bearing

Greenlight reads a posting's wording and tells a student what it implies about their
visa status. They can act on that and be wrong in either direction, and the cost is a
wasted application or a missed one. So the disclaimer is a feature, not fine print:
a short form in `ViewShell` renders under the content on every view, and the long
form is the last thing in the "Why this verdict?" modal. Do not move either behind a
link, a tooltip, or a first-run dismissal, and do not let a layout change drop them.
See `SPEC.md` > What Greenlight Does Not Claim.

## Writing style

- All content in this repository is in English: code, identifiers, comments, commit messages, documentation, and UI copy. The repository is public and Greenlight's users are international students.
- No em dashes in anything the user sees: UI text, and messages written to the user. Use hyphens, colons, or reworded sentences instead. Em dashes inside code comments or internal prompt strings (things the user will not read) are fine.
- Keep chat responses, explanations, and code comments concise. Don't restate context back to the user.

## Verdict model

The screener returns a Red / Yellow / Green verdict plus tiered sub-reasons, and an A/B/C/D application priority derived from them (see `SPEC.md` > Application Priority). Priority is deterministic and is never asked of the model. It is defined in `backend/main.py` and mirrored in `frontend/src/lib/priority.js` for cards saved before the field existed; change both together.

Two rules live in code rather than in the prompt. `role_term` (`internship_or_temporary` or `ongoing`) is asked of the model, and `_demote_ongoing_optcpt_only` rewrites a green verdict to yellow/`optcpt_future_unstated` whenever the role is `ongoing` and the only green tags are `explicit_optcpt` or `optcpt_overrides_generic`, because green off OPT/CPT acceptance alone is only correct for a role that ends inside the OPT window. The phrase it carries over is chosen by tag, not by list order: quoting a generic work-authorization sentence as evidence that the employer accepts OPT/CPT is exactly backwards. And `contradictory` outranks every other tag including the red ones, so a posting that both promises sponsorship and forbids it comes back yellow, never red. Each entry in `verdict_reasons` is `{ tag, detected_phrase }`, where `tag` is one of the sub-reason strings documented in `SPEC.md` and `detected_phrase` is the quoted text (or `null` for `silent_no_signal`). The verdict tier and the sub-reason tags should always agree (green tags -> green verdict, etc.). `/screen` validates the model's output against the `ScreenResult` model in `backend/main.py` before returning it: an unknown tag, an empty reasons list, or a deadline that is not a real `YYYY-MM-DD` calendar date is retried once and then fails with a 502. The deadline check validates the date, not just its shape: `2026-13-45` matches the pattern, and `new Date()` would roll it over into a confident, wrong "Feb 14, 2027" on a card. A truncated reply is retried once with a larger `max_tokens`; a refusal is a 422 and is not retried; an upstream timeout is a 504 and an upstream rate limit is a 429. No `detail` sent to the client carries upstream exception text, because the frontend renders it verbatim and `/screen` is unauthenticated. A tier mismatch is the exception. It logs a warning and the response still renders, because a mismatched tag is a prompt-quality problem rather than a reason to deny the user an otherwise usable verdict.
