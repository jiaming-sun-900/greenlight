"""Vercel entry point for the FastAPI backend.

Vercel serves this file as a Python Serverless Function and vercel.json rewrites
every /api/* request to it. The screening app itself still lives in backend/main.py
and still exposes /screen and /health, so `uvicorn main:app` works unchanged for
local development; mounting it under /api here is the only difference in production.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

from fastapi import FastAPI  # noqa: E402

from main import app as screener  # noqa: E402

app = FastAPI()
app.mount("/api", screener)
