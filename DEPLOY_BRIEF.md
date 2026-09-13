# Greenlight Deployment Brief — Vercel

Goal: take Greenlight from localhost-only to a public URL anyone can open.

Context: shipping is the current bottleneck — the app has been in development for
months and has never been reachable by a real user. September is the start of the
internship/new-grad application season, which makes this the right window.

---

## Current state (verified)

- **Frontend:** Vite 8 + React 19 + Tailwind 4 + dnd-kit, in `frontend/`
- **Backend:** FastAPI with a single business endpoint `POST /screen` (plus `GET /health`),
  calling the Claude API (`claude-haiku-4-5-20251001`), in `backend/main.py`
- **Data:** localStorage only. No database, no accounts, no login.
- **Blockers:**
  1. `frontend/src/views/Screener.jsx:11` — `const SCREEN_ENDPOINT = "http://localhost:8000/screen";`
  2. `backend/main.py:25` — `allow_origins=["http://localhost:5173", "http://localhost:5174"]`

## Architecture decision: deploy both halves to Vercel

**No Supabase.** Greenlight has no persistence requirement — everything lives in
browser localStorage. (A previous project used Supabase because it genuinely needed
Postgres; this one does not. Do not add a database.)

**Run the backend as a Vercel Python Serverless Function** rather than on
Railway/Render/Fly, because:

- It is a single stateless endpoint that only proxies the Claude API — a natural fit
  for serverless.
- One platform, one deploy, one set of environment variables, one domain.
- Same-origin deployment **removes the CORS problem entirely**, so there is no
  allow-list to maintain.

Tradeoff: cold starts add roughly 1–2 seconds to the first request. Acceptable for a
"paste a job description, wait for an LLM verdict" interaction that already takes a
few seconds.

## Changes required

### 1. Move the backend to a Vercel Function

- Relocate the FastAPI app under `api/` (Vercel's Python convention), or keep FastAPI
  and route `/api/*` to it via `vercel.json`.
- Drop `pytest` from production dependencies in `requirements.txt`.
- Once same-origin, the CORS middleware can be removed. If it stays for now, read the
  allow-list from an environment variable — **do not hardcode domains**.

### 2. Make the frontend endpoint configurable

```js
const SCREEN_ENDPOINT = import.meta.env.VITE_SCREEN_ENDPOINT ?? "/api/screen";
```

Production uses the same-origin `/api/screen`.

**As built, local development uses a Vite dev proxy rather than `.env.local`.** The
original plan here was to point `.env.local` at `http://localhost:8000/screen`, but
`.env.local` is gitignored, so a fresh clone would fall back to `/api/screen` against
the Vite dev server and get a 404 with no clue why. Instead `frontend/vite.config.js`
proxies `/api` to `http://localhost:8000` with the prefix stripped:

```js
server: {
  proxy: {
    '/api': {
      target: 'http://localhost:8000',
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
  },
}
```

That gives dev and production the same URL shape with zero configuration, and makes
both environments same-origin, which removes CORS from local development too.
`VITE_SCREEN_ENDPOINT` stays supported as an escape hatch for pointing the frontend
at a backend running somewhere else.

### 3. Environment variables

- Set `ANTHROPIC_API_KEY` in the Vercel project settings. It is server-side today —
  keep it that way and never expose it to the client.
- Update `backend/.env.example`.

### 4. Abuse and cost protection — required before going public

This is the one thing that genuinely differs between running locally and being
online. `/screen` is an **unauthenticated public endpoint, and every call spends your
own Claude API credit**. Without protection, anyone — or any crawler — can run up
your bill.

Minimum viable protection:

- Per-IP rate limiting (Vercel edge middleware, or a simple counter in the handler).
- A request body size cap on the job-description text, so nobody can paste a novel.
- A spend limit and billing alert configured in the Anthropic console.

### 5. Documentation

- Update `SPEC.md`, which currently reads "Deployment: none configured yet".
- Update `README.md` with the live URL and local development instructions.

## Acceptance criteria

- [ ] The live URL opens in a private window and completes one full
      paste-job-description → verdict round trip.
- [ ] Tracker drag-and-drop and localStorage persistence work in production.
- [ ] The app is usable in a mobile browser — job seekers browse postings on phones.
- [ ] No API key appears anywhere in the frontend bundle (check `frontend/dist`).
- [ ] Rate limiting actually triggers on rapid repeated requests.

## Explicitly out of scope

- Custom domain — ship on `*.vercel.app` first.
- User accounts or cloud sync — localStorage is sufficient; do not expand scope.
- Any database.

## Repository conventions

All content in this repository is in English: code, identifiers, comments, commit
messages, documentation, and UI copy. Greenlight's users are international students,
and the repository is public.
