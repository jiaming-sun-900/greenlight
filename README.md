# Greenlight

Visa eligibility screener and job application tracker for F-1 international students.

Live: https://greenlight-f1.vercel.app

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
pytest             # offline schema tests, free
pytest --eval      # also runs the screening eval against the live Claude API (costs money)
```

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
default) and rejects a job description longer than 20,000 characters.
