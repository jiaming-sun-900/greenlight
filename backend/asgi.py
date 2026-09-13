"""ASGI entry point for deployment.

The screening app in main.py serves /screen and /health, which is what
`uvicorn main:app` exposes locally. In production those live behind /api on the
same domain as the frontend, so mount the app under that prefix rather than
rewriting the paths in the routes themselves.
"""

from fastapi import FastAPI

from main import app as screener

app = FastAPI()
app.mount("/api", screener)
