import { useEffect, useRef } from "react";

// Inline-editable fields shared by the screener's right panel and the tracker's
// card modal, so a job report looks and behaves the same in both places.
//
// Inputs are borderless until hovered or focused. That keeps the panel reading
// as a document while still signalling that every value can be corrected.

const LABEL = "block mb-1 px-2 text-label font-medium uppercase tracking-wide text-gray-400";

// Size and color are kept out of the base so callers that need a different
// type tier (the card modal heading) can supply their own without two
// competing font-size utilities on one element.
const CONTROL_BASE =
  "w-full rounded-lg border border-transparent bg-transparent px-2 py-1.5 " +
  "transition-colors placeholder:text-gray-400 hover:border-gray-200 " +
  "hover:bg-gray-50 focus:border-accent focus:bg-white focus:outline-none " +
  "focus:ring-2 focus:ring-accent/20";

const CONTROL = CONTROL_BASE + " text-body text-gray-900";

function AutoTextarea({ value, onChange, ...rest }) {
  const ref = useRef(null);

  // Grow with the content so long summaries never end up in a tiny scroll box.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      rows={2}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className={CONTROL + " resize-none overflow-hidden leading-relaxed"}
      {...rest}
    />
  );
}

/**
 * Inline-editable field with no visible label, for headings where the value is
 * its own label. `className` carries the type tier and color.
 */
export function PlainField({ value, onChange, placeholder, label, className = "" }) {
  return (
    <input
      type="text"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      aria-label={label}
      className={CONTROL_BASE + " " + className}
    />
  );
}

export function TextField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block">
        <span className={LABEL}>{label}</span>
        <input
          type="text"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={CONTROL}
        />
      </label>
    </div>
  );
}

export function TextAreaField({ label, value, onChange, placeholder }) {
  return (
    <div>
      <label className="block">
        <span className={LABEL}>{label}</span>
        <AutoTextarea
          value={value ?? ""}
          onChange={onChange}
          placeholder={placeholder}
        />
      </label>
    </div>
  );
}

export function DateField({ label, value, onChange }) {
  return (
    <div>
      <label className="block">
        <span className={LABEL}>{label}</span>
        <input
          type="date"
          value={value ?? ""}
          onChange={(event) => onChange(event.target.value)}
          className={CONTROL + " max-w-[220px]"}
        />
      </label>
    </div>
  );
}

export function ListField({ label, items, onChange, placeholder }) {
  const list = Array.isArray(items) ? items : [];

  function replace(index, next) {
    onChange(list.map((item, idx) => (idx === index ? next : item)));
  }

  return (
    <div>
      <span className={LABEL}>{label}</span>
      <ul className="space-y-0.5">
        {list.map((item, index) => (
          <li key={index} className="group flex items-center gap-1.5">
            <span
              aria-hidden
              className="ml-1 h-1 w-1 shrink-0 rounded-full bg-gray-400"
            />
            <input
              type="text"
              value={item}
              onChange={(event) => replace(index, event.target.value)}
              placeholder={placeholder}
              className={CONTROL}
            />
            <button
              type="button"
              onClick={() => onChange(list.filter((_, idx) => idx !== index))}
              aria-label={`Remove ${item || "skill"}`}
              className="shrink-0 rounded-md p-1.5 text-gray-300 opacity-0 transition-opacity hover:bg-gray-100 hover:text-gray-600 focus:opacity-100 focus-visible:outline-none group-hover:opacity-100"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => onChange([...list, ""])}
        className="mt-1 rounded-md px-2 py-1 text-label font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800"
      >
        + Add skill
      </button>
    </div>
  );
}

/**
 * The full editable job report. `showNotes` adds the tracker-only notes field.
 * `showIdentity` can be turned off where title and company are already edited
 * elsewhere on screen, as in the card modal heading.
 */
export default function JobDetailFields({
  value,
  onChange,
  showNotes = false,
  showIdentity = true,
}) {
  const set = (key) => (next) => onChange({ ...value, [key]: next });

  return (
    <div className="flex flex-col gap-4">
      {showIdentity && (
        <>
          <TextField
            label="Position title"
            value={value.position_title}
            onChange={set("position_title")}
            placeholder="Untitled role"
          />
          <TextField
            label="Company name"
            value={value.company_name}
            onChange={set("company_name")}
            placeholder="Unknown company"
          />
        </>
      )}
      <DateField
        label="Application deadline"
        value={value.deadline}
        onChange={set("deadline")}
      />
      <TextAreaField
        label="Job functions"
        value={value.job_functions}
        onChange={set("job_functions")}
        placeholder="What this role actually does."
      />
      <ListField
        label="Preferred skills"
        items={value.preferred_skills}
        onChange={set("preferred_skills")}
        placeholder="Skill or requirement"
      />
      {showNotes && (
        <TextAreaField
          label="Notes"
          value={value.notes}
          onChange={set("notes")}
          placeholder="Interview notes, recruiter contacts, anything you want to remember."
        />
      )}
    </div>
  );
}
