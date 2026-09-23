import { useCallback, useEffect, useRef, useState } from "react";
import { derivePriority } from "../lib/priority.js";
import { toISODate } from "../lib/dates.js";

// Same-origin in both environments: Vercel serves the API alongside the app, and
// the Vite dev server proxies /api to the local backend. VITE_SCREEN_ENDPOINT is
// an escape hatch for pointing the frontend at a backend somewhere else.
const SCREEN_ENDPOINT = import.meta.env.VITE_SCREEN_ENDPOINT ?? "/api/screen";

// Mirrors MAX_JOB_DESCRIPTION_CHARS in backend/main.py. Checked here as well so
// an over-long paste is caught before a round trip rather than after one.
export const MAX_JOB_DESCRIPTION_CHARS = 20_000;

// Long enough for a cold serverless start plus a slow model, short enough that a
// hung backend does not leave "Analyzing..." on screen forever.
const REQUEST_TIMEOUT_MS = 60_000;

/** Shape the backend response into the editable draft the panel works with. */
function toDraft(data) {
  const verdict_reasons = Array.isArray(data.verdict_reasons)
    ? data.verdict_reasons
    : [];
  return {
    verdict: data.verdict,
    verdict_reasons,
    priority: data.priority ?? derivePriority(data.verdict, verdict_reasons),
    position_title: data.position_title ?? "",
    company_name: data.company_name ?? "",
    job_functions: data.job_functions ?? "",
    preferred_skills: Array.isArray(data.preferred_skills)
      ? data.preferred_skills
      : [],
    // The model is asked for YYYY-MM-DD, but normalize anyway so the date input
    // always has something it can render.
    deadline: toISODate(data.deadline),
  };
}

/**
 * Pull a human-readable message out of an error response.
 *
 * FastAPI's own validation errors put a list of objects on `detail`, and
 * stringifying that yields "[object Object]", so anything that is not already a
 * string has to be unpacked.
 */
function messageFrom(body, status) {
  const fallback = `Request failed (${status}).`;
  const detail = body?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail.map((item) => item?.msg).filter(Boolean);
    if (messages.length) return messages.join("; ");
  }
  return fallback;
}

/**
 * The screener's working session: the pasted posting, the analysis, and the
 * request that produces it.
 *
 * This lives above the view rather than inside it. The two views are swapped by
 * a conditional render, so state held in the screener would be destroyed every
 * time the user looked at the tracker, taking a pasted posting and any hand
 * corrections with it.
 */
export default function useScreening() {
  const [jobDescription, setJobDescription] = useState("");
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const inFlight = useRef(null);

  // This hook lives in App, so the cleanup only fires when the app itself goes
  // away. The abort that earns its keep is the one in analyze() below, which
  // drops a superseded request rather than paying for a result nobody reads.
  useEffect(() => () => inFlight.current?.abort(), []);

  const analyze = useCallback(async () => {
    const text = jobDescription.trim();
    if (!text) return;
    if (text.length > MAX_JOB_DESCRIPTION_CHARS) {
      setError(
        `This posting is ${text.length.toLocaleString()} characters. The limit is ${MAX_JOB_DESCRIPTION_CHARS.toLocaleString()}, so trim it and try again.`
      );
      return;
    }

    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(SCREEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_description: text }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let body = null;
        try {
          body = await response.json();
        } catch {
          // No JSON body: fall back to the status-based message.
        }
        throw new Error(messageFrom(body, response.status));
      }

      setDraft(toDraft(await response.json()));
    } catch (err) {
      if (controller.signal.aborted) {
        // Aborted, but by whom. If this controller is still the current one the
        // timeout fired and the user is owed an explanation; if it is not, they
        // pressed Cancel or started a new analysis, and both already said so.
        if (inFlight.current === controller) {
          setError("That took too long. The backend did not answer in time.");
        }
        return;
      }
      // A failed retry must not discard an analysis the user already has, and
      // may already have corrected by hand, so `draft` is deliberately left
      // alone here.
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong while analyzing this posting."
      );
    } finally {
      clearTimeout(timer);
      if (inFlight.current === controller) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }, [jobDescription]);

  const cancel = useCallback(() => {
    inFlight.current?.abort();
    inFlight.current = null;
    setLoading(false);
  }, []);

  /** Clear the bench so the next posting starts from a blank slate. */
  const reset = useCallback(() => {
    setJobDescription("");
    setDraft(null);
    setError(null);
  }, []);

  return {
    jobDescription,
    setJobDescription,
    draft,
    setDraft,
    loading,
    error,
    dismissError: useCallback(() => setError(null), []),
    analyze,
    cancel,
    reset,
  };
}
