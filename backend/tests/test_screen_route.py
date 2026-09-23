"""Offline tests for POST /screen.

_call_model is monkeypatched in every test, so nothing here touches the network or
spends Claude credit. These run in the default `pytest` invocation, not under --eval.
"""

import json
import os

import anthropic
import httpx
import pytest
from starlette.testclient import TestClient

# main.py builds an anthropic.Anthropic() at import time, which needs a key present
# even though no request is ever made with it.
os.environ.setdefault("ANTHROPIC_API_KEY", "test-key-never-used")

import main  # noqa: E402

VALID_RESULT = {
    "verdict": "green",
    "role_term": "internship_or_temporary",
    "verdict_reasons": [{"tag": "explicit_optcpt", "detected_phrase": "open to OPT"}],
    "position_title": "Data Analyst Intern",
    "company_name": "Meridian",
    "job_functions": "Builds dashboards.",
    "preferred_skills": ["SQL"],
    "deadline": "2026-10-15",
}

POSTING = "Data Analyst Intern at Meridian. Open to OPT and CPT candidates."


@pytest.fixture(autouse=True)
def fresh_rate_limit(monkeypatch):
    """Each test starts with an empty request log and the documented default limits.

    The log is module state that outlives a request, so without this a test would
    inherit whatever the previous one spent, and the limits themselves are read from
    the environment, which a contributor may well have set.
    """
    main._request_log.clear()
    monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 10)
    monkeypatch.setattr(main, "RATE_LIMIT_PER_HOUR", 60)
    yield
    main._request_log.clear()


@pytest.fixture
def client():
    return TestClient(main.app)


def stub_model(monkeypatch, *replies):
    """Make _call_model return each reply in turn, and record what it was asked."""
    calls: list[dict] = []

    def fake(job_description, max_tokens=main.MODEL_MAX_TOKENS):
        calls.append({"job_description": job_description, "max_tokens": max_tokens})
        reply = replies[min(len(calls) - 1, len(replies) - 1)]
        if isinstance(reply, Exception):
            raise reply
        return reply

    monkeypatch.setattr(main, "_call_model", fake)
    return calls


class TestHappyPath:
    def test_valid_model_output_is_returned(self, client, monkeypatch):
        calls = stub_model(monkeypatch, json.dumps(VALID_RESULT))
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 200
        body = response.json()
        assert body["verdict"] == "green"
        assert body["priority"] == "A"
        assert body["position_title"] == "Data Analyst Intern"
        assert len(calls) == 1
        assert calls[0]["job_description"] == POSTING

    def test_a_preamble_around_the_json_still_parses(self, client, monkeypatch):
        stub_model(
            monkeypatch,
            f"Here is the JSON:\n```json\n{json.dumps(VALID_RESULT)}\n```\nHope that helps!",
        )
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 200
        assert response.json()["verdict"] == "green"


class TestRetry:
    def test_second_attempt_can_succeed(self, client, monkeypatch):
        calls = stub_model(monkeypatch, "not json at all", json.dumps(VALID_RESULT))
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 200
        assert len(calls) == 2

    def test_two_bad_replies_give_up_with_a_502(self, client, monkeypatch):
        calls = stub_model(monkeypatch, "not json at all")
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 502
        assert len(calls) == 2

    def test_the_502_detail_is_a_plain_string_and_leaks_nothing(self, client, monkeypatch):
        # A raw ValidationError repr carries a docs URL and the offending payload;
        # /screen is unauthenticated, so that stays in the log.
        stub_model(monkeypatch, json.dumps({**VALID_RESULT, "verdict": "chartreuse"}))
        detail = client.post("/screen", json={"job_description": POSTING}).json()["detail"]

        assert isinstance(detail, str)
        assert "ValidationError" not in detail
        assert "https://" not in detail

    def test_a_truncated_reply_is_retried_with_more_room(self, client, monkeypatch):
        calls = stub_model(
            monkeypatch,
            main.TruncatedModelResponse("out of room"),
            json.dumps(VALID_RESULT),
        )
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 200
        assert [call["max_tokens"] for call in calls] == [
            main.MODEL_MAX_TOKENS,
            main.MODEL_MAX_TOKENS_RETRY,
        ]


class TestInputValidation:
    @pytest.mark.parametrize("value", ["", "   \n  "])
    def test_blank_input_is_a_400(self, client, monkeypatch, value):
        calls = stub_model(monkeypatch, json.dumps(VALID_RESULT))
        response = client.post("/screen", json={"job_description": value})

        assert response.status_code == 400
        assert calls == []

    def test_oversize_input_is_a_400_with_a_string_detail(self, client, monkeypatch):
        # Left on the pydantic field this was a 422 whose detail is a list of dicts,
        # which the frontend renders as "[object Object]".
        calls = stub_model(monkeypatch, json.dumps(VALID_RESULT))
        too_long = "x" * (main.MAX_JOB_DESCRIPTION_CHARS + 1)
        response = client.post("/screen", json={"job_description": too_long})

        assert response.status_code == 400
        assert isinstance(response.json()["detail"], str)
        assert "20,000" in response.json()["detail"]
        assert calls == []

    def test_a_posting_at_the_cap_is_accepted(self, client, monkeypatch):
        stub_model(monkeypatch, json.dumps(VALID_RESULT))
        at_cap = "x" * main.MAX_JOB_DESCRIPTION_CHARS
        response = client.post("/screen", json={"job_description": at_cap})

        assert response.status_code == 200

    def test_a_multi_megabyte_body_is_rejected_by_the_schema(self, client, monkeypatch):
        calls = stub_model(monkeypatch, json.dumps(VALID_RESULT))
        response = client.post("/screen", json={"job_description": "x" * 2_000_000})

        assert response.status_code == 422
        assert calls == []


class TestRateLimiting:
    def test_the_limit_returns_429_with_retry_after(self, client, monkeypatch):
        monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 3)
        monkeypatch.setattr(main, "RATE_LIMIT_PER_HOUR", 0)
        stub_model(monkeypatch, json.dumps(VALID_RESULT))

        codes = [
            client.post("/screen", json={"job_description": POSTING}).status_code
            for _ in range(4)
        ]
        assert codes == [200, 200, 200, 429]

        blocked = client.post("/screen", json={"job_description": POSTING})
        assert blocked.status_code == 429
        assert int(blocked.headers["retry-after"]) >= 1
        assert isinstance(blocked.json()["detail"], str)

    def test_rotating_x_forwarded_for_does_not_buy_a_fresh_quota(self, client, monkeypatch):
        # A proxy appends the address it actually saw, so the rightmost entry is the
        # real peer and everything to its left is whatever the caller chose to send.
        monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 2)
        monkeypatch.setattr(main, "RATE_LIMIT_PER_HOUR", 0)
        stub_model(monkeypatch, json.dumps(VALID_RESULT))

        codes = [
            client.post(
                "/screen",
                json={"job_description": POSTING},
                headers={"x-forwarded-for": f"10.0.0.{i}, 203.0.113.7"},
            ).status_code
            for i in range(4)
        ]
        assert codes == [200, 200, 429, 429]

    def test_a_forged_header_cannot_outvote_the_edge_header(self, client, monkeypatch):
        monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 2)
        monkeypatch.setattr(main, "RATE_LIMIT_PER_HOUR", 0)
        stub_model(monkeypatch, json.dumps(VALID_RESULT))

        codes = [
            client.post(
                "/screen",
                json={"job_description": POSTING},
                headers={
                    "x-vercel-forwarded-for": "203.0.113.7",
                    "x-forwarded-for": f"10.0.0.{i}",
                },
            ).status_code
            for i in range(3)
        ]
        assert codes == [200, 200, 429]

    def test_separate_clients_keep_separate_quotas(self, client, monkeypatch):
        monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 1)
        monkeypatch.setattr(main, "RATE_LIMIT_PER_HOUR", 0)
        stub_model(monkeypatch, json.dumps(VALID_RESULT))

        first = client.post(
            "/screen",
            json={"job_description": POSTING},
            headers={"x-real-ip": "198.51.100.4"},
        )
        second = client.post(
            "/screen",
            json={"job_description": POSTING},
            headers={"x-real-ip": "198.51.100.5"},
        )
        assert (first.status_code, second.status_code) == (200, 200)

    def test_the_tracked_ip_count_is_capped(self, client, monkeypatch):
        monkeypatch.setattr(main, "MAX_TRACKED_IPS", 5)
        stub_model(monkeypatch, json.dumps(VALID_RESULT))

        for i in range(20):
            client.post(
                "/screen",
                json={"job_description": POSTING},
                headers={"x-real-ip": f"198.51.100.{i}"},
            )
        # Exactly the cap, not the cap plus one. Evicting before recording the
        # current caller leaves the log permanently one entry over.
        assert len(main._request_log) == main.MAX_TRACKED_IPS

    def test_eviction_drops_the_least_recently_seen_address(self, client, monkeypatch):
        """A caller who is still active must not be evicted by newer arrivals."""
        monkeypatch.setattr(main, "MAX_TRACKED_IPS", 3)
        stub_model(monkeypatch, json.dumps(VALID_RESULT))

        def call(ip):
            client.post(
                "/screen",
                json={"job_description": POSTING},
                headers={"x-real-ip": ip},
            )

        for ip in ("203.0.113.1", "203.0.113.2", "203.0.113.3"):
            call(ip)
        call("203.0.113.1")  # .1 is now the most recent, .2 the oldest
        call("203.0.113.4")  # forces one eviction

        assert "203.0.113.1" in main._request_log
        assert "203.0.113.2" not in main._request_log
        assert len(main._request_log) == 3

    def test_the_sweep_does_not_run_on_every_request(self, monkeypatch):
        """The age-out scan is O(n). Running it per request serialises the
        endpoint behind the lock exactly when the log is largest."""
        monkeypatch.setattr(main, "RATE_LIMIT_PER_MINUTE", 0)
        monkeypatch.setattr(main, "RATE_LIMIT_PER_HOUR", 1_000_000)
        monkeypatch.setattr(main, "_last_sweep", main.time.monotonic())

        swept = []
        real_items = main._request_log.items

        def counting_items():
            swept.append(1)
            return real_items()

        monkeypatch.setattr(main._request_log, "items", counting_items)

        class _Req:
            def __init__(self, ip):
                self.headers = {"x-real-ip": ip}
                self.client = None

        for i in range(50):
            main._enforce_rate_limit(_Req(f"192.0.2.{i}"))
        assert swept == [], "the sweep ran inside the per-request path"


class _FakeBlock:
    type = "text"

    def __init__(self, text: str):
        self.text = text


class _FakeMessage:
    """Just enough of an anthropic Message for _call_model to read."""

    def __init__(self, stop_reason: str, text: str = "{}"):
        self.stop_reason = stop_reason
        self.content = [_FakeBlock(text)]


class TestStopReason:
    """_call_model reads stop_reason, so truncation and refusal are not opaque 502s."""

    def stub_messages(self, monkeypatch, *messages):
        calls: list[dict] = []

        def fake_create(**kwargs):
            calls.append(kwargs)
            return messages[min(len(calls) - 1, len(messages) - 1)]

        monkeypatch.setattr(main.client.messages, "create", fake_create)
        return calls

    def test_truncation_is_retried_with_a_bigger_ceiling(self, client, monkeypatch):
        calls = self.stub_messages(
            monkeypatch,
            _FakeMessage("max_tokens", '{"verdict": "gre'),
            _FakeMessage("end_turn", json.dumps(VALID_RESULT)),
        )
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 200
        assert [call["max_tokens"] for call in calls] == [
            main.MODEL_MAX_TOKENS,
            main.MODEL_MAX_TOKENS_RETRY,
        ]

    def test_a_refusal_is_a_422_and_is_not_retried(self, client, monkeypatch):
        calls = self.stub_messages(monkeypatch, _FakeMessage("refusal", ""))
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 422
        assert isinstance(response.json()["detail"], str)
        assert len(calls) == 1


class TestUpstreamErrors:
    """Upstream failures map to a status the client can act on, with no exception text."""

    def raise_from_model(self, monkeypatch, exc):
        def fake(job_description, max_tokens=main.MODEL_MAX_TOKENS):
            raise exc

        monkeypatch.setattr(main, "_call_model", fake)

    def test_a_timeout_is_a_504(self, client, monkeypatch):
        request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        self.raise_from_model(monkeypatch, anthropic.APITimeoutError(request=request))
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 504
        assert isinstance(response.json()["detail"], str)

    def test_an_upstream_rate_limit_is_a_429(self, client, monkeypatch):
        request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        response_429 = httpx.Response(429, request=request)
        self.raise_from_model(
            monkeypatch,
            anthropic.RateLimitError(
                "slow down", response=response_429, body=None
            ),
        )
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 429
        assert "slow down" not in response.json()["detail"]

    def test_any_other_api_error_is_a_502_without_the_exception_text(self, client, monkeypatch):
        request = httpx.Request("POST", "https://api.anthropic.com/v1/messages")
        self.raise_from_model(
            monkeypatch,
            anthropic.APIConnectionError(message="dial tcp 1.2.3.4: refused", request=request),
        )
        response = client.post("/screen", json={"job_description": POSTING})

        assert response.status_code == 502
        assert "dial tcp" not in response.json()["detail"]


class TestHealth:
    def test_health_is_not_rate_limited(self, client):
        assert client.get("/health").json() == {"status": "ok"}
