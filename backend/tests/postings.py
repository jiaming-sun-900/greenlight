"""Job postings used by the screening eval.

Each case is a realistic posting plus the verdict and sub-reason tag it should
produce. Postings are deliberately long, with the role term in the header and
the visa language at the bottom: a short posting puts those two facts side by
side and hides the exact mistake this corpus exists to catch.
"""

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Case:
    name: str
    verdict: str
    tag: str
    posting: str
    # Real-world frequency weight, used only by the distribution report.
    weight: int = 1
    notes: str = ""


_BODY = """
About the role
Meridian is hiring for our Growth Analytics team. You will own reporting for the
patient acquisition funnel, partner with Marketing and Product on experiment
design, and build the dashboards leadership uses to steer spend.

What you'll do
- Build and maintain dashboards in Looker and Tableau
- Design and analyze A/B tests, and write up results for non-technical partners
- Write production SQL against our Snowflake warehouse
- Partner with Data Engineering on pipeline and data-quality issues

What we're looking for
- 2+ years in an analytics role
- Strong SQL; Python or R for analysis
- Bachelor's or Master's in a quantitative field
"""


def _posting(header: str, tail: str = "") -> str:
    return f"{header}\n{_BODY}\n{tail}".strip()


_FT = "Data Analyst, Growth Analytics\nMeridian Health - Austin, TX (Hybrid)\nFull-time"

CASES: list[Case] = [
    # --- green -------------------------------------------------------------
    Case(
        "intern_optcpt", "green", "explicit_optcpt",
        _posting(
            "Data Analyst Intern, Growth Analytics (Summer 2027)\n"
            "Meridian Health - Austin, TX\nInternship, 12 weeks",
            "Work authorization\nApplicants must be currently authorized to work in the\n"
            "United States. We are open to candidates on OPT and CPT.",
        ),
        weight=2,
        notes="Ends inside the OPT window, so OPT/CPT acceptance answers everything.",
    ),
    Case(
        "contract_fixed_end", "green", "explicit_optcpt",
        _posting(
            "Data Analyst (12-month contract, ends December 2027)\nVandelay - Remote",
            "We are open to candidates on OPT and CPT.",
        ),
        notes="Fixed end date is the same shape as an internship.",
    ),
    Case(
        "ft_explicit_h1b", "green", "explicit_h1b_sponsor",
        _posting(_FT, "Work authorization\nThis role is eligible for immigration\n"
                      "sponsorship, including H-1B."),
        notes="The only way a full-time role earns green today.",
    ),
    # --- yellow ------------------------------------------------------------
    Case(
        "ft_optcpt_future_silent", "yellow", "optcpt_future_unstated",
        _posting(_FT, "Work authorization\nApplicants must be currently authorized to work in the\n"
                      "United States. We are open to candidates on OPT and CPT.\n"
                      "Meridian is an E-Verify employer.\n\nApplications close October 15, 2026."),
        weight=2,
        notes="Regression case. Screened green until role_term was made explicit.",
    ),
    Case(
        "ft_everify_only", "yellow", "optcpt_future_unstated",
        _posting(_FT, "Initech is an E-Verify employer and supports STEM OPT students\n"
                      "with Form I-983."),
        notes="E-Verify and I-983 are STEM OPT compliance, never a sponsorship promise.",
    ),
    Case(
        "ft_generic_only", "yellow", "generic_authorization_only",
        _posting(_FT, "Applicants must be currently authorized to work in the United States."),
        weight=4,
        notes="Extremely common in real postings.",
    ),
    Case(
        "ft_silent", "yellow", "silent_no_signal",
        _posting(_FT),
        weight=6,
        notes="The single most common real-world case: no visa language at all.",
    ),
    Case(
        "ft_vague_conditional", "yellow", "vague_conditional",
        _posting(_FT, "Sponsorship is available for exceptional candidates on a\n"
                      "case-by-case basis."),
        notes="An offer of a possibility, not a commitment.",
    ),
    Case(
        "ft_contradictory", "yellow", "contradictory",
        _posting(_FT, "Benefits\nWe sponsor H-1B visas for this role and cover all filing fees.\n\n"
                      "Work authorization\nCandidates must not require work sponsorship now or in\n"
                      "the future."),
        notes=(
            "Two explicit, directly opposing statements where neither narrows the "
            "other. A posting whose body simply corrects a job-board tag is not "
            "contradictory: the specific statement wins."
        ),
    ),
    # --- red ---------------------------------------------------------------
    Case(
        "ft_no_sponsorship_at_this_time", "red", "no_future_sponsorship_only",
        _posting(_FT, "Work authorization\nMust be currently authorized to work in the United\n"
                      "States. No sponsorship is available at this time."),
        weight=2,
        notes='"at this time" is present-tense. Hireable on OPT, no path after.',
    ),
    Case(
        "ft_no_sponsorship_this_position", "red", "no_future_sponsorship_only",
        _posting("Business Analyst\nGlobex - Chicago, IL\nFull-time",
                 "Sponsorship is not available for this position."),
        notes="Role-scoped refusal, same shape as the case above.",
    ),
    Case(
        "ft_now_or_future", "red", "no_sponsorship_now_or_future",
        _posting("Data Analyst\nInitech - Remote\nFull-time",
                 "Candidates must not require work sponsorship now or in the future."),
        weight=2,
        notes="The phrasing that closes the door hardest.",
    ),
    Case(
        "ft_citizens_only", "red", "citizens_only",
        _posting("Data Analyst\nStark Defense - Arlington, VA\nFull-time",
                 "U.S. citizenship or permanent residency is required for this role."),
        notes="Typically a cleared-contract requirement.",
    ),
    Case(
        "ft_no_visa_holders", "red", "explicit_no_visa",
        _posting(_FT, "We are unable to employ candidates holding or requiring any form of\n"
                      "work visa, including F-1 OPT."),
        notes="Outright: cannot be hired even on current OPT.",
    ),
]

GREEN_CASES = [c for c in CASES if c.verdict == "green"]
YELLOW_CASES = [c for c in CASES if c.verdict == "yellow"]
RED_CASES = [c for c in CASES if c.verdict == "red"]
