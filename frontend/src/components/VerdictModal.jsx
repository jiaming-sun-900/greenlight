import { useEffect } from "react";
import VerdictBadge from "./VerdictBadge.jsx";

// Human-readable labels for the tiered sub-reason tags returned by the backend.
const TAG_LABELS = {
  explicit_optcpt: "Explicit OPT/CPT acceptance",
  explicit_h1b_sponsor: "Explicit H-1B / visa sponsorship",
  optcpt_overrides_generic:
    "Explicit OPT/CPT overrides generic work-authorization language",
  generic_authorization_only: "Generic work-authorization requirement only",
  silent_no_signal: "No visa-related language in the posting",
  vague_conditional: "Conditional / non-committal sponsorship",
  contradictory: "Contradictory signals in the posting",
  optcpt_future_unstated: "OPT/CPT accepted, nothing said about after",
  citizens_only: "US citizens / permanent residents only",
  no_sponsorship_now_or_future: "No sponsorship now or in the future",
  explicit_no_visa: "Cannot accommodate visa holders at all",
  no_future_sponsorship_only: "No sponsorship path after your OPT ends",
};

// Extra context for the tags where "can I be hired now" and "is there a path
// after OPT" pull in different directions. Most tags speak for themselves and
// are deliberately left out.
const TAG_NOTES = {
  optcpt_future_unstated:
    "You can be hired on OPT. The posting does not say whether the employer would sponsor an H-1B once it expires, so ask before you invest in the interview process.",
  no_future_sponsorship_only:
    "You can usually still be hired on OPT or STEM OPT. What is missing is the path after that, so treat this as a role with a time limit rather than a closed door.",
  explicit_no_visa:
    "This one is a closed door: the posting rules out visa holders outright, not just future sponsorship.",
};

function labelForTag(tag) {
  return TAG_LABELS[tag] || tag;
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
                    <div className="mt-1 text-body text-ink">
                      Detected:{" "}
                      <span className="italic text-ink">
                        “{reason.detected_phrase}”
                      </span>
                    </div>
                  ) : (
                    <div className="mt-1 text-body text-muted">
                      No visa, sponsorship, or work-authorization language found.
                    </div>
                  )}
                  {TAG_NOTES[reason.tag] && (
                    <p className="mt-2 text-label text-muted">
                      {TAG_NOTES[reason.tag]}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
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
