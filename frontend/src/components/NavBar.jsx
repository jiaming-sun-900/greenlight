const TABS = [
  { id: "screener", label: "Screener" },
  { id: "tracker", label: "Tracker" },
];

export default function NavBar({ activeTab, onTabChange }) {
  return (
    <header className="sticky top-0 z-10 border-b border-gray-200 bg-bg/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500"
          />
          <span className="text-lg font-semibold tracking-tight text-text">
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
                  "rounded-full px-4 py-1.5 text-sm font-medium transition-colors " +
                  (isActive
                    ? "bg-accent text-white"
                    : "text-gray-600 hover:bg-gray-100 hover:text-text")
                }
              >
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
