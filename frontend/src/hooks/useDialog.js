import { useCallback, useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Shared modal behaviour: move focus in, keep Tab inside, give focus back on
 * close, and stop the page behind from scrolling.
 *
 * `aria-modal` alone does none of this. Without a trap, Tab walks straight out
 * of the dialog onto the board behind the backdrop, where the user cannot see
 * what they are focused on.
 *
 * `active` exists for the one case where a dialog opens on top of another: the
 * outer dialog stops trapping so the two traps do not fight over focus, but
 * keeps the scroll lock and its own focus-restore.
 *
 * Returns a ref to spread onto the dialog element, plus `backdropProps` for the
 * element behind it. Closing on the backdrop is bound to mousedown+mouseup on
 * the backdrop itself rather than to click, because a click fires whenever the
 * two ends merely share the backdrop as an ancestor: drag-selecting text inside
 * the dialog and releasing past its edge would otherwise close it.
 */
export default function useDialog({ onClose, onEscape, active = true } = {}) {
  const ref = useRef(null);
  const pressedBackdrop = useRef(false);

  // Focus in on mount, back out on unmount, and hold the page still meanwhile.
  useEffect(() => {
    const dialog = ref.current;
    const previouslyFocused = document.activeElement;

    if (dialog) {
      const first = dialog.querySelector(FOCUSABLE);
      (first ?? dialog).focus({ preventScroll: true });
    }

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      // The element that opened the dialog may be gone by the time it closes:
      // deleting a card removes the very card that was focused. Focusing a
      // detached node is a silent no-op that drops focus to <body>, so the next
      // Tab restarts from the top of the page.
      if (
        previouslyFocused instanceof HTMLElement &&
        document.contains(previouslyFocused)
      ) {
        previouslyFocused.focus({ preventScroll: true });
      } else {
        document.querySelector("main")?.focus?.({ preventScroll: true });
      }
    };
  }, []);

  useEffect(() => {
    if (!active) return undefined;

    function onKeyDown(event) {
      if (event.key === "Escape") {
        (onEscape ?? onClose)?.();
        return;
      }
      const dialog = ref.current;
      if (event.key !== "Tab" || !dialog) return;

      const targets = [...dialog.querySelectorAll(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (targets.length === 0) {
        event.preventDefault();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      // Focus can already be outside the dialog: clicking the padding inside
      // the backdrop puts it on <body>, which is neither first nor last, and
      // without this the next Tab walks into the page behind the overlay.
      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, onClose, onEscape]);

  const onMouseDown = useCallback((event) => {
    pressedBackdrop.current = event.target === event.currentTarget;
  }, []);

  const onMouseUp = useCallback(
    (event) => {
      const both =
        pressedBackdrop.current && event.target === event.currentTarget;
      pressedBackdrop.current = false;
      if (both) onClose?.();
    },
    [onClose]
  );

  return { ref, backdropProps: { onMouseDown, onMouseUp, role: "presentation" } };
}
