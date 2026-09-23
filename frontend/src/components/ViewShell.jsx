import ThemeToggle from "./ThemeToggle.jsx";
import ViewToggle from "./ViewToggle.jsx";

// One container for both views. When the screener and the tracker each carried
// their own copy of these classes they drifted: the tracker was missing the
// `xl:px-10` step and capped 200px narrower, so toggling views slid the title
// and the toggle sideways by up to 84px on a wide screen. Widths and gutters
// live here now so that cannot happen again.
export const PAGE = "mx-auto w-full max-w-[1800px] px-4 sm:px-6 xl:px-10";
const BLEED = "-mx-4 px-4 sm:-mx-6 sm:px-6 xl:-mx-10 xl:px-10";

/**
 * The title row shared by both views. There is no app header: each view owns
 * its own title row, and the view toggle rides along in it.
 *
 * The toggle is aligned to the top of the row rather than centred on it, so its
 * position does not depend on how many lines the subtitle wraps to or on
 * whether the tracker's sort row is showing. Centring it is what made the
 * toggle jump 14px vertically between views.
 */
export default function ViewShell({ title, subtitle, nav, children }) {
  const { isDark, onToggleTheme, ...tabs } = nav;
  return (
    <div className={PAGE + " flex flex-col pb-6 md:h-full"}>
      {/* Sticky because below `md` the content scrolls as one page: the toggle
          has to stay reachable without scrolling back to the top. From `md` up
          the view is pinned and only the panels scroll, so nothing ever travels
          under this row and sticky costs nothing. The negative margins let the
          blurred backing span the page gutters. */}
      <header
        className={
          "sticky top-0 z-20 mb-5 shrink-0 bg-bg/95 pb-4 pt-6 backdrop-blur " +
          BLEED
        }
      >
        <div className="flex flex-col-reverse items-start gap-3 sm:flex-row sm:justify-between sm:gap-6">
          <div className="min-w-0">
            <h1 className="display-serif text-display font-semibold text-text">
              {title}
            </h1>
            <p className="mt-1 text-body text-muted">{subtitle}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ViewToggle {...tabs} />
            <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          </div>
        </div>
      </header>

      {children}
    </div>
  );
}
