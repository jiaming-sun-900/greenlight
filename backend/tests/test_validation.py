"""Offline tests for ScreenResult. No API calls, no cost, safe for CI."""

import pytest
from pydantic import ValidationError

from main import ScreenResult

BASE = {
    "verdict": "green",
    "role_term": "internship_or_temporary",
    "verdict_reasons": [{"tag": "explicit_optcpt", "detected_phrase": "open to OPT"}],
    "position_title": "Data Analyst",
    "company_name": "Meridian",
    "job_functions": "Builds dashboards.",
    "preferred_skills": ["SQL"],
    "deadline": "2026-10-15",
}


def build(**overrides):
    return ScreenResult.model_validate({**BASE, **overrides})


class TestAccepted:
    def test_valid_payload_round_trips(self):
        assert build().model_dump()["verdict"] == "green"

    def test_silent_reason_may_omit_the_phrase(self):
        result = build(
            verdict="yellow",
            role_term="ongoing",
            verdict_reasons=[{"tag": "silent_no_signal", "detected_phrase": None}],
        )
        assert result.verdict_reasons[0].detected_phrase is None

    @pytest.mark.parametrize("value", ["", "   ", None])
    def test_empty_deadline_becomes_none(self, value):
        # The model emits "" occasionally; it means "no deadline", not a failure.
        assert build(deadline=value).deadline is None

    def test_role_term_defaults_to_ongoing(self):
        payload = {k: v for k, v in BASE.items() if k != "role_term"}
        payload["verdict"] = "yellow"
        payload["verdict_reasons"] = [{"tag": "silent_no_signal", "detected_phrase": None}]
        assert ScreenResult.model_validate(payload).role_term == "ongoing"


class TestRejected:
    @pytest.mark.parametrize(
        "overrides",
        [
            pytest.param({"verdict": "blue"}, id="verdict-not-in-enum"),
            pytest.param(
                {"verdict_reasons": [{"tag": "made_up", "detected_phrase": "x"}]},
                id="unknown-tag",
            ),
            pytest.param({"verdict_reasons": []}, id="empty-reasons"),
            pytest.param({"deadline": "March 15, 2026"}, id="prose-deadline"),
            pytest.param({"deadline": "2026-13-99x"}, id="malformed-deadline"),
            pytest.param({"preferred_skills": "SQL"}, id="skills-not-a-list"),
            pytest.param({"position_title": {"a": 1}}, id="title-not-a-string"),
            pytest.param({"role_term": "part_time"}, id="role-term-not-in-enum"),
        ],
    )
    def test_invalid_payloads_raise(self, overrides):
        with pytest.raises(ValidationError):
            build(**overrides)


class TestTierMismatchIsASoftWarning:
    """A mismatched tier is a prompt-quality signal, not a reason to 502."""

    def test_mismatch_is_logged_not_raised(self, caplog):
        result = build(
            verdict="red",
            role_term="ongoing",
            verdict_reasons=[{"tag": "explicit_optcpt", "detected_phrase": "open to OPT"}],
        )
        assert result.verdict == "red"
        assert "tier mismatch" in caplog.text.lower()


class TestOngoingOptcptDemotion:
    """Green off OPT/CPT alone is only correct for a role ending inside the OPT window."""

    @pytest.mark.parametrize(
        "tags",
        [
            pytest.param(["explicit_optcpt"], id="optcpt-only"),
            pytest.param(
                ["explicit_optcpt", "optcpt_overrides_generic"], id="optcpt-plus-override"
            ),
            pytest.param(["optcpt_overrides_generic"], id="override-only"),
        ],
    )
    def test_ongoing_role_is_demoted_to_yellow(self, tags):
        result = build(
            verdict="green",
            role_term="ongoing",
            verdict_reasons=[{"tag": t, "detected_phrase": "open to OPT and CPT"} for t in tags],
        )
        assert result.verdict == "yellow"
        assert [r.tag for r in result.verdict_reasons] == ["optcpt_future_unstated"]

    def test_demotion_preserves_the_detected_phrase(self):
        result = build(
            verdict="green",
            role_term="ongoing",
            verdict_reasons=[{"tag": "explicit_optcpt", "detected_phrase": "open to OPT and CPT"}],
        )
        assert result.verdict_reasons[0].detected_phrase == "open to OPT and CPT"

    def test_explicit_h1b_commitment_keeps_green(self):
        result = build(
            verdict="green",
            role_term="ongoing",
            verdict_reasons=[
                {"tag": "explicit_optcpt", "detected_phrase": "open to OPT"},
                {"tag": "explicit_h1b_sponsor", "detected_phrase": "we sponsor H-1B"},
            ],
        )
        assert result.verdict == "green"

    def test_internship_keeps_green(self):
        assert build(role_term="internship_or_temporary").verdict == "green"

    @pytest.mark.parametrize("verdict", ["yellow", "red"])
    def test_non_green_verdicts_are_untouched(self, verdict):
        tag = "silent_no_signal" if verdict == "yellow" else "citizens_only"
        result = build(
            verdict=verdict,
            role_term="ongoing",
            verdict_reasons=[{"tag": tag, "detected_phrase": None}],
        )
        assert result.verdict == verdict
