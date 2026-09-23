# Greenlight

Visa eligibility screener and job application tracker for F-1 international students.

Live: https://greenlight-f1.vercel.app

Paste a job posting, get a Red / Yellow / Green verdict on whether the employer will
work with your status, and track what you have applied to. Light and dark themes,
following your system by default.

- `SPEC.md` is the product spec: views, screening rules, verdict tags, priority.
- `CLAUDE.md` holds the binding conventions (typography scale, colour tokens, layout,
  state ownership). Read it before your first change; a PR that ignores it will be
  asked to change.

## Prerequisites

- Node.js 20.19+ or 22.12+ (required by the pinned Vite 8)
- Python 3.11+

You do not need a Vercel account to run Greenlight locally.

## Local development

Run both halves side by side. The Vite dev server proxies `/api` to the backend, so
the frontend talks to `http://localhost:8000` without any extra configuration.

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
uvicorn main:app --reload
```

Runs at http://localhost:8000. Health check: http://localhost:8000/health

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at http://localhost:5173 (5174 if that port is taken).

**Both halves have to be running.** With only the frontend up, every Analyze fails at
the Vite proxy. That is what the app's own "Check that the backend is running" hint is for.

### Other commands

```bash
cd frontend
npm run lint       # ESLint, must be clean
npm run build      # production build into frontend/dist
npm run preview    # serve that build, without the dev proxy
```

## Source layout

```
frontend/src/
  views/        Screener and Tracker, one per tab
  components/   ViewShell owns the page container both views share
  hooks/        useCards (localStorage), useScreening (the analysis session),
                useDialog (modal behaviour), useTheme (light/dark)
  lib/          dates.js, priority.js
backend/
  main.py       the app: POST /screen, GET /health, the prompt, validation, rate limiting
  asgi.py       mounts main.py under /api for production
  tests/        offline suite plus the opt-in live eval
api/            Vercel function entry points (thin shims over backend/asgi.py)
```

Tracker data lives only in your browser's localStorage under `greenlight_cards`.
There is no account and no server-side copy, so clearing site data clears your board.

## Environment variables

Only `ANTHROPIC_API_KEY` is required. `backend/.env.example` documents the optional
ones: `ALLOWED_ORIGINS` (needed only to run the frontend cross-origin),
`SCREEN_RATE_LIMIT_PER_MINUTE`, `SCREEN_RATE_LIMIT_PER_HOUR`, and
`TRUST_PROXY_HEADERS` (only if you deploy behind your own proxy; it is automatic
on Vercel). The frontend also
accepts `VITE_SCREEN_ENDPOINT` to point at a backend somewhere other than `/api/screen`.

## Tests

```bash
cd backend
pytest             # 67 offline tests: schema, priority table, /screen route,
                   # retry loop, status codes, rate limiter. No network, no cost,
                   # no API key needed.
pytest --eval      # additionally screens the 14-posting corpus against the live
                   # Claude API. Needs ANTHROPIC_API_KEY and costs real money.
```

When you change a screening rule, add the posting that motivated it to
`backend/tests/postings.py` first.

## Deployment

Greenlight deploys to Vercel as a single project: the frontend builds to static files
and the FastAPI backend runs as a Python Serverless Function under `/api`.

- `backend/asgi.py` mounts the app from `backend/main.py` at `/api`.
- `api/screen.py` and `api/health.py` are the function entry points. Vercel routes by
  filename, so they land on `/api/screen` and `/api/health` with no rewrite involved.
- `vercel.json` holds the build command, the output directory, and the function config.
- `api/requirements.txt` pins the production Python dependencies;
  `backend/requirements.txt` adds the local-only ones on top.
- `ANTHROPIC_API_KEY` is set in the Vercel project settings. It is read server-side
  only and never reaches the browser bundle.

`POST /api/screen` is rate limited per IP (10 requests per minute, 60 per hour by
default) and rejects a job description longer than 20,000 characters. Production
health check: https://greenlight-f1.vercel.app/api/health
