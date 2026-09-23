const VERDICT_STYLES = {
  green: {
    label: "Greenlight",
    dot: "bg-accent-dot",
    bg: "bg-accent-soft",
    text: "text-good-fg",
  },
  yellow: {
    label: "Yellow",
    dot: "bg-dot-yellow",
    bg: "bg-warn-bg",
    text: "text-warn-fg",
  },
  red: {
    label: "Red",
    dot: "bg-dot-red",
    bg: "bg-bad-bg",
    text: "text-bad-fg",
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
