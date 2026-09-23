/**
 * Sun/moon theme switch. Sits beside the view toggle in the title row and is
 * cut from the same glass, so the two read as one cluster of chrome.
 *
 * The glyphs are the ones from jiaming-sun-900.github.io, paths and all: a moon
 * with enough body to read as a moon rather than a fingernail, and a sun whose
 * rays turn a notch on hover. The glyph shown is the theme you will get, not
 * the one you are in, and the label says so outright, because an icon alone is
 * ambiguous here and every product picks the opposite convention from the last.
 * Deliberately not `aria-pressed`: a label that already changes with state plus
 * a pressed state announces the same fact twice, in two directions.
 */
export default function ThemeToggle({ isDark, onToggle }) {
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="toggle-track toggle-glass-hover focus-ring group flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-2 border-border text-ink transition-all duration-200 active:scale-95"
    >
      <span aria-hidden className="relative block h-6 w-6">
        <span
          className={
            "theme-glyph " +
            (isDark
              ? "rotate-0 scale-100 opacity-100"
              : "rotate-90 scale-50 opacity-0")
          }
        >
          <SunGlyph />
        </span>
        <span
          className={
            "theme-glyph " +
            (isDark
              ? "-rotate-90 scale-50 opacity-0"
              : "rotate-0 scale-100 opacity-100")
          }
        >
          <MoonGlyph />
        </span>
      </span>
    </button>
  );
}

function SunGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 overflow-visible transition-transform duration-200 group-hover:scale-115"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4.5" />
      {/* The rays turn 45 degrees on hover, on a curve that overshoots slightly
          and settles. Same easing as the personal site. */}
      <g className="origin-[12px_12px] transition-transform duration-500 ease-[cubic-bezier(0.34,1.2,0.64,1)] group-hover:rotate-45">
        <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
      </g>
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-6 w-6 overflow-visible transition-transform duration-200 group-hover:-rotate-12 group-hover:scale-115"
      aria-hidden
    >
      <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
    </svg>
  );
}
