import datetime
import hashlib
import json
import logging
import os
import re
import threading
import time
from collections import OrderedDict, deque
from typing import Literal

import anthropic
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, ValidationError, field_validator, model_validator

load_dotenv()

# Without this the module logger inherits the root logger's WARNING default and
# every logger.info below is silently dropped, including the per-call token usage
# that is the only way to know what a screening costs. Uvicorn and Vercel both
# capture stdout, so a stream handler is all that is needed.
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=LOG_LEVEL,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger(__name__)
logger.setLevel(LOG_LEVEL)

MODEL = "claude-haiku-4-5-20251001"

# Reads ANTHROPIC_API_KEY from the environment (.env). The SDK defaults are a 600s
# timeout and two retries per call, which is an order of magnitude past the 60s
# maxDuration this function is deployed with: a stalled upstream would burn the whole
# budget and hand the client Vercel's own gateway error instead of ours. A timeout
# ends the request rather than re-entering the retry loop in screen(), so the worst
# case is two 20s attempts inside the SDK before we answer with a 504.
client = anthropic.Anthropic(timeout=20.0, max_retries=1)

app = FastAPI()

# In both environments the frontend and the API are same-origin - Vercel serves them
# under one domain, and the Vite dev server proxies /api to this process - so there is
# normally no CORS to configure. ALLOWED_ORIGINS exists only for the contributor who
# runs the frontend against this backend cross-origin; it is a comma-separated list,
# and no domain is hardcoded here.
_allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "").split(",")
    if origin.strip()
]
if _allowed_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_allowed_origins,
        allow_methods=["*"],
        allow_headers=["*"],
    )


# A job description far longer than this is not a posting. The cap keeps a single
# request from spending an unbounded amount of Claude credit, and it is checked in
# screen() before the model is ever called.
MAX_JOB_DESCRIPTION_CHARS = 20_000


# Content-Length past this is refused by the middleware below, before the body is
# read. Generous next to the real character cap because JSON escaping and
# multi-byte characters both inflate the encoded size.
MAX_REQUEST_BYTES = MAX_JOB_DESCRIPTION_CHARS * 8


class ScreenRequest(BaseModel):
    # The real cap is enforced in screen(), not here. A pydantic max_length failure
    # comes back as FastAPI's 422, whose detail is a list of dicts rather than a
    # string, and the frontend renders that as "[object Object]". This field guard
    # is a backstop for a body that arrives without a Content-Length to check.
    job_description: str = Field(max_length=MAX_JOB_DESCRIPTION_CHARS * 50)


@app.middleware("http")
async def _reject_oversized_bodies(request: Request, call_next):
    """Refuse a huge body before anything reads it.

    A field-level max_length is not protection: by the time pydantic sees the
    string, Starlette has already buffered the whole body and json.loads has
    already built it in memory, so a 500MB request is an out-of-memory event on
    a serverless function rather than a rejection. Content-Length is available
    before any of that happens.
    """
    raw = request.headers.get("content-length")
    if raw and raw.isdigit() and int(raw) > MAX_REQUEST_BYTES:
        return JSONResponse(
            status_code=413,
            content={
                "detail": (
                    f"That request body is too large. The limit is "
                    f"{MAX_JOB_DESCRIPTION_CHARS:,} characters."
                )
            },
        )
    return await call_next(request)


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
        "optcpt_overrides_generic" here - that tag is for 5a only.
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


# Tag order for picking the phrase the demotion below keeps, best evidence first.
# "explicit_optcpt" quotes the sentence that names OPT/CPT; "optcpt_overrides_generic"
# is about the override and may quote either side of it.
_OPTCPT_EVIDENCE_TAGS = ("explicit_optcpt", "optcpt_overrides_generic")


def _optcpt_evidence_phrase(reasons: list["VerdictReason"]) -> str | None:
    """Pick the phrase that best evidences OPT/CPT acceptance.

    The reasons arrive in whatever order the model emitted them, so taking the first
    non-empty phrase in list order can quote a generic "must be authorized to work in
    the US" sentence as proof that the employer takes OPT/CPT, which is the opposite of
    what it says. Ask by tag instead, and only fall back to list order when neither
    OPT/CPT tag carries a phrase.
    """
    for tag in _OPTCPT_EVIDENCE_TAGS:
        for reason in reasons:
            if reason.tag == tag and reason.detected_phrase:
                return reason.detected_phrase
    return next((r.detected_phrase for r in reasons if r.detected_phrase), None)


class ScreenResult(BaseModel):
    """The shape the model is asked to return. Validated before anything reaches the client."""

    verdict: Literal["green", "yellow", "red"]
    role_term: Literal["internship_or_temporary", "ongoing"] = "ongoing"
    # Filled in by _set_priority below; anything the model sends is discarded.
    priority: Literal["A", "B", "C", "D"] = "C"
    verdict_reasons: list[VerdictReason] = Field(min_length=1)
    position_title: str = ""
    company_name: str = ""
    job_functions: str = ""
    preferred_skills: list[str] = Field(default_factory=list)
    deadline: str | None = None

    @field_validator("priority", mode="before")
    @classmethod
    def _discard_model_priority(cls, _value: object) -> str:
        """Throw away whatever arrived and let _set_priority derive it.

        The field is a Literal, so a model that volunteers "priority": "high"
        would fail validation, cost a retry, and possibly a 502, over a value
        that is overwritten two validators later. The prompt does not ask for
        this field; the point is that it cannot hurt if the model sends it.
        """
        return "C"

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
        # The regex only checks the shape, so "2026-13-45" and "2026-02-31" would sail
        # through it and reach a date picker that cannot render them. Let the ValueError
        # out: an impossible date is a bad model response like any other, and it rides
        # the same retry-then-502 path.
        datetime.date.fromisoformat(text)
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

        phrase = _optcpt_evidence_phrase(self.verdict_reasons)
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


# A full screening result is comfortably under 1024 tokens; a long posting with many
# quoted phrases occasionally is not. Rather than pay for the bigger ceiling on every
# call, start small and let the one retry re-issue with room to finish.
MODEL_MAX_TOKENS = 1024
MODEL_MAX_TOKENS_RETRY = 4096


class TruncatedModelResponse(Exception):
    """The model ran out of output tokens mid-JSON. Retrying with more room usually fixes it."""


def _call_model(job_description: str, max_tokens: int = MODEL_MAX_TOKENS) -> str:
    """Call Claude and return the raw text of the first content block."""
    message = client.messages.create(
        model=MODEL,
        max_tokens=max_tokens,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": job_description}],
    )
    # Every billed call, logged. Without this there is no way to tell what a
    # screening actually costs or whether a change to the prompt moved it.
    #
    # No cache_control on the system prompt: Haiku 4.5 will not cache a prefix
    # under 4096 tokens and this one is about 2500, so a breakpoint here would
    # be silently ignored rather than rejected. Re-check that threshold before
    # adding one, and confirm it with cache_read_input_tokens below rather than
    # assuming it took.
    usage = getattr(message, "usage", None)
    if usage is not None:
        logger.info(
            "Screening call: input=%s output=%s cache_read=%s stop=%s",
            getattr(usage, "input_tokens", "?"),
            getattr(usage, "output_tokens", "?"),
            getattr(usage, "cache_read_input_tokens", 0),
            message.stop_reason,
        )
    # Without these two checks both outcomes below arrive as a JSON parse failure,
    # which costs a second identical call and then reports the wrong problem.
    if message.stop_reason == "max_tokens":
        raise TruncatedModelResponse(
            f"model hit max_tokens ({max_tokens}) before closing its JSON object"
        )
    if message.stop_reason == "refusal":
        # A refusal is stable: the same posting refused once will be refused again, so
        # a retry only spends another call to land in the same place. Tell the user.
        raise HTTPException(
            status_code=422,
            detail=(
                "Claude declined to screen this text. Please check that what you "
                "pasted is a job posting."
            ),
        )
    return next((block.text for block in message.content if block.type == "text"), "")


def _strip_code_fences(text: str) -> str:
    """Pull the JSON object out of the model's reply, code fences and preamble notwithstanding."""
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped[3:]
        if stripped[:4].lower() == "json":
            stripped = stripped[4:]
        if stripped.endswith("```"):
            stripped = stripped[:-3]
    stripped = stripped.strip()

    try:
        json.loads(stripped)
    except json.JSONDecodeError:
        # Fence-stripping does nothing for a conversational preamble ("Here is the
        # JSON:") or a trailing note, and both defeat the parse on their own. The
        # contract is a single JSON object, so the outermost braces bracket it: fall
        # back to that slice, which costs a retry's worth of credit to skip.
        start, end = stripped.find("{"), stripped.rfind("}")
        if start != -1 and end > start:
            return stripped[start : end + 1]
    return stripped


def _int_from_env(name: str, default: int) -> int:
    """Read an integer setting, falling back to the default instead of failing import.

    A typo in a dashboard env var would otherwise raise at import time, and because
    /api/screen and /api/health both import this module it would take the liveness
    check down along with the endpoint it was meant to configure. A rate limit that
    quietly reverts to its default is the better failure.
    """
    raw = os.getenv(name)
    if raw is None or not raw.strip():
        return default
    try:
        return int(raw.strip())
    except ValueError:
        logger.warning(
            "Ignoring %s=%r: not an integer. Using the default of %s.", name, raw, default
        )
        return default


# Per-IP rate limiting. /screen is unauthenticated and every call spends real Claude
# credit, so an unthrottled endpoint is an open tab on someone else's card.
#
# The counter lives in this process, which on Vercel means one serverless instance.
# That is deliberate and it is a real limit rather than a complete one: rapid repeated
# requests from one IP land on the same warm instance and get throttled, which is the
# abuse pattern that matters, but a slow attacker spread across cold starts can exceed
# these numbers. The hard ceiling on spend is the limit configured in the Anthropic
# console, not this dict. Adding a shared store would make the count exact, and would
# also mean adding a database, which this project deliberately does not have.
#
# The numbers are sized for a first-time user exploring the app, who will paste
# several postings back to back, rather than for the narrowest plausible session.
# Set a limit to 0 to disable that one window; both must be 0 to turn the limiter off.
RATE_LIMIT_PER_MINUTE = _int_from_env("SCREEN_RATE_LIMIT_PER_MINUTE", 10)
RATE_LIMIT_PER_HOUR = _int_from_env("SCREEN_RATE_LIMIT_PER_HOUR", 60)

# A ceiling on how many addresses the log tracks. Ageing entries out is no bound at
# all against a caller rotating a forged header, since every new value is a fresh key
# with a fresh timestamp. When the dict goes over, the least-recently-seen addresses
# are evicted first: they are the ones furthest from hitting a limit anyway.
MAX_TRACKED_IPS = 10_000

# Insertion-ordered and reordered on touch, so the least-recently-seen address is
# always the first key. That makes eviction a popitem rather than a sort of the
# whole dict, which matters because the case that fills this dict is the same case
# that floods the endpoint.
_request_log: "OrderedDict[str, deque[float]]" = OrderedDict()
_request_log_lock = threading.Lock()

# The age-out sweep walks every tracked address, so it runs on a timer rather than
# on every request. Between sweeps the size cap is what bounds the dict, and a
# stale entry costs one deque of floats.
_SWEEP_INTERVAL_SECONDS = 60.0
_last_sweep = 0.0


# Forwarding headers are only worth reading when something in front of this
# process is known to overwrite them. On Vercel that is the edge, which sets
# VERCEL in the environment. Anywhere else the operator has to say so, because a
# directly exposed uvicorn will happily repeat whatever the caller invented and
# every request lands in a bucket of its own.
TRUST_PROXY_HEADERS = bool(os.getenv("VERCEL")) or os.getenv(
    "TRUST_PROXY_HEADERS", ""
).strip().lower() in {"1", "true", "yes"}


def _client_ip(request: Request) -> str:
    """Best-effort client address, preferring the headers a caller cannot forge.

    x-forwarded-for is client-appendable: whatever the caller sends arrives on the
    left and the proxy appends the address it actually saw on the right, so the
    leftmost token is the attacker's own choice of rate-limit bucket. Vercel's
    x-vercel-forwarded-for and x-real-ip are both set at the edge and overwrite
    anything inbound, so they come first; failing those, the rightmost
    x-forwarded-for entry is the closest thing to the real peer. With no trusted
    proxy in front, none of them are read at all and the socket peer is the truth.
    """
    if not TRUST_PROXY_HEADERS:
        return request.client.host if request.client else "unknown"
    for header in ("x-vercel-forwarded-for", "x-real-ip"):
        value = (request.headers.get(header) or "").strip()
        if value:
            return value
    forwarded = [
        part.strip()
        for part in (request.headers.get("x-forwarded-for") or "").split(",")
        if part.strip()
    ]
    if forwarded:
        return forwarded[-1]
    return request.client.host if request.client else "unknown"


def _enforce_rate_limit(request: Request) -> None:
    windows = [(60.0, RATE_LIMIT_PER_MINUTE), (3600.0, RATE_LIMIT_PER_HOUR)]
    active = [(seconds, limit) for seconds, limit in windows if limit > 0]
    if not active:
        return

    longest = max(seconds for seconds, _ in active)
    now = time.monotonic()
    ip = _client_ip(request)

    # screen() is a sync def, so FastAPI runs it in the threadpool and two requests can
    # be inside this function at once. Unguarded, the reaper's del races another
    # thread's insert (KeyError), and iterating the dict while another thread adds a key
    # raises RuntimeError. Everything under this lock is O(1) per request except the
    # periodic sweep, which is the reason the sweep is periodic: doing an O(n) scan on
    # every call would serialise the whole endpoint behind the lock exactly when the
    # dict is largest, turning the defence into the bottleneck.
    global _last_sweep
    with _request_log_lock:
        if now - _last_sweep > _SWEEP_INTERVAL_SECONDS:
            _last_sweep = now
            for known_ip in [
                k for k, times in _request_log.items() if times and now - times[-1] > longest
            ]:
                del _request_log[known_ip]

        seen = _request_log.get(ip)
        if seen is None:
            seen = _request_log[ip] = deque()
        else:
            _request_log.move_to_end(ip)

        # Evict after touching this address, not before, so the caller being
        # served is the newest key and cannot evict itself. Trimming first left
        # the dict one over the cap forever.
        while len(_request_log) > MAX_TRACKED_IPS:
            _request_log.popitem(last=False)
        while seen and now - seen[0] > longest:
            seen.popleft()

        for seconds, limit in active:
            in_window = sum(1 for stamp in seen if now - stamp <= seconds)
            if in_window >= limit:
                retry_after = int(seconds - (now - seen[-in_window])) + 1
                logger.warning(
                    "Rate limit hit: ip=%s window=%ss limit=%s", ip, int(seconds), limit
                )
                raise HTTPException(
                    status_code=429,
                    detail="Too many screening requests. Please wait a moment and try again.",
                    headers={"Retry-After": str(max(retry_after, 1))},
                )

        seen.append(now)


# Screening the same posting twice is the same question twice. Popular listings
# get pasted by a lot of people, so a content-addressed cache turns every repeat
# into a free, instant answer. The key covers the model and the prompt as well as
# the posting: changing either has to invalidate everything, or a prompt fix
# would not reach anyone who had already screened a posting under the old one.
#
# The store is per warm instance, like the rate limiter. That makes this a real
# saving rather than a complete one, and it is the reason there is no database.
SCREEN_CACHE_MAX_ENTRIES = 500
SCREEN_CACHE_TTL_SECONDS = 24 * 3600

_screen_cache: "OrderedDict[str, tuple[float, dict]]" = OrderedDict()
_screen_cache_lock = threading.Lock()
_PROMPT_FINGERPRINT = hashlib.sha256(SYSTEM_PROMPT.encode()).hexdigest()[:12]


def _cache_key(job_description: str) -> str:
    """Content address for a posting.

    Whitespace is collapsed first: the same listing copied out of two different
    job boards differs by line wrapping far more often than by words, and those
    should not be two separate entries.
    """
    normalized = " ".join(job_description.split())
    digest = hashlib.sha256(normalized.encode()).hexdigest()
    return f"{MODEL}:{_PROMPT_FINGERPRINT}:{digest}"


def _cache_get(key: str) -> dict | None:
    now = time.monotonic()
    with _screen_cache_lock:
        entry = _screen_cache.get(key)
        if entry is None:
            return None
        stored_at, payload = entry
        if now - stored_at > SCREEN_CACHE_TTL_SECONDS:
            del _screen_cache[key]
            return None
        _screen_cache.move_to_end(key)
        return payload


def _cache_put(key: str, payload: dict) -> None:
    with _screen_cache_lock:
        _screen_cache[key] = (time.monotonic(), payload)
        _screen_cache.move_to_end(key)
        while len(_screen_cache) > SCREEN_CACHE_MAX_ENTRIES:
            _screen_cache.popitem(last=False)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/screen")
def screen(request: ScreenRequest, http_request: Request):
    _enforce_rate_limit(http_request)

    if not request.job_description.strip():
        raise HTTPException(status_code=400, detail="job_description must not be empty.")

    if len(request.job_description) > MAX_JOB_DESCRIPTION_CHARS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Job description is too long (max {MAX_JOB_DESCRIPTION_CHARS:,} characters)."
            ),
        )

    # Checked after the rate limit, not before: a cache hit should still count
    # against the caller's quota, or an attacker could replay one posting for
    # free and keep a warm instance busy.
    cache_key = _cache_key(request.job_description)
    cached = _cache_get(cache_key)
    if cached is not None:
        logger.info("Screening cache hit (%s entries warm)", len(_screen_cache))
        return cached

    # Ask the model, then parse and validate. If the output isn't valid JSON, or doesn't
    # match ScreenResult, retry once before giving up. Every detail string below is
    # written for the user: the frontend renders it verbatim, and /screen is
    # unauthenticated, so upstream exception text stays in the server log.
    last_error: Exception | None = None
    max_tokens = MODEL_MAX_TOKENS
    for _ in range(2):
        try:
            raw = _call_model(request.job_description, max_tokens=max_tokens)
        except TruncatedModelResponse as exc:
            logger.warning("Truncated model response: %s", exc)
            last_error = exc
            max_tokens = MODEL_MAX_TOKENS_RETRY
            continue
        except anthropic.APITimeoutError as exc:
            logger.warning("Claude API timed out: %s", exc)
            raise HTTPException(
                status_code=504,
                detail="Screening took too long to come back. Please try again.",
            ) from exc
        except anthropic.RateLimitError as exc:
            # Retryable, so 429 rather than 502: a 502 tells the client the request was
            # bad when in fact it was only early.
            logger.warning("Claude API rate limit: %s", exc)
            raise HTTPException(
                status_code=429,
                detail="The screening service is busy. Please wait a moment and try again.",
                headers={"Retry-After": "30"},
            ) from exc
        except anthropic.APIError as exc:
            logger.exception("Claude API error")
            raise HTTPException(
                status_code=502,
                detail="Screening is unavailable right now. Please try again in a moment.",
            ) from exc

        try:
            payload = json.loads(_strip_code_fences(raw))
            result = ScreenResult.model_validate(payload).model_dump()
            _cache_put(cache_key, result)
            return result
        except (json.JSONDecodeError, ValidationError) as exc:
            last_error = exc
            continue

    logger.error("No valid screening result after a retry: %s", last_error)
    raise HTTPException(
        status_code=502,
        detail="Screening came back in a form we could not read. Please try again.",
    )
