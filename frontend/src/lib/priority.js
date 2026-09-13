// Application priority: how a posting ranks against the others competing for the
// same application. The verdict says whether the door is open; the priority says
// whether it is worth the walk.
//
// Most postings land on yellow, because most postings genuinely say nothing about
// sponsorship. Priority is what separates "the employer named OPT/CPT and left one
// question open" from "the posting is silent", which the badge alone cannot do.
//
// The backend derives this and sends it on `priority`. The copy below exists for
// cards saved before the field existed; backend/main.py is the source of truth, and
// the two must be changed together.

const SIGNAL_BEARING_YELLOW = new Set([
  "optcpt_future_unstated",
  "vague_conditional",
  "contradictory",
]);

export const PRIORITIES = ["A", "B", "C", "D"];

export const PRIORITY_META = {
  A: {
    label: "Apply",
    blurb: "Both questions answered. Spend an application here.",
    chip: "bg-[#d1fae5] text-emerald-900",
  },
  B: {
    label: "Ask first",
    blurb: "A real signal, and one question would resolve it.",
    chip: "bg-[#fef9c3] text-yellow-900",
  },
  C: {
    label: "Low signal",
    blurb: "Nothing to go on, or a role with a known end date.",
    chip: "bg-gray-100 text-gray-700",
  },
  D: {
    label: "Skip",
    blurb: "Excluded outright. Your application is better spent elsewhere.",
    chip: "bg-[#fee2e2] text-red-900",
  },
};

/** Derive priority from a verdict and its sub-reason tags. Mirrors backend/main.py. */
export function derivePriority(verdict, reasons) {
  const tags = new Set(
    (Array.isArray(reasons) ? reasons : [])
      .map((reason) => reason && reason.tag)
      .filter(Boolean)
  );
  if (verdict === "green") return "A";
  if (verdict === "yellow") {
    for (const tag of tags) if (SIGNAL_BEARING_YELLOW.has(tag)) return "B";
    return "C";
  }
  // Red splits: a role you can hold until OPT runs out is not a closed door.
  return tags.size === 1 && tags.has("no_future_sponsorship_only") ? "C" : "D";
}

/** Sort comparator: best priority first, newest first within a priority. */
export function byPriorityThenRecent(a, b) {
  const rank = PRIORITIES.indexOf(a.priority) - PRIORITIES.indexOf(b.priority);
  return rank !== 0 ? rank : b.created_at.localeCompare(a.created_at);
}
