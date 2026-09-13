"""Vercel Serverless Function. Vercel maps this file to /api/<filename> by name.

The app itself is assembled in backend/asgi.py; this file only puts backend/ on
the import path so the function bundle can reach it.
"""

import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent / "backend"))

from asgi import app  # noqa: E402, F401
