import { useCallback, useId, useState } from "react";
import JobDetailFields, { PlainField } from "./JobFields.jsx";
import PriorityChip from "./PriorityChip.jsx";
import VerdictBadge from "./VerdictBadge.jsx";
import VerdictModal from "./VerdictModal.jsx";
import CloseGlyph from "./CloseGlyph.jsx";
import useDialog from "../hooks/useDialog.js";
import { COLUMNS } from "../hooks/useCards.js";

/**
 * Expanded card view. Edits are written straight through to the store, so
 * everything is already persisted by the time the modal closes.
 */
export default function CardModal({ card, onChange, onMove, onDelete, onClose }) {
  const [showReasons, setShowReasons] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const stageId = useId();

  // Escape peels one layer at a time. The verdict modal handles its own layer,
  // so this one only sees Escape while that modal is closed.
  const onEscape = useCallback(() => {
    if (confirmingDelete) setConfirmingDelete(false);
    else onClose();
  }, [confirmingDelete, onClose]);

  const { ref, backdropProps } = useDialog({
    onClose,
    onEscape,
    active: !showReasons,
  });

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-overlay px-4 py-6"
      {...backdropProps}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={card.position_title || "Job details"}
        className="flex max-h-full w-full max-w-lg flex-col rounded-2xl bg-surface shadow-xl focus:outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b-2 border-border-soft px-5 py-4">
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
                className="text-title font-semibold text-ink"
              />
              <PlainField
                label="Company name"
                value={card.company_name}
                onChange={(next) => onChange({ ...card, company_name: next })}
                placeholder="Unknown company"
                className="text-label text-muted"
              />
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <VerdictBadge verdict={card.verdict} />
                <PriorityChip priority={card.priority} />
              </div>
              <button
                type="button"
                onClick={() => setShowReasons(true)}
                className="focus-ring rounded-md text-body font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
              >
                Why this verdict?
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="focus-ring shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-hover hover:text-ink"
          >
            <CloseGlyph />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          <div className="mb-4">
            {/* `htmlFor` rather than a wrapping label: without it this select,
                the only keyboard route between stages, announces as an
                unnamed combo box. */}
            <label
              htmlFor={stageId}
              className="block px-2 text-label font-medium uppercase tracking-wide text-muted"
            >
              Stage
            </label>
            <select
              id={stageId}
              value={card.column}
              onChange={(event) => onMove(event.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-body text-ink focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
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

        {/* Both states use the same button height, so the footer does not
            change size at the moment the user is asked to confirm a delete. */}
        <div className="shrink-0 border-t-2 border-border-soft px-5 py-4">
          {confirmingDelete ? (
            <div className="flex items-center gap-2">
              <p className="flex-1 text-body text-ink">
                Delete this card permanently?
              </p>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="btn-block focus-ring text-ink transition-colors hover:bg-hover"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onDelete}
                className="btn-block focus-ring bg-danger-fill text-white transition-colors hover:bg-danger-fill-hover"
              >
                Delete
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmingDelete(true)}
                className="btn-block focus-ring text-danger transition-colors hover:bg-danger-soft"
              >
                Delete card
              </button>
              <button
                type="button"
                onClick={onClose}
                className="btn-accent btn-block focus-ring flex-1 text-on-accent"
              >
                Close
              </button>
            </div>
          )}
        </div>
      </div>

      {showReasons && (
        // This sits inside the card modal's backdrop, but that backdrop only
        // closes when both ends of the press land on itself, and the verdict
        // modal's own backdrop covers it, so a press in there cannot close
        // this one by accident.
        <VerdictModal
          verdict={card.verdict}
          reasons={card.verdict_reasons}
          onClose={() => setShowReasons(false)}
        />
      )}
    </div>
  );
}
