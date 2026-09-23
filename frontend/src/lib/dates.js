// Deadline helpers.
//
// Cards store deadlines as ISO date strings ("YYYY-MM-DD") so they round-trip
// cleanly through <input type="date">. The model is asked for that format too,
// but it sometimes returns prose ("October 15, 2026"), so everything entering
// the app goes through toISODate first.

/** Split "YYYY-MM-DD" into numbers, or null if the shape is wrong. */
function isoParts(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * Parse "YYYY-MM-DD" as local midnight, or null.
 *
 * The component check is the point of this function, not a formality. The Date
 * constructor rolls impossible dates over instead of rejecting them, so a
 * hallucinated "2026-13-45" would otherwise silently become a real, confident,
 * wrong "Feb 14, 2027" on a card.
 */
function parseLocal(iso) {
  const parts = isoParts(iso);
  if (!parts) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  const rolledOver =
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day;
  return rolledOver ? null : date;
}

/** True if the string is a real calendar date in "YYYY-MM-DD" form. */
export function isISODate(value) {
  return parseLocal(value) !== null;
}

/** Normalize an arbitrary date-ish string to "YYYY-MM-DD", or "" if unusable. */
export function toISODate(value) {
  if (!value) return "";
  const raw = String(value).trim();
  if (!raw) return "";
  // Already ISO: keep it verbatim rather than reparsing, which would shift the
  // day in negative-UTC timezones since bare ISO dates are parsed as UTC
  // midnight. An impossible date is dropped rather than rolled over.
  if (isoParts(raw)) return isISODate(raw) ? raw : "";

  // A UTC-suffixed timestamp names a calendar day in UTC, so read its parts in
  // UTC too. Reading them locally lands a day early anywhere west of Greenwich.
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const utc = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const year = utc ? parsed.getUTCFullYear() : parsed.getFullYear();
  const month = (utc ? parsed.getUTCMonth() : parsed.getMonth()) + 1;
  const day = utc ? parsed.getUTCDate() : parsed.getDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
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
