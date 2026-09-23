import { useEffect, useRef } from "react";
import { useDraggable } from "@dnd-kit/core";
import DeadlineBadge from "./DeadlineBadge.jsx";
import PriorityChip from "./PriorityChip.jsx";

// Deeper than the pastel badge fills, which are almost invisible as a 4px rule.
const VERDICT_BORDER = {
  green: "border-l-edge-green",
  yellow: "border-l-edge-yellow",
  red: "border-l-edge-red",
};

const VERDICT_DOT = {
  green: "bg-accent-dot",
  yellow: "bg-dot-yellow",
  red: "bg-dot-red",
};

const BASE =
  "rounded-xl border-2 border-l-4 border-border bg-surface p-3 shadow-sm";

/**
 * Card front face with no drag wiring, so the drag overlay can reuse it without
 * registering a second draggable under the same id.
 */
export function CardFace({ card, className = "", ...rest }) {
  const title = card.position_title || "Untitled role";
  const company = card.company_name || "Unknown company";

  return (
    <article
      className={
        BASE +
        " " +
        (VERDICT_BORDER[card.verdict] ?? VERDICT_BORDER.yellow) +
        " " +
        className
      }
      {...rest}
    >
      <h3 className="text-body font-semibold leading-snug text-ink">{title}</h3>
      <p className="mt-0.5 text-label text-muted">{company}</p>
      <div className="mt-2 flex items-center gap-2">
        <span
          aria-hidden
          className={
            "h-2 w-2 shrink-0 rounded-full " +
            (VERDICT_DOT[card.verdict] ?? VERDICT_DOT.yellow)
          }
        />
        <PriorityChip priority={card.priority} showLabel={false} />
        <DeadlineBadge deadline={card.deadline} />
      </div>
    </article>
  );
}

export default function JobCard({ card, onOpen, highlighted = false }) {
  // `attributes` is intentionally not spread onto the card: its role/tabIndex
  // would fight the click-to-open behavior below.
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
  });
  const node = useRef(null);

  // Under the default priority sort a freshly added C or D card lands at the
  // bottom of a long column, so the ring meant to point it out animates
  // entirely off screen.
  useEffect(() => {
    if (!highlighted) return;
    node.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [highlighted]);

  const title = card.position_title || "Untitled role";
  const company = card.company_name || "Unknown company";

  return (
    <CardFace
      card={card}
      ref={(el) => {
        node.current = el;
        setNodeRef(el);
      }}
      // Drag with the pointer; open with click or Enter. `touch-manipulation`
      // rather than `touch-none`: the touch sensor activates on a hold, so a
      // plain swipe still has to reach the column underneath and scroll it.
      {...listeners}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
          : undefined
      }
      role="button"
      tabIndex={0}
      aria-label={`${title} at ${company}. Open details.`}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={
        "focus-ring cursor-grab touch-manipulation transition-shadow hover:shadow-md active:cursor-grabbing" +
        (isDragging ? " opacity-40" : "") +
        (highlighted ? " ring-2 ring-accent/50" : "")
      }
    />
  );
}
