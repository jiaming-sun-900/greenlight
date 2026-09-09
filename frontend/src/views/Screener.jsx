import { useState } from "react";
import JobDetailFields from "../components/JobFields.jsx";
import VerdictBadge from "../components/VerdictBadge.jsx";
import VerdictModal from "../components/VerdictModal.jsx";
import { toISODate } from "../lib/dates.js";

const SCREEN_ENDPOINT = "http://localhost:8000/screen";

// Panels stretch with the viewport, but prose inside them does not: past roughly
// 70 characters a line gets hard to track back from. Applied to the text content
// of each panel, never to the panel or its header row. Left aligned rather than
// centered, so content stays flush with the panel header above it.
const MEASURE = "w-full max-w-[70ch]";

/** Shape the backend response into the editable draft the panel works with. */
function toDraft(data) {
  return {
    verdict: data.verdict,
    verdict_reasons: Array.isArray(data.verdict_reasons)
      ? data.verdict_reasons
      : [],
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

export default function Screener({ onAddToTracker }) {
  const [jobDescription, setJobDescription] = useState("");
  const [draft, setDraft] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleAnalyze() {
    const text = jobDescription.trim();
    if (!text || loading) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(SCREEN_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ job_description: text }),
      });

      if (!response.ok) {
        let detail = `Request failed (${response.status}).`;
        try {
          const body = await response.json();
          if (body && body.detail) detail = body.detail;
        } catch {
          // response had no/invalid JSON body - keep the status-based message
        }
        throw new Error(detail);
      }

      const data = await response.json();
      setDraft(toDraft(data));
    } catch (err) {
      // Network failure, CORS, or a thrown backend error all land here.
      setDraft(null);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong while analyzing this posting."
      );
    } finally {
      setLoading(false);
    }
  }

  function handleAdd() {
    onAddToTracker(draft);
    // Clear the bench so the next posting starts from a blank slate.
    setJobDescription("");
    setDraft(null);
  }

  return (
    // Below `md` the panels stack into one column and the page scrolls normally.
    // From `md` up they sit side by side and the view is pinned to the viewport:
    // each panel scrolls internally so Analyze never gets pushed off the bottom,
    // however long the posting is. The panels themselves are fluid; it is the
    // text inside them that is held to a readable measure (see MEASURE).
    <div className="mx-auto flex w-full max-w-[1800px] flex-col px-4 py-6 sm:px-6 md:h-full xl:px-10">
      <header className="mb-5 shrink-0">
        <h1 className="text-display font-semibold tracking-tight text-text">
          Screen a job posting
        </h1>
        <p className="mt-1 text-body text-gray-500">
          Paste a job description to check visa eligibility for international
          students.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-5 md:min-h-0 md:flex-1 md:grid-cols-2">
        {/* Left panel - input */}
        <section
          aria-label="Job description input"
          className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-title font-semibold text-gray-800">
              Job description
            </h2>
            <span className="text-micro tabular-nums text-gray-400">
              {jobDescription.length.toLocaleString()} chars
            </span>
          </div>
          <div className="flex min-h-0 flex-1 rounded-b-2xl bg-white">
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste a full job description here..."
              className={
                "min-h-[300px] w-full resize-none overflow-y-auto bg-transparent px-5 py-4 " +
                "text-body leading-relaxed text-gray-800 placeholder:text-gray-400 " +
                "focus:outline-none md:min-h-0 " +
                MEASURE
              }
            />
          </div>
        </section>

        {/* Right panel - structured output */}
        <section
          aria-label="Analysis result"
          className="flex min-h-0 flex-col rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-title font-semibold text-gray-800">Analysis</h2>
            <span className="text-micro text-gray-400">
              {loading ? "Analyzing…" : draft ? "Editable" : "Preview"}
            </span>
          </div>

          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} />
          ) : draft ? (
            <ResultView draft={draft} onChange={setDraft} onAdd={handleAdd} />
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <div className="mt-5 flex shrink-0 justify-center">
        <button
          type="button"
          onClick={handleAnalyze}
          className="rounded-full bg-accent px-8 py-2.5 text-body font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-gray-300"
          disabled={jobDescription.trim().length === 0 || loading}
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>
    </div>
  );
}

function ResultView({ draft, onChange, onAdd }) {
  const [showReasons, setShowReasons] = useState(false);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className={MEASURE}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <VerdictBadge verdict={draft.verdict} />
            <button
              type="button"
              onClick={() => setShowReasons(true)}
              className="text-body font-medium text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
            >
              Why this verdict?
            </button>
          </div>

          <JobDetailFields value={draft} onChange={onChange} />
        </div>
      </div>

      <div className="shrink-0 border-t border-gray-100 px-5 py-4">
        <button
          type="button"
          onClick={onAdd}
          className={
            "block rounded-lg bg-accent px-4 py-2.5 text-body font-medium " +
            "text-white transition-colors hover:bg-accent-hover " +
            MEASURE
          }
        >
          Add to Tracker →
        </button>
      </div>

      {showReasons && (
        <VerdictModal
          verdict={draft.verdict}
          reasons={draft.verdict_reasons}
          onClose={() => setShowReasons(false)}
        />
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-16 text-center">
      <p className="text-body text-gray-500">No analysis yet</p>
      <p className="max-w-xs text-label text-gray-400">
        Paste a job description on the left and press Analyze to see the visa
        eligibility verdict here.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div
      className={"flex w-full flex-1 flex-col gap-6 px-5 py-5 " + MEASURE}
      aria-busy="true"
    >
      <div className="flex items-center justify-between">
        <div className="h-8 w-28 animate-pulse rounded-full bg-gray-100" />
        <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-2.5 w-24 animate-pulse rounded bg-gray-100" />
          <div className="h-3.5 w-full animate-pulse rounded bg-gray-100" />
          {i === 2 && (
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-gray-100" />
          )}
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-16 text-center">
      <div className="rounded-full bg-[#fee2e2] px-3.5 py-1.5 text-body font-semibold text-red-900">
        Analysis failed
      </div>
      <p className="max-w-sm text-body leading-relaxed text-gray-500">
        {message}
      </p>
      <p className="text-label text-gray-400">
        Check that the backend is running, then press Analyze again.
      </p>
    </div>
  );
}
