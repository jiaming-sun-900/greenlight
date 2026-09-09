import json
import os

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

MODEL = "claude-haiku-4-5-20251001"

client = anthropic.Anthropic()  # reads ANTHROPIC_API_KEY from the environment (.env)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5174"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ScreenRequest(BaseModel):
    job_description: str


SYSTEM_PROMPT = """You are a visa-eligibility screener for international students on F-1 visas. \
You analyze a pasted job description and decide whether the posting is friendly to candidates who \
need CPT, OPT, or H-1B sponsorship.

Return a Red / Yellow / Green verdict, and tag every signal you detect with a tiered SUB-REASON. \
Each verdict has its own set of sub-reason tags - you must use these exact tag strings:

GREEN (posting is friendly to F-1 candidates):
- "explicit_optcpt" - Posting explicitly states OPT, CPT, or F-1 status is accepted (e.g. "open to \
OPT/CPT candidates," "F-1 students welcome").
- "explicit_h1b_sponsor" - Posting explicitly states the employer will sponsor H-1B or other work visas.
- "optcpt_overrides_generic" - Posting contains generic "work authorization required" language AND \
explicit OPT/CPT/sponsorship language elsewhere. The explicit mention overrides the generic phrase.

YELLOW (ambiguous, conditional, contradictory, or silent):
- "generic_authorization_only" - Posting requires "US work authorization" (or similar) with no \
explicit OPT/CPT mention and no explicit exclusion. Ambiguous - could include or exclude.
- "silent_no_signal" - Posting contains zero language about visa status, sponsorship, or work \
authorization anywhere. No signal in either direction.
- "vague_conditional" - Posting offers sponsorship conditionally, not as a commitment (e.g. \
"sponsorship available for exceptional candidates," "considered on a case-by-case basis").
- "contradictory" - Posting contains both inclusive and exclusive signals in different sections.

RED (posting explicitly excludes international students):
- "citizens_only" - Posting explicitly requires US citizenship or permanent residency.
- "no_sponsorship_now_or_future" - Posting explicitly states no sponsorship now or in the future.
- "explicit_no_visa" - Posting explicitly states it cannot accommodate visa holders or cannot \
sponsor employment visas.

RULES:
- The top-level verdict must match the tier of the sub-reason tags you choose (green tags -> green, \
yellow tags -> yellow, red tags -> red). Never mix tags from different tiers.
- IMPORTANT EDGE CASE: If a posting says both "US work authorization required" AND explicitly names \
OPT or CPT as accepted, the verdict is GREEN with the "optcpt_overrides_generic" tag - the explicit \
mention of OPT/CPT overrides the generic work-authorization language.
- If the posting is completely silent on visa/sponsorship/work-authorization, the verdict is YELLOW \
with a single "silent_no_signal" reason.
- "deadline" must be an ISO calendar date in YYYY-MM-DD form so the UI can render it in a date \
picker. Convert prose dates ("October 15, 2026" -> "2026-10-15"). If the posting names no \
application deadline, or the date is too vague to resolve to a single day, use null.

Respond with a single JSON object and nothing else - no markdown, no code fences, no commentary. \
The JSON object must have exactly this shape:

{
  "verdict": "green" | "yellow" | "red",
  "verdict_reasons": [
    { "tag": "one of the sub-reason strings above", "detected_phrase": "exact quoted phrase from the posting, or null" }
  ],
  "position_title": "string",
  "company_name": "string",
  "job_functions": "string (2-3 sentence plain-English summary of what the role does)",
  "preferred_skills": ["skill 1", "skill 2", ...],
  "deadline": "YYYY-MM-DD or null"
}

For each verdict_reasons entry, "tag" MUST be exactly one of the sub-reason strings listed above, \
and "detected_phrase" MUST be the exact text quoted verbatim from the posting that triggered that \
tag. For "silent_no_signal", set "detected_phrase" to null (there is no phrase to quote). If a field \
is not present in the posting, use an empty string (or null for deadline, or [] for lists). Output \
only the JSON object."""


def _call_model(job_description: str) -> str:
    """Call Claude and return the raw text of the first content block."""
    message = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": job_description}],
    )
    return next((block.text for block in message.content if block.type == "text"), "")


def _strip_code_fences(text: str) -> str:
    """Remove a leading/trailing markdown code fence if the model wrapped its JSON in one."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped[3:]
        if stripped[:4].lower() == "json":
            stripped = stripped[4:]
        if stripped.endswith("```"):
            stripped = stripped[:-3]
    return stripped.strip()


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/screen")
def screen(request: ScreenRequest):
    if not request.job_description.strip():
        raise HTTPException(status_code=400, detail="job_description must not be empty.")

    # Ask the model, then parse. If the output isn't valid JSON, retry once before giving up.
    last_error: Exception | None = None
    for _ in range(2):
        try:
            raw = _call_model(request.job_description)
        except anthropic.APIError as exc:
            raise HTTPException(
                status_code=502, detail=f"Upstream Claude API error: {exc}"
            ) from exc

        try:
            return json.loads(_strip_code_fences(raw))
        except json.JSONDecodeError as exc:
            last_error = exc
            continue

    raise HTTPException(
        status_code=502,
        detail=f"Model did not return valid JSON after a retry: {last_error}",
    )
