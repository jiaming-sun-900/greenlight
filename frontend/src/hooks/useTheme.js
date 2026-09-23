import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "greenlight_theme";

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

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
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
