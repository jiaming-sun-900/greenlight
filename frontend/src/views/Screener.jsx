import { useState } from "react";
import BrandMark from "../components/BrandMark.jsx";
import JobDetailFields from "../components/JobFields.jsx";
import ViewShell from "../components/ViewShell.jsx";
import VerdictBadge from "../components/VerdictBadge.jsx";
import VerdictModal from "../components/VerdictModal.jsx";
import PriorityChip from "../components/PriorityChip.jsx";
import CloseGlyph from "../components/CloseGlyph.jsx";
import { MAX_JOB_DESCRIPTION_CHARS } from "../hooks/useScreening.js";

// Panels stretch with the viewport, but prose inside them does not: past roughly
// 70 characters a line gets hard to track back from. Applied to the text content
// of each panel, never to the panel or its header row. Left aligned rather than
// centered, so content stays flush with the panel header above it.
const MEASURE = "w-full max-w-[70ch]";

// A textarea cannot hold its text to a measure narrower than its own box: the
// scrollbar rides the element's right edge, so capping the element's width
// parks the scrollbar mid-panel. Instead the textarea spans the full panel and
// the measure is enforced by padding, which keeps the scrollbar flush with the
// panel edge where it belongs.
const MEASURE_PADDING = "pr-[max(1.25rem,calc(100%-70ch-1.25rem))]";

const PANEL =
  "flex min-h-0 flex-col rounded-2xl border-2 border-border bg-surface shadow-sm";
const PANEL_HEADER =
  "flex shrink-0 items-center justify-between gap-3 border-b-2 border-border-soft px-5 py-3";

export default function Screener({ nav, screening, onAddToTracker }) {
  const {
    jobDescription,
    setJobDescription,
    draft,
    setDraft,
    loading,
    error,
    dismissError,
    analyze,
    cancel,
    reset,
  } = screening;

  const length = jobDescription.length;
  const overLimit = length > MAX_JOB_DESCRIPTION_CHARS;

  function handleAdd() {
    onAddToTracker(draft);
    reset();
  }

  return (
    <ViewShell
      nav={nav}
      title="Screen a job posting"
      subtitle="Paste a job description to check visa eligibility for international students."
    >
      <div className="grid grid-cols-1 gap-5 md:min-h-0 md:flex-1 md:grid-cols-2">
        {/* Left panel - input */}
        <section aria-label="Job description input" className={PANEL}>
          <div className={PANEL_HEADER}>
            <h2 className="text-title font-semibold text-ink">
              Job description
            </h2>
            <span
              className={
                "text-micro tabular-nums " +
                (overLimit ? "font-medium text-danger" : "text-muted")
              }
            >
              {overLimit
                ? `${length.toLocaleString()} / ${MAX_JOB_DESCRIPTION_CHARS.toLocaleString()} chars`
                : `${length.toLocaleString()} chars`}
            </span>
          </div>
          {/* The ring lives on the wrapper: the textarea is borderless and fills
              the panel, so its own outline would trace the panel edge. */}
          <div className="flex min-h-0 flex-1 rounded-b-2xl bg-surface ring-inset focus-within:ring-2 focus-within:ring-focus/50">
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              placeholder="Paste a full job description here..."
              aria-label="Job description"
              aria-invalid={overLimit || undefined}
              className={
                "min-h-[300px] w-full resize-none overflow-y-auto bg-transparent pl-5 py-5 " +
                "text-body leading-relaxed text-ink placeholder:text-muted " +
                "focus:outline-none md:min-h-0 " +
                MEASURE_PADDING
              }
            />
          </div>
        </section>

        {/* Right panel - structured output */}
        <section aria-label="Analysis result" className={PANEL}>
          <div className={PANEL_HEADER}>
            <h2 className="text-title font-semibold text-ink">Analysis</h2>
            <span className="text-micro text-muted">
              {loading ? "Analyzing…" : draft ? "Editable" : "Preview"}
            </span>
          </div>

          {loading ? (
            <LoadingState />
          ) : draft ? (
            // A failed retry leaves the analysis the user already has, and may
            // already have corrected, in place. The failure is reported above
            // it rather than in place of it.
            <ResultView
              draft={draft}
              onChange={setDraft}
              onAdd={handleAdd}
              error={error}
              onDismissError={dismissError}
            />
          ) : error ? (
            <ErrorState message={error} />
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      {/* Analyze stays centered on the row; the wordmark is parked at the
          right edge of the same row. Below `sm` there is not enough width for
          both, so the mark drops to its own centered line underneath. */}
      <div className="relative mt-5 flex shrink-0 flex-col items-center gap-4 sm:block sm:text-center">
        {loading ? (
          <button
            type="button"
            onClick={cancel}
            className="btn-block focus-ring rounded-full border-2 border-border bg-surface px-8 text-ink transition-colors hover:bg-hover"
          >
            Cancel
          </button>
        ) : (
          <button
            type="button"
            onClick={analyze}
            className="btn-accent btn-pill focus-ring text-white"
            disabled={jobDescription.trim().length === 0 || overLimit}
          >
            Analyze
          </button>
        )}
        <BrandMark className="sm:absolute sm:right-0 sm:top-1/2 sm:-translate-y-1/2" />
      </div>
    </ViewShell>
  );
}

function ResultView({ draft, onChange, onAdd, error, onDismissError }) {
  const [showReasons, setShowReasons] = useState(false);

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        <div className={MEASURE}>
          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start justify-between gap-3 rounded-lg bg-bad-bg px-3.5 py-3"
            >
              <p className="text-body text-bad-fg">
                <span className="font-semibold">That retry failed.</span>{" "}
                {error}
              </p>
              <button
                type="button"
                onClick={onDismissError}
                aria-label="Dismiss"
                className="focus-ring shrink-0 rounded-md p-1 text-bad-fg transition-colors hover:bg-bad-fg/10"
              >
                <CloseGlyph />
              </button>
            </div>
          )}

          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <VerdictBadge verdict={draft.verdict} />
              <PriorityChip priority={draft.priority} />
            </div>
            <button
              type="button"
              onClick={() => setShowReasons(true)}
              className="focus-ring rounded-md text-body font-medium text-muted underline-offset-2 hover:text-ink hover:underline"
            >
              Why this verdict?
            </button>
          </div>

          <JobDetailFields value={draft} onChange={onChange} />
        </div>
      </div>

      <div className="shrink-0 border-t-2 border-border-soft px-5 py-4">
        <button
          type="button"
          onClick={onAdd}
          className={"btn-accent btn-block focus-ring block text-white " + MEASURE}
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
    <div className="flex flex-1 items-center justify-center px-5 py-16 text-center">
      <p className="max-w-sm text-label text-muted">
        Paste a job description and press Analyze.
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
      {/* Sized to the real badge row (36px) and its priority chip, so the panel
          does not reflow when the result lands. */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-9 w-28 animate-pulse rounded-full bg-hover" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-hover" />
        </div>
        <div className="h-3 w-24 animate-pulse rounded bg-hover" />
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="space-y-2">
          <div className="h-2.5 w-24 animate-pulse rounded bg-hover" />
          <div className="h-3.5 w-full animate-pulse rounded bg-hover" />
          {i === 2 && (
            <div className="h-3.5 w-3/4 animate-pulse rounded bg-hover" />
          )}
        </div>
      ))}
    </div>
  );
}

function ErrorState({ message }) {
  // "Check that the backend is running" is wrong advice for a rate limit, which
  // is the failure a user is most likely to meet, so the hint follows the cause.
  const throttled = /too many/i.test(message);
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 py-16 text-center">
      <div className="rounded-full bg-bad-bg px-3.5 py-1.5 text-body font-semibold text-bad-fg">
        Analysis failed
      </div>
      <p className="max-w-sm text-body leading-relaxed text-muted">{message}</p>
      <p className="text-label text-muted">
        {throttled
          ? "Give it a minute, then press Analyze again."
          : "Check that the backend is running, then press Analyze again."}
      </p>
    </div>
  );
}
