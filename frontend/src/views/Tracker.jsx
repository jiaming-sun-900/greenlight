import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import CardModal from "../components/CardModal.jsx";
import JobCard, { CardFace } from "../components/JobCard.jsx";
import ViewShell from "../components/ViewShell.jsx";
import { COLUMNS, COLUMN_IDS } from "../hooks/useCards.js";
import { byPriorityThenRecent } from "../lib/priority.js";

function Column({ column, cards, onOpenCard, highlightId }) {
  // The whole column is the drop target, header included. With the ref on the
  // inner list only, releasing a card over a column's title gave the neighbour
  // more overlap, so drops near the top of the board landed in the wrong place.
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      ref={setNodeRef}
      aria-label={column.label}
      className={
        "flex min-h-[22rem] w-72 shrink-0 flex-col rounded-2xl border-2 bg-surface shadow-sm transition-colors md:min-h-0 " +
        (isOver ? "border-accent/40" : "border-border")
      }
    >
      <header className="shrink-0 border-b-2 border-border-soft px-5 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-title font-semibold text-ink">{column.label}</h2>
          <span className="text-micro tabular-nums text-muted">
            {cards.length}
          </span>
        </div>
        <p className="mt-0.5 text-label text-muted">{column.hint}</p>
      </header>

      <div
        className={
          "min-h-0 flex-1 space-y-3 overflow-y-auto p-3 transition-colors " +
          (isOver ? "bg-accent-soft/50" : "")
        }
      >
        {cards.length === 0 ? (
          <p className="px-2 py-8 text-center text-label text-muted">
            {isOver ? "Drop here" : "Nothing here yet"}
          </p>
        ) : (
          cards.map((card) => (
            <JobCard
              key={card.id}
              card={card}
              highlighted={card.id === highlightId}
              onOpen={() => onOpenCard(card.id)}
            />
          ))
        )}
      </div>
    </section>
  );
}

function EmptyBoard({ onNavigateToScreener }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 py-16 text-center">
      <span aria-hidden className="icon-lg">
        🗂️
      </span>
      <h2 className="text-title font-semibold text-ink">
        No applications tracked yet
      </h2>
      <p className="max-w-sm text-body text-muted">
        Screen a job posting, review the analysis, then add it to your tracker to
        start following it through to an offer.
      </p>
      <button
        type="button"
        onClick={onNavigateToScreener}
        className="btn-accent btn-pill focus-ring mt-2 text-white"
      >
        Screen a job posting
      </button>
    </div>
  );
}

const SORTS = [
  { id: "priority", label: "Priority" },
  { id: "recent", label: "Newest" },
];

/**
 * Reorders cards within every column. Stages are set by dragging, not by sort.
 *
 * Sits above the board rather than in the title row: it only appears once there
 * is more than one card, and inside the title row that made the row taller than
 * the screener's and shifted the view toggle down on every switch.
 */
function SortToggle({ value, onChange }) {
  return (
    <div className="mb-3 flex shrink-0 items-center gap-2">
      <span className="text-label font-medium uppercase tracking-wide text-muted">
        Sort
      </span>
      <div className="flex items-center gap-1">
        {SORTS.map((sort) => {
          const isActive = value === sort.id;
          return (
            <button
              key={sort.id}
              type="button"
              onClick={() => onChange(sort.id)}
              aria-pressed={isActive}
              className={
                "focus-ring rounded-full px-3 py-1 text-label font-medium transition-colors " +
                (isActive
                  ? "bg-selected text-ink"
                  : "text-muted hover:bg-hover hover:text-ink")
              }
            >
              {sort.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function Tracker({
  nav,
  cards,
  sortBy,
  onSortChange,
  onUpdateCard,
  onDeleteCard,
  onMoveCard,
  onNavigateToScreener,
  highlightId,
  onHighlightShown,
}) {
  const [openId, setOpenId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  // A click must not be read as a drag, or cards could never be opened. Touch
  // gets its own sensor with a hold delay instead: the pointer sensor would
  // need `touch-action: none` on every card, which makes a card an island a
  // finger cannot scroll the column by.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    })
  );

  // Fade the "just added" ring after a beat. The cleanup also clears the id, so
  // switching views inside those 2.5s does not leave a stale highlight waiting
  // to fire the next time the board is opened.
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(onHighlightShown, 2500);
    return () => {
      clearTimeout(timer);
      onHighlightShown();
    };
  }, [highlightId, onHighlightShown]);

  const byColumn = useMemo(() => {
    const groups = Object.fromEntries(COLUMN_IDS.map((id) => [id, []]));
    for (const card of cards) groups[card.column].push(card);
    // Priority first answers "where does my next application go", which is the
    // question a full board is actually asking. Newest first keeps a card you
    // just added where you can see it. Both tie-break on recency.
    for (const id of COLUMN_IDS) {
      groups[id].sort(
        sortBy === "priority"
          ? byPriorityThenRecent
          : (a, b) => b.created_at.localeCompare(a.created_at)
      );
    }
    return groups;
  }, [cards, sortBy]);

  const openCard = cards.find((card) => card.id === openId) ?? null;
  const draggingCard = cards.find((card) => card.id === draggingId) ?? null;

  function handleDragEnd(event) {
    setDraggingId(null);
    const { active, over } = event;
    if (!over || !COLUMN_IDS.includes(over.id)) return;
    // Dropping a card back where it started is not a move. Treating it as one
    // rewrites every card object and rewrites localStorage for no change.
    const card = cards.find((c) => c.id === active.id);
    if (!card || card.column === over.id) return;
    onMoveCard(active.id, over.id);
  }

  return (
    <ViewShell
      nav={nav}
      title="Application Tracker"
      subtitle={
        cards.length === 0
          ? "Screened jobs you save will show up here."
          : `${cards.length} tracked ${
              cards.length === 1 ? "application" : "applications"
            }. Drag a card between stages, or click it to edit.`
      }
    >
      {cards.length === 0 ? (
        <EmptyBoard onNavigateToScreener={onNavigateToScreener} />
      ) : (
        <>
          {cards.length > 1 && (
            <SortToggle value={sortBy} onChange={onSortChange} />
          )}
          <DndContext
            sensors={sensors}
            onDragStart={(event) => setDraggingId(event.active.id)}
            onDragCancel={() => setDraggingId(null)}
            onDragEnd={handleDragEnd}
          >
            {/* The board does not reflow: columns keep their width and the row
                scrolls sideways, which is what makes a five-stage Kanban usable
                on a phone. Momentum scrolling only, no snap points, since snap
                fights a drag in progress. */}
            <div className="overflow-x-auto overscroll-x-contain pb-2 md:min-h-0 md:flex-1">
              <div className="flex min-w-max gap-4 md:h-full">
                {COLUMNS.map((column) => (
                  <Column
                    key={column.id}
                    column={column}
                    cards={byColumn[column.id]}
                    highlightId={highlightId}
                    onOpenCard={setOpenId}
                  />
                ))}
              </div>
            </div>

            <DragOverlay dropAnimation={null}>
              {draggingCard ? (
                <CardFace card={draggingCard} className="w-72 rotate-1 shadow-lg" />
              ) : null}
            </DragOverlay>
          </DndContext>
        </>
      )}

      {openCard && (
        <CardModal
          card={openCard}
          onChange={(next) => onUpdateCard(openCard.id, next)}
          onMove={(column) => onMoveCard(openCard.id, column)}
          onDelete={() => {
            onDeleteCard(openCard.id);
            setOpenId(null);
          }}
          onClose={() => setOpenId(null)}
        />
      )}
    </ViewShell>
  );
}
