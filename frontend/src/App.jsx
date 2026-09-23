import { useCallback, useState } from "react";
import Screener from "./views/Screener.jsx";
import Tracker from "./views/Tracker.jsx";
import useCards from "./hooks/useCards.js";
import useScreening from "./hooks/useScreening.js";
import useTheme from "./hooks/useTheme.js";

export default function App() {
  const [activeTab, setActiveTab] = useState("screener");
  const [highlightId, setHighlightId] = useState(null);
  // Which order the board is in. Held here rather than in the tracker because
  // the tracker unmounts on every view switch, which would silently put the
  // user back on Priority each time they came back.
  const [sortBy, setSortBy] = useState("priority");
  const { cards, addCard, updateCard, deleteCard, moveCard } = useCards();
  // The screener's session outlives the screener view for the same reason: a
  // pasted posting and a hand-corrected analysis must survive a trip to the
  // tracker and back.
  const screening = useScreening();
  const { isDark, toggle: onToggleTheme } = useTheme();

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
    isDark,
    onToggleTheme,
  };

  return (
    // Pinned to the viewport from `md` up so the two screener panels scroll
    // internally instead of pushing the Analyze button below the fold. Below
    // `md` both views stack and the page scrolls as one, which is why the
    // title row inside each view is sticky.
    <div className="flex min-h-dvh flex-col bg-bg text-text md:h-dvh md:overflow-hidden">
      <main className="flex flex-1 flex-col md:min-h-0">
        {activeTab === "screener" ? (
          <Screener
            nav={nav}
            screening={screening}
            onAddToTracker={handleAddToTracker}
          />
        ) : (
          <Tracker
            nav={nav}
            cards={cards}
            sortBy={sortBy}
            onSortChange={setSortBy}
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
