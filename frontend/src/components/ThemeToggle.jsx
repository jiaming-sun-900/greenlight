/**
 * Sun/moon theme switch. Sits beside the view toggle in the title row and
 * borrows its material, so the two read as one cluster of chrome rather than
 * as a stray button.
 *
 * The glyph shown is the theme you will get, not the one you are in, and the
 * label says so outright: an icon alone is ambiguous here and every product
 * picks the opposite convention from the last one.
 */
export default function ThemeToggle({ isDark, onToggle }) {
  const label = isDark ? "Switch to light mode" : "Switch to dark mode";

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      className="toggle-track focus-ring flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border border-border text-muted transition-colors hover:text-ink"
    >
      {isDark ? <SunGlyph /> : <MoonGlyph />}
    </button>
  );
}

function SunGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="4.25" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
    </svg>
  );
}

function MoonGlyph() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.5 14.3A8.5 8.5 0 1 1 9.7 3.5a6.8 6.8 0 0 0 10.8 10.8Z" />
    </svg>
  );
}
