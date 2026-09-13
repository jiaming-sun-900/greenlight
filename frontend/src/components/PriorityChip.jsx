import { PRIORITY_META } from "../lib/priority.js";

/**
 * Application priority, shown next to the verdict. The verdict is about the
 * posting; this is about where it sits in your queue.
 */
export default function PriorityChip({ priority, showLabel = true }) {
  const meta = PRIORITY_META[priority];
  if (!meta) return null;

  return (
    <span
      title={meta.blurb}
      className={
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-micro font-medium " +
        meta.chip
      }
    >
      <span className="tabular-nums">{priority}</span>
      {showLabel && <span>{meta.label}</span>}
    </span>
  );
}
