const TABS = [
  { id: "screener", label: "Screener" },
  { id: "tracker", label: "Tracker" },
];

export default function NavBar({ activeTab, onTabChange, trackedCount = 0 }) {
  return (
    <header className="shrink-0 border-b border-gray-200 bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
          />
          <span className="text-title font-semibold tracking-tight text-text">
            Greenlight
          </span>
        </div>
        <nav className="flex items-center gap-1">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onTabChange(tab.id)}
                className={
                  "rounded-full px-4 py-1.5 text-body font-medium transition-colors " +
                  (isActive
                    ? "bg-accent text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-text")
                }
              >
                {tab.label}
                {tab.id === "tracker" && trackedCount > 0 && (
                  <span
                    className={
                      "ml-2 rounded-full px-1.5 py-0.5 text-label tabular-nums " +
                      (isActive ? "bg-white/25 text-white" : "bg-gray-200 text-gray-600")
                    }
                  >
                    {trackedCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
