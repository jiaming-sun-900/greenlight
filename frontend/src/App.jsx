import { useCallback, useState } from "react";
import Screener from "./views/Screener.jsx";
import Tracker from "./views/Tracker.jsx";
import useCards from "./hooks/useCards.js";

export default function App() {
  const [activeTab, setActiveTab] = useState("screener");
  const [highlightId, setHighlightId] = useState(null);
  const { cards, addCard, updateCard, deleteCard, moveCard } = useCards();

  const handleAddToTracker = useCallback(
    (draft) => {
      const card = addCard(draft);
      setHighlightId(card.id);
      setActiveTab("tracker");
    },
    [addCard]
  );

  const clearHighlight = useCallback(() => setHighlightId(null), []);

  // There is no app header: each view owns its own title row, and the view
  // toggle rides along in it.
  const nav = {
    activeTab,
    onTabChange: setActiveTab,
    trackedCount: cards.length,
  };

  return (
    // Pinned to the viewport from `md` up so the two screener panels scroll
    // internally instead of pushing the Analyze button below the fold. Below
    // `md` the panels stack and the page scrolls as one, which is why the
    // title row inside each view is sticky.
    <div className="flex min-h-dvh flex-col bg-bg text-text md:h-dvh md:overflow-hidden">
      <main className="flex flex-1 flex-col md:min-h-0">
        {activeTab === "screener" ? (
          <Screener nav={nav} onAddToTracker={handleAddToTracker} />
        ) : (
          <Tracker
            nav={nav}
            cards={cards}
            onUpdateCard={updateCard}
            onDeleteCard={deleteCard}
            onMoveCard={moveCard}
            onNavigateToScreener={() => setActiveTab("screener")}
            highlightId={highlightId}
            onHighlightShown={clearHighlight}
          />
        )}
      </main>
    </div>
  );
}
