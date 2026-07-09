const VERDICT_STYLES = {
  green: {
    label: "Greenlight",
    dot: "bg-emerald-500",
    bg: "bg-[#d1fae5]",
    text: "text-emerald-900",
  },
  yellow: {
    label: "Yellow",
    dot: "bg-yellow-500",
    bg: "bg-[#fef9c3]",
    text: "text-yellow-900",
  },
  red: {
    label: "Red",
    dot: "bg-red-500",
    bg: "bg-[#fee2e2]",
    text: "text-red-900",
  },
};

export default function VerdictBadge({ verdict }) {
  const style = VERDICT_STYLES[verdict] ?? VERDICT_STYLES.yellow;
  return (
    <span
      className={
        "inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-body font-semibold " +
        style.bg +
        " " +
        style.text
      }
    >
      <span aria-hidden className={"h-2 w-2 rounded-full " + style.dot} />
      {style.label}
    </span>
  );
}
