import { useEffect, useState } from "react";
import JobDetailFields, { PlainField } from "./JobFields.jsx";
import VerdictBadge from "./VerdictBadge.jsx";
import VerdictModal from "./VerdictModal.jsx";
import { COLUMNS } from "../hooks/useCards.js";

/**
 * Expanded card view. Edits are written straight through to the store, so
 * everything is already persisted by the time the modal closes.
 */
export default function CardModal({ card, onChange, onMove, onDelete, onClose }) {
  const [showReasons, setShowReasons] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    function onKeyDown(event) {
      if (event.key !== "Escape") return;
      // Escape peels one layer at a time.
      if (showReasons) setShowReasons(false);
      else if (confirmingDelete) setConfirmingDelete(false);
      else onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [showReasons, confirmingDelete, onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 px-4 py-6"
      onClick={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={card.position_title || "Job details"}
        className="flex max-h-full w-full max-w-lg flex-col rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          {/* Title and company are the modal's heading, so they are edited here
              rather than in the field list below. The negative margin pulls the
              inputs' own padding back so they align with the badge underneath. */}
          <div className="min-w-0 flex-1">
            <div className="-mx-2">
              <PlainField
                label="Position title"
                value={card.position_title}
                onChange={(next) => onChange({ ...card, position_title: next })}
                placeholder="Untitled role"
                className="text-title font-semibold text-gray-900"
              />
              <PlainField
                label="Company name"
                value={card.company_name}
                onChange={(next) => onChange({ ...card, company_name: next })}
                placeholder="Unknown company"
                className="text-label text-gray-500"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <VerdictBadge verdict={card.verdict} />
              <button
                type="button"
                onClick={() => setShowReasons(true)}
                className="text-body font-medium text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
              >
                Why this verdict?
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
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

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-4">
            <label className="block px-2 text-label font-medium uppercase tracking-wide text-gray-400">
              Stage
            </label>
            <select
              value={card.column}
              onChange={(event) => onMove(event.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-body text-gray-900 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
            >
              {COLUMNS.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.label}
                </option>
              ))}
            </select>
          </div>

          <JobDetailFields
            value={card}
            onChange={onChange}
            showNotes
            showIdentity={false}
          />
        </div>

        <div className="shrink-0 border-t border-gray-100 px-5 py-4">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-label text-gray-600">
                Delete this card permanently?
              </p>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-lg px-3 py-2 text-body font-medium text-gray-600 transition-colors hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="rounded-lg bg-red-600 px-3 py-2 text-body font-medium text-white transition-colors hover:bg-red-700"
              >
                Delete
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="rounded-lg px-3 py-2.5 text-body font-medium text-red-600 transition-colors hover:bg-red-50"
              >
                Delete card
              </button>
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg bg-accent px-4 py-2.5 text-body font-medium text-white transition-colors hover:bg-accent-hover"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>

      {showReasons && (
        // Wrapper keeps backdrop clicks inside the verdict modal from also
        // bubbling up and closing this card modal.
        <div onClick={(event) => event.stopPropagation()} role="presentation">
          <VerdictModal
            verdict={card.verdict}
            reasons={card.verdict_reasons}
            onClose={() => setShowReasons(false)}
          />
        </div>
      )}
    </div>
  );
}
