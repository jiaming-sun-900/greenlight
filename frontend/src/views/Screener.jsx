import { useState } from "react";
import VerdictBadge from "../components/VerdictBadge.jsx";
import VerdictModal from "../components/VerdictModal.jsx";

const SCREEN_ENDPOINT = "http://localhost:8000/screen";

export default function Screener() {
  const [jobDescription, setJobDescription] = useState("");
  const [result, setResult] = useState(null);
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
      setResult(data);
    } catch (err) {
      // Network failure, CORS, or a thrown backend error all land here.
      setResult(null);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Something went wrong while analyzing this posting."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-text">
          Screen a job posting
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          Paste a job description to check visa eligibility for international
          students.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {/* Left panel - input */}
        <section
          aria-label="Job description input"
          className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-medium text-gray-700">
              Job description
            </h2>
            <span className="text-xs text-gray-400">
              {jobDescription.length.toLocaleString()} chars
            </span>
          </div>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            placeholder="Paste a full job description here..."
            className="min-h-[480px] flex-1 resize-none rounded-b-2xl bg-white px-5 py-4 text-sm leading-relaxed text-gray-800 placeholder:text-gray-400 focus:outline-none"
          />
        </section>

        {/* Right panel - structured output */}
        <section
          aria-label="Analysis result"
          className="flex flex-col rounded-2xl border border-gray-200 bg-white shadow-sm"
        >
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-medium text-gray-700">Analysis</h2>
            <span className="text-xs text-gray-400">
              {loading ? "Analyzing…" : result ? "Result" : "Preview"}
            </span>
          </div>

          {loading ? (
            <LoadingState />
          ) : error ? (
            <ErrorState message={error} />
          ) : result ? (
            <ResultView result={result} />
          ) : (
            <EmptyState />
          )}
        </section>
      </div>

      <div className="mt-8 flex justify-center">
        <button
          type="button"
          onClick={handleAnalyze}
          className="rounded-full bg-accent px-8 py-2.5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-gray-300"
          disabled={jobDescription.trim().length === 0 || loading}
        >
          {loading ? "Analyzing…" : "Analyze"}
        </button>
      </div>
    </div>
  );
}

function ResultView({ result }) {
  const [showReasons, setShowReasons] = useState(false);

  return (
    <>
      <div className="flex flex-1 flex-col gap-6 px-5 py-5">
        <div className="flex items-center justify-between">
          <VerdictBadge verdict={result.verdict} />
          <button
            type="button"
            onClick={() => setShowReasons(true)}
            className="text-xs font-medium text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline"
          >
            Why this verdict?
          </button>
        </div>

        <Field label="Position title" value={result.position_title} />
        <Field label="Company name" value={result.company_name} />
        <Field label="Job functions" value={result.job_functions} multiline />
        <BulletField
          label="Preferred skills"
          items={result.preferred_skills}
        />
        <Field
          label="Application deadline"
          value={result.deadline || "-"}
          muted={!result.deadline}
        />
      </div>

      <div className="border-t border-gray-100 px-5 py-4">
        <button
          type="button"
          className="w-full rounded-lg bg-gray-100 px-4 py-2.5 text-sm font-medium text-gray-500"
          disabled
        >
          Add to Tracker →
        </button>
      </div>

      {showReasons && (
        <VerdictModal
          verdict={result.verdict}
          reasons={result.verdict_reasons}
          onClose={() => setShowReasons(false)}
        />
      )}
    </>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-5 py-16 text-center">
      <p className="text-sm text-gray-500">No analysis yet</p>
      <p className="max-w-xs text-xs text-gray-400">
        Paste a job description on the left and press Analyze to see the visa
        eligibility verdict here.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex flex-1 flex-col gap-6 px-5 py-5" aria-busy="true">
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
      <div className="rounded-full bg-[#fee2e2] px-3.5 py-1.5 text-sm font-semibold text-red-900">
        Analysis failed
      </div>
      <p className="max-w-sm text-xs leading-relaxed text-gray-500">{message}</p>
      <p className="text-xs text-gray-400">
        Check that the backend is running, then press Analyze again.
      </p>
    </div>
  );
}

function Field({ label, value, multiline = false, muted = false }) {
  return (
    <div>
      <div className="mb-1 text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
      <div
        className={
          (multiline ? "leading-relaxed" : "") +
          " text-sm " +
          (muted ? "text-gray-400" : "text-gray-800")
        }
      >
        {value || "-"}
      </div>
    </div>
  );
}

function BulletField({ label, items }) {
  const list = Array.isArray(items) ? items : [];
  return (
    <div>
      <div className="mb-1.5 text-xs font-medium uppercase tracking-wide text-gray-400">
        {label}
      </div>
      {list.length === 0 ? (
        <div className="text-sm text-gray-400">-</div>
      ) : (
        <ul className="space-y-1 text-sm text-gray-800">
          {list.map((item, idx) => (
            <li key={idx} className="flex gap-2">
              <span
                aria-hidden
                className="mt-2 inline-block h-1 w-1 shrink-0 rounded-full bg-gray-400"
              />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
