# Greenlight - Project Guidelines

Visa eligibility screener and job application tracker for international students on F-1 visas. See `SPEC.md` for the full product spec. This file holds cross-cutting conventions to keep the codebase consistent.

## Project layout

- `frontend/` - React + Vite + Tailwind CSS v4. Dev server on port 5173 (falls back to 5174).
- `backend/` - FastAPI. Single `POST /screen` route that calls the Claude API. Dev server on port 8000.
- The backend reads `ANTHROPIC_API_KEY` from `backend/.env` (gitignored, never commit it).
- CORS on the backend allows `http://localhost:5173` and `http://localhost:5174`.

## Typography scale

Use a fixed font size hierarchy across the whole frontend. The scale is defined as Tailwind text tokens in `frontend/src/index.css` (the `@theme` block). Do not use ad hoc `text-xs` / `text-sm` / `text-base` / `text-lg` / `text-xl` sizes. Pick the tier by the element's role:

| Token        | Size | Use for |
|--------------|------|---------|
| `text-label` | 14px | Small uppercase labels and passive metadata: field labels ("POSITION TITLE", "COMPANY NAME"), character counts, status text, fine print |
| `text-body`  | 16px | Base body text, form inputs, buttons, nav links, interactive links ("Why this verdict?"), field values, list items, verdict badge |
| `text-title` | 20px | Card titles, section labels, secondary headings, the brand logo, modal titles |
| `text-panel` | 24px | Panel headers ("Job description", "Analysis") |
| `text-page`  | 28px | The main page title ("Screen a job posting") |

When adding new UI, choose the closest tier by role rather than introducing a new size. Keep weight and color decisions separate from size (use `font-*` and `text-gray-*` utilities as needed).

## Writing style

- No em dashes in anything the user sees: UI text, and messages written to the user. Use hyphens, colons, or reworded sentences instead. Em dashes inside code comments or internal prompt strings (things the user will not read) are fine.

## Verdict model

The screener returns a Red / Yellow / Green verdict plus tiered sub-reasons. Each entry in `verdict_reasons` is `{ tag, detected_phrase }`, where `tag` is one of the sub-reason strings documented in `SPEC.md` and `detected_phrase` is the quoted text (or `null` for `silent_no_signal`). The verdict tier and the sub-reason tags must always agree (green tags -> green verdict, etc.).
