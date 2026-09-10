import { useDraggable } from "@dnd-kit/core";
import DeadlineBadge from "./DeadlineBadge.jsx";

// Deeper than the pastel badge fills, which are almost invisible as a 4px rule.
const VERDICT_BORDER = {
  green: "border-l-emerald-300",
  yellow: "border-l-yellow-300",
  red: "border-l-red-300",
};

const VERDICT_DOT = {
  green: "bg-accent-dot",
  yellow: "bg-yellow-500",
  red: "bg-red-500",
};

const BASE =
  "rounded-xl border-2 border-l-4 border-gray-200 bg-white p-3 shadow-sm";

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
      <h3 className="text-body font-semibold leading-snug text-gray-900">
        {title}
      </h3>
      <p className="mt-0.5 text-label text-gray-500">{company}</p>
      <div className="mt-2 flex items-center gap-2">
        <span
          aria-hidden
          className={
            "h-2 w-2 shrink-0 rounded-full " +
            (VERDICT_DOT[card.verdict] ?? VERDICT_DOT.yellow)
          }
        />
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

  const title = card.position_title || "Untitled role";
  const company = card.company_name || "Unknown company";

  return (
    <CardFace
      card={card}
      ref={setNodeRef}
      // Drag with the pointer; open with click or Enter.
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
        "cursor-grab touch-none transition-shadow hover:shadow-md active:cursor-grabbing " +
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40" +
        (isDragging ? " opacity-40" : "") +
        (highlighted ? " ring-2 ring-accent/50" : "")
      }
    />
  );
}
