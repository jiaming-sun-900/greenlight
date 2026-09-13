# Greenlight

Visa eligibility screener and job application tracker for F-1 international students.

Live: _not deployed yet - this line gets the `*.vercel.app` URL once the first deploy lands._

## Prerequisites

- Node.js 18+
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

Runs at http://localhost:5173

## Tests

```bash
cd backend
python -m pytest             # offline schema tests, free
python -m pytest --eval      # also runs the screening eval against the live Claude API (costs money)
```

## Deployment

Greenlight deploys to Vercel as a single project: the frontend builds to static files
and the FastAPI backend runs as a Python Serverless Function under `/api`.

- `api/index.py` mounts the app from `backend/main.py` at `/api`.
- `vercel.json` holds the build command, the output directory, and the `/api/*` rewrite.
- `requirements.txt` at the repository root pins the production Python dependencies.
  `backend/requirements.txt` adds the local-only ones on top.
- `ANTHROPIC_API_KEY` is set in the Vercel project settings. It is read server-side
  only and never reaches the browser bundle.

`POST /api/screen` is rate limited per IP (5 requests per minute, 30 per hour by
default) and rejects a job description longer than 20,000 characters.
