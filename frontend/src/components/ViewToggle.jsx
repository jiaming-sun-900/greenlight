const TABS = [
  { id: "screener", label: "Screener" },
  { id: "tracker", label: "Tracker" },
];

/**
 * Screener/Tracker switch. Lives in the title row of each view (there is no
 * app header), so it is sized to sit next to an h1 without competing with it.
 */
export default function ViewToggle({ activeTab, onTabChange, trackedCount = 0 }) {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((tab) => tab.id === activeTab)
  );

  return (
    // Both halves are the same width (grid-cols-2, no gap), which is what
    // lets the pill travel by a plain 100% translate.
    <nav
      role="tablist"
      aria-label="View"
      className="group relative grid shrink-0 grid-cols-2 justify-items-center toggle-track rounded-full border border-gray-200 p-1"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 w-[calc(50%-0.25rem)] transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={{ transform: `translateX(${activeIndex * 100}%)` }}
      >
        <span className="toggle-pill group-active:toggle-pill-pressed block h-full w-full rounded-full" />
      </span>
      {TABS.map((tab) => {
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            className={
              "relative z-10 flex w-24 items-center justify-center gap-2 rounded-full px-3 py-1.5 " +
              "text-body font-medium transition-colors duration-200 sm:w-28 sm:px-4 " +
              (isActive ? "text-white" : "text-ink hover:text-ink")
            }
          >
            {tab.label}
            {tab.id === "tracker" && trackedCount > 0 && (
              <span
                className={
                  "rounded-full px-1.5 py-0.5 text-micro tabular-nums transition-colors " +
                  (isActive ? "bg-white/25 text-white" : "bg-gray-200 text-ink")
                }
              >
                {trackedCount}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
