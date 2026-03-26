# Greenlight

Visa eligibility screener and job application tracker for F-1 international students.

## Prerequisites

- Node.js 18+
- Python 3.11+

## Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs at http://localhost:5173

## Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
uvicorn main:app --reload
```

Runs at http://localhost:8000

Health check: http://localhost:8000/health
