"""Screening eval against the live Claude API.

Skipped unless you pass --eval, because every case is a real billed request:

    pytest tests/test_screening_eval.py --eval          # ~14 calls
    pytest tests/test_screening_eval.py --eval -k green

The corpus lives in tests/postings.py. When a screening rule changes, add the
posting that motivated the change here first.
"""

import json
from collections import Counter

import pytest

import main
from tests.postings import CASES

pytestmark = pytest.mark.eval


def screen(posting: str) -> main.ScreenResult:
    raw = main._call_model(posting)
    return main.ScreenResult.model_validate(json.loads(main._strip_code_fences(raw)))


@pytest.fixture(scope="module")
def results():
    """Screen the whole corpus once and share it across tests."""
    return {case.name: screen(case.posting) for case in CASES}


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.name)
def test_posting_gets_the_expected_verdict(case, results):
    result = results[case.name]
    tags = [reason.tag for reason in result.verdict_reasons]
    assert result.verdict == case.verdict, (
        f"{case.name}: expected {case.verdict}, got {result.verdict} ({', '.join(tags)})"
    )
    assert case.tag in tags, f"{case.name}: expected tag {case.tag}, got {', '.join(tags)}"


@pytest.mark.parametrize("case", CASES, ids=lambda c: c.name)
def test_quoted_phrase_comes_from_the_posting(case, results):
    """A detected_phrase the posting does not contain is a hallucinated citation."""
    normalized = " ".join(case.posting.split()).lower()
    for reason in results[case.name].verdict_reasons:
        if reason.detected_phrase:
            quoted = " ".join(reason.detected_phrase.split()).lower()
            assert quoted in normalized, (
                f"{case.name}: {reason.tag} quoted text absent from the posting: "
                f"{reason.detected_phrase!r}"
            )


def test_role_term_matches_the_posting(results):
    """Term drives the green/yellow split, so it has to be read correctly."""
    expected_temporary = {"intern_optcpt", "contract_fixed_end"}
    for case in CASES:
        want = "internship_or_temporary" if case.name in expected_temporary else "ongoing"
        assert results[case.name].role_term == want, case.name


def test_extracted_fields_are_populated(results):
    for case in CASES:
        result = results[case.name]
        assert result.position_title.strip(), f"{case.name}: no position_title"
        assert result.company_name.strip(), f"{case.name}: no company_name"


def test_verdict_distribution(results, capsys):
    """Not a pass/fail bar: a printed report of how the corpus lands.

    Weighted by each case's real-world frequency, so it approximates what a
    student actually sees. Run with -s to read it.
    """
    counts = Counter()
    for case in CASES:
        counts[results[case.name].verdict] += case.weight
    total = sum(counts.values())
    with capsys.disabled():
        print("\n  weighted verdict distribution")
        for verdict in ("green", "yellow", "red"):
            n = counts[verdict]
            bar = "#" * round(n / total * 40)
            print(f"    {verdict:6} {n:3}/{total}  {n / total:5.1%}  {bar}")
    assert total > 0
