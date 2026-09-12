import { useEffect, useState } from "react";
import VerdictBadge from "./VerdictBadge.jsx";

// One entry per sub-reason tag returned by the backend.
//   label   - what was found, as a heading
//   meaning - what it actually implies for an F-1 candidate
//   next    - the one thing worth doing about it
// Keep in lockstep with TAGS_BY_VERDICT in backend/main.py.
const VERDICT_SUMMARY = {
  green:
    "This posting is friendly to your status. Both questions that matter are answered: you can be hired now, and the role does not leave a sponsorship gap.",
  yellow:
    "This posting does not rule you out, and it does not commit either. One question is still unanswered, so find out before a long interview process.",
  red: "This posting works against your status. Read the detail below, because a hard exclusion and a missing future path are not the same thing.",
};

// Tags where the honest next step is to ask the employer rather than guess.
const ASK_TAGS = new Set([
  "generic_authorization_only",
  "silent_no_signal",
  "vague_conditional",
  "contradictory",
  "optcpt_future_unstated",
  "no_future_sponsorship_only",
]);

// Separates the two questions and pins the ask to this requisition, which is
// what gets a usable answer instead of "the company has sponsored before".
const RECRUITER_SCRIPT =
  "I am currently authorized to work in the U.S. under F-1 OPT and expect to be eligible for the STEM OPT extension. To continue employment beyond that period, I would require employer sponsorship. Does this specific role consider candidates who may need future sponsorship?";

const TAGS = {
  explicit_optcpt: {
    label: "Explicit OPT/CPT acceptance",
    meaning:
      "The posting names OPT, CPT, or F-1 status as accepted, and the role ends inside that work-authorization window, so no later sponsorship is needed.",
    next: "Apply. Your status is already covered for the length of this role.",
  },
  explicit_h1b_sponsor: {
    label: "Explicit H-1B / visa sponsorship",
    meaning:
      "The employer states it will sponsor an H-1B or another work visa for this role. That answers both the now and the after-OPT question.",
    next: "Apply. Get the commitment restated in writing once you reach an offer.",
  },
  optcpt_overrides_generic: {
    label: "OPT/CPT overrides generic work-authorization language",
    meaning:
      'The posting asks for "US work authorization" but also names OPT or CPT, and the specific mention wins over the boilerplate.',
    next: "Do not let the generic phrase put you off. It is not an exclusion.",
  },
  generic_authorization_only: {
    label: "Generic work-authorization requirement only",
    meaning:
      'The posting requires "authorized to work in the US" and stops there. On OPT you are authorized, so this neither includes nor excludes you.',
    next: "Ask the recruiter whether this role considers candidates who need future sponsorship.",
  },
  silent_no_signal: {
    label: "No visa-related language in the posting",
    meaning:
      "Nothing anywhere about visa status, sponsorship, or work authorization. That is genuinely no signal, not a quiet no.",
    next: "Worth applying, but confirm sponsorship before you invest in a long interview loop.",
  },
  vague_conditional: {
    label: "Conditional, non-committal sponsorship",
    meaning:
      'Sponsorship is offered as a possibility rather than a commitment: "for exceptional candidates", "case by case". That is not a promise.',
    next: "Ask what the bar actually is, and whether anyone in this role has been sponsored.",
  },
  contradictory: {
    label: "Contradictory signals in the posting",
    meaning:
      "Different parts of the posting disagree, often a job-board filter tag against the body text. One of them is wrong.",
    next: "Trust the body text over the tag, and ask the recruiter which one holds.",
  },
  optcpt_future_unstated: {
    label: "OPT/CPT accepted, nothing said about after",
    meaning:
      "You can be hired on OPT or STEM OPT. The posting never says whether the employer would sponsor an H-1B once that expires, and this is a full-time role where that eventually matters.",
    next: "Ask before the process gets long: does this specific role consider candidates who may need future sponsorship?",
  },
  citizens_only: {
    label: "US citizens / permanent residents only",
    meaning:
      "The posting requires citizenship or a green card. Often a government, defense, or cleared-contract requirement, which is rarely negotiable.",
    next: "Skip this one. Your OPT does not satisfy the requirement.",
  },
  no_sponsorship_now_or_future: {
    label: "No sponsorship now or in the future",
    meaning:
      'The "now or in the future" wording rules out anyone who will ever need sponsorship, which includes you even while your OPT is valid.',
    next: "Skip this one. This is the phrasing that closes the door hardest.",
  },
  explicit_no_visa: {
    label: "Cannot accommodate visa holders at all",
    meaning:
      "The posting rules out visa holders outright, not just future sponsorship. You could not be hired even on current OPT.",
    next: "Skip this one.",
  },
  no_future_sponsorship_only: {
    label: "No sponsorship path after your OPT ends",
    meaning:
      "The refusal is scoped to now or to this role, not to you personally. You can usually still be hired on OPT or STEM OPT. What is missing is what happens when that runs out.",
    next: "Treat it as a role with a time limit. Worth it for the experience, not as a long-term bet.",
  },
};

function labelForTag(tag) {
  return TAGS[tag]?.label || tag;
}

function RecruiterAsk() {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(RECRUITER_SCRIPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard blocked (insecure context or denied permission): the text is
      // on screen and selectable, so there is nothing to recover from.
    }
  }

  return (
    <div className="mt-4 rounded-lg border-2 border-gray-100 px-3.5 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-body font-medium text-ink">Ask before you invest</h3>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-md px-2 py-1 text-label font-medium text-muted transition-colors hover:bg-gray-100 hover:text-ink"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 text-label text-muted">
        Send this at the recruiter screen, not at the final round. It states
        where you stand now, what you will need later, and asks about this role
        rather than the company.
      </p>
      <p className="mt-2 text-label italic text-ink">{RECRUITER_SCRIPT}</p>
    </div>
  );
}

export default function VerdictModal({ verdict, reasons, onClose }) {
  // Close on Escape.
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const list = Array.isArray(reasons) ? reasons : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Why this verdict?"
        className="w-full max-w-md rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b-2 border-gray-100 px-5 py-4">
          <h2 className="text-title font-semibold text-ink">Why this verdict?</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-muted transition-colors hover:bg-gray-100 hover:text-ink"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path
                d="M4 4l8 8M12 4l-8 8"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>

        <div className="px-5 py-5">
          <div className="mb-4">
            <VerdictBadge verdict={verdict} />
            <p className="mt-2 text-body text-ink">{VERDICT_SUMMARY[verdict]}</p>
          </div>

          {list.length === 0 ? (
            <p className="text-body text-muted">
              No specific signals were recorded for this verdict.
            </p>
          ) : (
            <ul className="space-y-3">
              {list.map((reason, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-gray-100 bg-gray-50 px-3.5 py-3"
                >
                  <div className="text-body font-medium text-ink">
                    {labelForTag(reason.tag)}
                  </div>
                  {reason.detected_phrase ? (
                    <blockquote className="mt-1.5 border-l-2 border-gray-200 pl-2.5 text-body italic text-ink">
                      “{reason.detected_phrase}”
                    </blockquote>
                  ) : (
                    <p className="mt-1.5 text-body text-muted">
                      No visa, sponsorship, or work-authorization language found
                      anywhere in the posting.
                    </p>
                  )}
                  {TAGS[reason.tag] && (
                    <>
                      <p className="mt-2 text-label text-muted">
                        {TAGS[reason.tag].meaning}
                      </p>
                      <p className="mt-1.5 text-label font-medium text-ink">
                        {TAGS[reason.tag].next}
                      </p>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {list.some((reason) => ASK_TAGS.has(reason.tag)) && <RecruiterAsk />}
        </div>

        <div className="border-t-2 border-gray-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full btn-accent rounded-lg px-4 py-2.5 text-body font-medium text-white"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
