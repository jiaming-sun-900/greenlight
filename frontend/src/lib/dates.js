// Deadline helpers.
//
// Cards store deadlines as ISO date strings ("YYYY-MM-DD") so they round-trip
// cleanly through <input type="date">. The model is asked for that format too,
// but it sometimes returns prose ("October 15, 2026"), so everything entering
// the app goes through toISODate first.

/** Normalize an arbitrary date-ish string to "YYYY-MM-DD", or "" if unusable. */
export function toISODate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  // Already ISO: return as-is. Parsing it would shift the day in negative-UTC
  // timezones, since bare ISO dates are parsed as UTC midnight.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Parse "YYYY-MM-DD" as local midnight, or null. */
function parseLocal(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso ?? "").trim());
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3])
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days from today until the deadline. Negative means past. null if no deadline. */
export function daysUntil(iso) {
  const target = parseLocal(iso);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86_400_000);
}

/** Short human date for display, e.g. "Oct 15, 2026". */
export function formatDeadline(iso) {
  const date = parseLocal(iso);
  if (!date) return "";
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
