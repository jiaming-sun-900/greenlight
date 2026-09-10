import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import CardModal from "../components/CardModal.jsx";
import JobCard, { CardFace } from "../components/JobCard.jsx";
import ViewToggle from "../components/ViewToggle.jsx";
import { COLUMNS, COLUMN_IDS } from "../hooks/useCards.js";

function Column({ column, cards, onOpenCard, highlightId }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <section
      aria-label={column.label}
      className="flex w-72 shrink-0 flex-col rounded-2xl border border-gray-200 bg-white/70"
    >
      <header className="shrink-0 border-b border-gray-100 px-4 py-3">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-title font-semibold text-gray-800">
            {column.label}
          </h2>
          <span className="text-micro tabular-nums text-gray-400">
            {cards.length}
          </span>
        </div>
        <p className="mt-0.5 text-label text-gray-400">{column.hint}</p>
      </header>

      <div
        ref={setNodeRef}
        className={
          "min-h-0 flex-1 space-y-3 overflow-y-auto p-3 transition-colors " +
          (isOver ? "bg-accent-soft/50" : "")
        }
      >
        {cards.length === 0 ? (
          <p className="px-2 py-8 text-center text-label text-gray-300">
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
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
      <span aria-hidden className="icon-lg">
        🗂️
      </span>
      <h2 className="text-title font-semibold text-gray-800">
        No applications tracked yet
      </h2>
      <p className="max-w-sm text-body text-gray-500">
        Screen a job posting, review the analysis, then add it to your tracker to
        start following it through to an offer.
      </p>
      <button
        type="button"
        onClick={onNavigateToScreener}
        className="mt-2 rounded-full bg-accent px-6 py-2.5 text-body font-medium text-white shadow-sm transition-colors hover:bg-accent-hover"
      >
        Screen a job posting
      </button>
    </div>
  );
}

export default function Tracker({
  nav,
  cards,
  onUpdateCard,
  onDeleteCard,
  onMoveCard,
  onNavigateToScreener,
  highlightId,
  onHighlightShown,
}) {
  const [openId, setOpenId] = useState(null);
  const [draggingId, setDraggingId] = useState(null);

  // A click must not be read as a drag, or cards could never be opened.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  // Fade the "just added" ring after a beat.
  useEffect(() => {
    if (!highlightId) return;
    const timer = setTimeout(onHighlightShown, 2500);
    return () => clearTimeout(timer);
  }, [highlightId, onHighlightShown]);

  const byColumn = useMemo(() => {
    const groups = Object.fromEntries(COLUMN_IDS.map((id) => [id, []]));
    for (const card of cards) groups[card.column].push(card);
    // Newest first, so a freshly added card lands where you can see it.
    for (const id of COLUMN_IDS) {
      groups[id].sort((a, b) => b.created_at.localeCompare(a.created_at));
    }
    return groups;
  }, [cards]);

  const openCard = cards.find((card) => card.id === openId) ?? null;
  const draggingCard = cards.find((card) => card.id === draggingId) ?? null;

  function handleDragEnd(event) {
    setDraggingId(null);
    const { active, over } = event;
    if (over && COLUMN_IDS.includes(over.id)) {
      onMoveCard(active.id, over.id);
    }
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col px-4 pb-6 sm:px-6">
      {/* Sticky for the same reason as the screener's: on a narrow viewport
          the board is taller than the screen and the toggle has to stay
          reachable. See the note in views/Screener.jsx. */}
      <header className="sticky top-0 z-20 -mx-4 mb-5 shrink-0 bg-bg/95 px-4 pb-4 pt-6 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="text-display font-semibold tracking-tight text-text">
              Application Tracker
            </h1>
            <p className="mt-1 text-body text-gray-500">
              {cards.length === 0
                ? "Screened jobs you save will show up here."
                : `${cards.length} tracked ${
                    cards.length === 1 ? "application" : "applications"
                  }. Drag a card between stages, or click it to edit.`}
            </p>
          </div>
          <ViewToggle {...nav} />
        </div>
      </header>

      {cards.length === 0 ? (
        <EmptyBoard onNavigateToScreener={onNavigateToScreener} />
      ) : (
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
          <div className="min-h-0 flex-1 overflow-x-auto overscroll-x-contain pb-2">
            <div className="flex h-full min-w-max gap-4">
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
              <CardFace
                card={draggingCard}
                className="w-72 rotate-1 shadow-lg"
              />
            ) : null}
          </DragOverlay>
        </DndContext>
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
    </div>
  );
}
