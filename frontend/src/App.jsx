import { useCallback, useState } from "react";
import NavBar from "./components/NavBar.jsx";
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

  return (
    // Pinned to the viewport from `lg` up so the two screener panels scroll
    // internally instead of pushing the Analyze button below the fold.
    <div className="flex min-h-dvh flex-col bg-bg text-text lg:h-dvh lg:overflow-hidden">
      <NavBar
        activeTab={activeTab}
        onTabChange={setActiveTab}
        trackedCount={cards.length}
      />
      <main className="flex flex-1 flex-col lg:min-h-0">
        {activeTab === "screener" ? (
          <Screener onAddToTracker={handleAddToTracker} />
        ) : (
          <Tracker
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
