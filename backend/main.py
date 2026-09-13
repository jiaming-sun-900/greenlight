import json
import logging
import os
import re
from typing import Literal

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

load_dotenv()

logger = logging.getLogger(__name__)

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
OPT/CPT candidates," "F-1 students welcome"), AND either the role is an internship, co-op, or other \
temporary position that ends inside the OPT window, OR the posting also speaks positively about \
sponsorship beyond that window.
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
- "contradictory" - Posting contains two explicit, directly opposing signals in different sections \
(e.g. a benefits section promising H-1B sponsorship against a requirement that candidates never need \
sponsorship). This tag outranks every other tag, including the red ones - see the ordered rules.
- "optcpt_future_unstated" - Posting explicitly accepts OPT/CPT/F-1 for a full-time or permanent \
role, but says nothing either way about sponsorship after the OPT window ends. The candidate can be \
hired, but whether there is an H-1B path is simply unanswered.

RED (posting explicitly excludes international students):
- "citizens_only" - Posting explicitly requires US citizenship or permanent residency.
- "no_sponsorship_now_or_future" - Posting explicitly states no sponsorship now or in the future.
- "explicit_no_visa" - Posting explicitly states it cannot accommodate visa holders at all, so the \
candidate cannot be hired even on existing OPT/CPT work authorization.
- "no_future_sponsorship_only" - Posting rules out sponsorship in present-tense or role-scoped terms \
("sponsorship is not available for this position," "no sponsorship is available at this time," "we \
do not sponsor work visas") WITHOUT barring candidates who already hold their own work \
authorization. The candidate can usually still be hired on OPT/STEM OPT; what is missing is the \
path after it expires.

RULES:
- The top-level verdict must match the tier of the sub-reason tags you choose (green tags -> green, \
yellow tags -> yellow, red tags -> red). Never mix tags from different tiers.
- IMPORTANT EDGE CASE: If a posting says both "US work authorization required" AND explicitly names \
OPT or CPT as accepted, the explicit mention of OPT/CPT overrides the generic work-authorization \
language. For an internship or temporary role, or where later sponsorship is addressed positively, \
that makes the verdict GREEN with the "optcpt_overrides_generic" tag. For a full-time role with \
nothing said about the period after OPT, the override still holds but only settles the "now" \
question, so the verdict is YELLOW with "optcpt_future_unstated".
- If the posting is completely silent on visa/sponsorship/work-authorization, the verdict is YELLOW \
with a single "silent_no_signal" reason.
- "NOW" AND "FUTURE" ARE TWO SEPARATE QUESTIONS. Whether the candidate may be hired today on \
existing OPT/CPT authorization is one question; whether the employer will sponsor a work visa after \
that authorization expires is another. Decide both before choosing tags. A posting that answers only \
one of them has not answered the other.
- HEDGED WORDING IS NOT A PERMANENT ANSWER. "at this time," "for this position," "for this \
requisition," and "currently" scope a statement to the present moment or to one job opening. Read \
them as present-tense facts, not as commitments about the future. In particular, "no sponsorship is \
available at this time" is "no_future_sponsorship_only", NOT "no_sponsorship_now_or_future".
- E-VERIFY AND FORM I-983 ARE NOT SPONSORSHIP. Participating in E-Verify is a STEM OPT compliance \
requirement, and Form I-983 is a STEM OPT training plan. An employer can do both, hire the candidate \
on STEM OPT, and still never file an H-1B. Never treat E-Verify enrollment, I-983 willingness, or \
STEM OPT support on its own as evidence of visa sponsorship. Such a posting is not silent either: \
it has accepted OPT/STEM OPT and left the future open, so tag it "optcpt_future_unstated" for a \
full-time role rather than "silent_no_signal".
- FIRST DECIDE THE ROLE TERM, BEFORE CHOOSING ANY TAG. Set "role_term" to \
"internship_or_temporary" only when the posting clearly describes a role that ends inside the OPT \
window: an internship, co-op, summer or seasonal role, a residency or fellowship with a fixed end, \
or a contract with a stated end date. Otherwise set it to "ongoing". Full-time, permanent, regular, \
and unspecified all count as "ongoing" - if the posting does not clearly mark the role as \
fixed-term, it is "ongoing". Words like "Full-time" may appear far from the work-authorization \
section; read the whole posting before deciding.
- Apply these in order, and stop at the first one that fits:
  1. The posting makes two EXPLICIT statements that directly oppose each other, and neither is
     merely a narrower scope of the other -> YELLOW with "contradictory". Apply this BEFORE any
     other step, including the red ones. A posting that both promises sponsorship and forbids it
     has not answered the question, and the candidate needs to ask rather than be told no. The
     opposing statements do not cancel out into whichever one sounds stricter. The verdict for
     this step is YELLOW, never RED, however strict one of the two statements sounds. Emit one
     verdict_reasons entry per opposing phrase, both tagged "contradictory".
     This step does NOT apply when: a job-board tag, benefits blurb, or boilerplate line is
     corrected or narrowed by a specific statement in the job body (the specific statement wins,
     carry on to step 2); or a generic work-authorization phrase sits alongside an explicit
     OPT/CPT mention (that is "optcpt_overrides_generic", step 5).
  2. Posting bars the candidate outright, now and in future -> RED ("citizens_only",
     "no_sponsorship_now_or_future", or "explicit_no_visa").
  3. Posting rules out sponsorship in present-tense or role-scoped terms but does not bar someone
     holding their own work authorization -> RED with "no_future_sponsorship_only".
  4. Posting explicitly commits to sponsoring H-1B or another work visa -> GREEN with
     "explicit_h1b_sponsor".
  5. Posting explicitly accepts OPT/CPT/F-1:
     a. role_term is "internship_or_temporary", or the posting also addresses later sponsorship
        positively -> GREEN ("explicit_optcpt", plus "optcpt_overrides_generic" when generic
        work-authorization language appears alongside it).
     b. role_term is "ongoing" and nothing is said about the period after OPT -> YELLOW with
        "optcpt_future_unstated". This applies even when generic work-authorization language is
        present: the OPT/CPT mention still overrides that generic phrase, but overriding it only
        answers the "now" question, and the "future" question stays open. Do NOT reach for
        "optcpt_overrides_generic" here - that tag is for 4a only.
  6. Otherwise fall through to the remaining YELLOW tags ("generic_authorization_only",
     "vague_conditional", "silent_no_signal").
- "deadline" must be an ISO calendar date in YYYY-MM-DD form so the UI can render it in a date \
picker. Convert prose dates ("October 15, 2026" -> "2026-10-15"). If the posting names no \
application deadline, or the date is too vague to resolve to a single day, use null.

Respond with a single JSON object and nothing else - no markdown, no code fences, no commentary. \
The JSON object must have exactly this shape:

{
  "verdict": "green" | "yellow" | "red",
  "role_term": "internship_or_temporary" | "ongoing",
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
tag. "detected_phrase" MUST be a single JSON string literal or null - never an expression, never \
string concatenation with "+", never two quoted phrases joined by a separator. If one tag is \
supported by two separate phrases, emit two verdict_reasons entries with the same tag, one phrase \
each. For "silent_no_signal", set "detected_phrase" to null (there is no phrase to quote). If a field \
is not present in the posting, use an empty string (or null for deadline, or [] for lists). Output \
only the JSON object."""


# Sub-reason tags, grouped by the verdict tier they belong to. Kept in lockstep with
# SYSTEM_PROMPT above and with the tag list in SPEC.md.
TAGS_BY_VERDICT: dict[str, frozenset[str]] = {
    "green": frozenset(
        {"explicit_optcpt", "explicit_h1b_sponsor", "optcpt_overrides_generic"}
    ),
    "yellow": frozenset(
        {
            "generic_authorization_only",
            "silent_no_signal",
            "vague_conditional",
            "contradictory",
            "optcpt_future_unstated",
        }
    ),
    "red": frozenset(
        {
            "citizens_only",
            "no_sponsorship_now_or_future",
            "explicit_no_visa",
            "no_future_sponsorship_only",
        }
    ),
}

ALL_TAGS = frozenset().union(*TAGS_BY_VERDICT.values())

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

# Application priority: how a posting should rank against the others competing for
# the same application, given that most postings land on yellow. The verdict says
# whether the door is open; the priority says whether it is worth the walk.
#
#   A - apply
#   B - a real signal, and one question would resolve it
#   C - no signal at all, or a role with a known end date
#   D - skip
#
# Derived from the verdict and tags, never from the model: this is a deterministic
# reading of a decision already made.
SIGNAL_BEARING_YELLOW = frozenset(
    {"optcpt_future_unstated", "vague_conditional", "contradictory"}
)


def _priority_for(verdict: str, tags: set[str]) -> str:
    if verdict == "green":
        return "A"
    if verdict == "yellow":
        # An employer who named OPT/CPT, offered conditional sponsorship, or
        # contradicted itself has given you something to ask about. Silence and
        # boilerplate have not.
        return "B" if tags & SIGNAL_BEARING_YELLOW else "C"
    # Red splits: a role you can still hold until OPT runs out is not the same as
    # a door that was never open.
    return "C" if tags == {"no_future_sponsorship_only"} else "D"


class VerdictReason(BaseModel):
    tag: str
    detected_phrase: str | None = None

    @field_validator("tag")
    @classmethod
    def _known_tag(cls, value: str) -> str:
        if value not in ALL_TAGS:
            raise ValueError(f"unknown sub-reason tag: {value!r}")
        return value


class ScreenResult(BaseModel):
    """The shape the model is asked to return. Validated before anything reaches the client."""

    verdict: Literal["green", "yellow", "red"]
    role_term: Literal["internship_or_temporary", "ongoing"] = "ongoing"
    # Filled in by _set_priority below; anything the model sends is overwritten.
    priority: Literal["A", "B", "C", "D"] = "C"
    verdict_reasons: list[VerdictReason] = Field(min_length=1)
    position_title: str = ""
    company_name: str = ""
    job_functions: str = ""
    preferred_skills: list[str] = Field(default_factory=list)
    deadline: str | None = None

    @field_validator("deadline", mode="before")
    @classmethod
    def _iso_or_none(cls, value: object) -> str | None:
        # The model occasionally emits "" instead of null; treat that as "no deadline"
        # rather than failing the whole response over it.
        if value is None:
            return None
        text = str(value).strip()
        if not text:
            return None
        if not ISO_DATE.match(text):
            raise ValueError(f"deadline must be YYYY-MM-DD or null, got {text!r}")
        return text

    @model_validator(mode="after")
    def _demote_ongoing_optcpt_only(self) -> "ScreenResult":
        """Green off OPT/CPT alone is only correct for a role that ends inside the OPT window.

        The model reliably gets this right on short postings and reliably gets it wrong on
        realistic ones, where "Full-time" sits far from the work-authorization section and the
        explicit OPT/CPT phrase dominates. The rule is mechanical, so enforce it here rather
        than hoping the prompt wins: an ongoing role whose only green signal is OPT/CPT
        acceptance has not answered the question of what happens after OPT.
        """
        if self.verdict != "green" or self.role_term != "ongoing":
            return self
        tags = {reason.tag for reason in self.verdict_reasons}
        if not tags <= {"explicit_optcpt", "optcpt_overrides_generic"}:
            # An explicit future-sponsorship commitment is present; green stands.
            return self

        phrase = next(
            (r.detected_phrase for r in self.verdict_reasons if r.detected_phrase), None
        )
        logger.info(
            "Demoting green to yellow: ongoing role with OPT/CPT acceptance only (tags=%s)",
            ", ".join(sorted(tags)),
        )
        self.verdict = "yellow"
        self.verdict_reasons = [
            VerdictReason(tag="optcpt_future_unstated", detected_phrase=phrase)
        ]
        return self

    @model_validator(mode="after")
    def _set_priority(self) -> "ScreenResult":
        self.priority = _priority_for(
            self.verdict, {reason.tag for reason in self.verdict_reasons}
        )
        return self

    @model_validator(mode="after")
    def _warn_on_tier_mismatch(self) -> "ScreenResult":
        # CLAUDE.md: the verdict tier and its sub-reason tags should always agree.
        # Deliberately a warning, not a failure - a mismatch here is a prompt-quality
        # signal, and the response is still useful to the user, so it renders as-is
        # rather than costing a retry and a 502.
        allowed = TAGS_BY_VERDICT[self.verdict]
        mismatched = sorted({reason.tag for reason in self.verdict_reasons} - allowed)
        if mismatched:
            logger.warning(
                "Verdict tier mismatch: verdict=%r carries non-%s tag(s) %s; reasons=%r",
                self.verdict,
                self.verdict,
                ", ".join(mismatched),
                [reason.model_dump() for reason in self.verdict_reasons],
            )
        return self


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

    # Ask the model, then parse and validate. If the output isn't valid JSON, or doesn't
    # match ScreenResult, retry once before giving up.
    last_error: Exception | None = None
    for _ in range(2):
        try:
            raw = _call_model(request.job_description)
        except anthropic.APIError as exc:
            raise HTTPException(
                status_code=502, detail=f"Upstream Claude API error: {exc}"
            ) from exc

        try:
            payload = json.loads(_strip_code_fences(raw))
            return ScreenResult.model_validate(payload).model_dump()
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
            continue

    raise HTTPException(
        status_code=502,
        detail=f"Model did not return a valid screening result after a retry: {last_error}",
    )
