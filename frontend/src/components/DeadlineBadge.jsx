import { daysUntil, formatDeadline } from "../lib/dates.js";

function Chip({ className, children }) {
  return (
    <span
      className={
        "inline-flex items-center rounded-full px-2 py-0.5 text-label font-medium " +
        className
      }
    >
      {children}
    </span>
  );
}

/**
 * Deadline state on a card front face:
 *   past      -> grey "Closed"
 *   0-3 days  -> orange countdown
 *   further   -> muted date, so a deadline is never invisible
 */
export default function DeadlineBadge({ deadline }) {
  const days = daysUntil(deadline);
  if (days === null) return null;

  if (days < 0) {
    return <Chip className="bg-gray-100 text-gray-500">Closed</Chip>;
  }
  if (days === 0) {
    return <Chip className="bg-orange-100 text-orange-800">Due today</Chip>;
  }
  if (days <= 3) {
    return (
      <Chip className="bg-orange-100 text-orange-800">
        {days} day{days === 1 ? "" : "s"} left
      </Chip>
    );
  }
  return (
    <Chip className="bg-gray-50 text-gray-500">{formatDeadline(deadline)}</Chip>
  );
}
