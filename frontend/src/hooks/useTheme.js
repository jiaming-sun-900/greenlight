import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "greenlight_theme";

// Must match --theme-fade in index.css: the class comes off once the fade it
// enables has finished.
const FADE_MS = 500;

// Must match --color-bg in index.css for each theme.
const CHROME_COLOR = { light: "#f0eee6", dark: "#171615" };

/**
 * Theme state: "light", "dark", or "system".
 *
 * "system" is the default and is a real third state, not a startup guess. A
 * user who has never touched the control follows their OS, including when the
 * OS flips at sunset; picking light or dark pins it until they clear it.
 *
 * The class itself is applied by the inline script in index.html before first
 * paint, so the page never flashes white on the way to dark. This hook keeps it
 * in sync afterwards and owns the persistence.
 */
function readStored() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function prefersDark() {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export default function useTheme() {
  const [theme, setTheme] = useState(readStored);
  const [systemDark, setSystemDark] = useState(prefersDark);

  // Only matters while the choice is "system", but the listener is cheap and
  // unconditional, which keeps the effect free of a stale-closure trap.
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return undefined;
    const onChange = (event) => setSystemDark(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const isDark = theme === "system" ? systemDark : theme === "dark";

  // Cross-fade rather than snap, but only on an actual change. The test is the
  // DOM's own state, not a "have I run before" ref: the inline script in
  // index.html has already put the right class on the element by the time this
  // first runs, and a ref survives StrictMode's double-invoke, so a ref guard
  // lets the second run fade the app in from the theme it is already in.
  useEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("dark") === isDark) return undefined;
    root.classList.add("theme-transition");
    root.classList.toggle("dark", isDark);
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", CHROME_COLOR[isDark ? "dark" : "light"]);
    const timer = setTimeout(
      () => root.classList.remove("theme-transition"),
      FADE_MS
    );
    return () => clearTimeout(timer);
  }, [isDark]);

  useEffect(() => {
    try {
      if (theme === "system") window.localStorage.removeItem(STORAGE_KEY);
      else window.localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      // Private-mode storage: the choice just does not outlive the tab.
    }
  }, [theme]);

  // Another tab's choice should not leave this one on the other theme.
  useEffect(() => {
    function onStorage(event) {
      if (event.key !== null && event.key !== STORAGE_KEY) return;
      setTheme(readStored());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  /** Flip to the opposite of what is on screen, pinning the choice. */
  const toggle = useCallback(() => setTheme(isDark ? "light" : "dark"), [isDark]);

  return { theme, isDark, toggle };
}
