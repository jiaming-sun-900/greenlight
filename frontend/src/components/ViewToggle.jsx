const TABS = [
  { id: "screener", label: "Screener" },
  { id: "tracker", label: "Tracker" },
];

/**
 * Screener/Tracker switch. Lives in the title row of each view (there is no
 * app header), so it is sized to sit next to an h1 without competing with it.
 *
 * Plain buttons with `aria-current` rather than a tablist. The tab pattern
 * promises tabpanels and arrow-key navigation, and this switches whole views
 * rather than panels within one, so announcing "tab, 1 of 2" and then leaving
 * the arrow keys dead was the worse of the two options.
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
      aria-label="View"
      className="group relative grid shrink-0 grid-cols-2 justify-items-center toggle-track rounded-full border border-border p-1"
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
            aria-current={isActive ? "page" : undefined}
            onClick={() => onTabChange(tab.id)}
            className={
              "focus-ring relative z-10 flex w-24 items-center justify-center gap-2 rounded-full px-3 py-1.5 " +
              "text-body font-medium transition-colors duration-200 sm:w-28 sm:px-4 " +
              (isActive ? "text-white" : "text-muted hover:text-ink")
            }
          >
            {tab.label}
            {tab.id === "tracker" && trackedCount > 0 && (
              <span
                aria-label={`${trackedCount} tracked`}
                className={
                  "rounded-full px-1.5 py-0.5 text-micro tabular-nums transition-colors " +
                  (isActive ? "bg-white/25 text-white" : "bg-selected text-ink")
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
