/** Green dot + wordmark. Sits at the foot of the screener, not in a header. */
export default function BrandMark({ className = "" }) {
  return (
    <div className={"flex items-center gap-2 " + className}>
      <span
        aria-hidden
        className="inline-block h-2.5 w-2.5 rounded-full bg-accent-dot"
      />
      <span className="text-title font-semibold tracking-tight text-text">
        Greenlight
      </span>
    </div>
  );
}
