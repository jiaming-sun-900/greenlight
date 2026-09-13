import { useCallback, useEffect, useRef, useState } from "react";
import { toISODate } from "../lib/dates.js";
import { PRIORITIES, derivePriority } from "../lib/priority.js";

const STORAGE_KEY = "greenlight_cards";

export const COLUMNS = [
  { id: "saved", label: "Saved", hint: "Screened, not applied yet" },
  { id: "applied", label: "Applied", hint: "Application submitted" },
  { id: "interviewing", label: "Interviewing", hint: "Active interview process" },
  { id: "offer", label: "Offer", hint: "Received an offer" },
  { id: "closed", label: "Closed", hint: "Rejected, withdrawn, or expired" },
];

export const COLUMN_IDS = COLUMNS.map((column) => column.id);

const VERDICTS = ["green", "yellow", "red"];

function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `card-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function asString(value) {
  return typeof value === "string" ? value : "";
}

/** Coerce anything loaded from storage (or handed over by the screener) into a valid card. */
function normalizeCard(raw) {
  if (!raw || typeof raw !== "object") return null;
  return {
    id: asString(raw.id) || newId(),
    column: COLUMN_IDS.includes(raw.column) ? raw.column : "saved",
    verdict: VERDICTS.includes(raw.verdict) ? raw.verdict : "yellow",
    // Stored as { tag, detected_phrase } objects, matching the backend shape.
    verdict_reasons: Array.isArray(raw.verdict_reasons)
      ? raw.verdict_reasons.filter((reason) => reason && typeof reason === "object")
      : [],
    position_title: asString(raw.position_title),
    company_name: asString(raw.company_name),
    job_functions: asString(raw.job_functions),
    preferred_skills: Array.isArray(raw.preferred_skills)
      ? raw.preferred_skills.map(asString)
      : [],
    deadline: toISODate(raw.deadline),
    // Cards saved before priority existed get one derived from what they stored.
    priority: PRIORITIES.includes(raw.priority)
      ? raw.priority
      : derivePriority(raw.verdict, raw.verdict_reasons),
    notes: asString(raw.notes),
    created_at: asString(raw.created_at) || new Date().toISOString(),
  };
}

function loadCards() {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(normalizeCard).filter(Boolean);
  } catch {
    // Corrupt or unavailable storage should not take the whole app down.
    return [];
  }
}

/**
 * Tracker card store, persisted to localStorage under `greenlight_cards`.
 * Lives in App so the screener and the tracker share one source of truth.
 */
export default function useCards() {
  const [cards, setCards] = useState(loadCards);
  const hydrated = useRef(false);

  useEffect(() => {
    // Skip the first run so a failed load can never overwrite good data.
    if (!hydrated.current) {
      hydrated.current = true;
      return;
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    } catch {
      // Out of quota or private-mode storage: keep working in memory.
    }
  }, [cards]);

  const addCard = useCallback((draft) => {
    const card = normalizeCard({
      ...draft,
      id: newId(),
      column: "saved",
      notes: "",
      created_at: new Date().toISOString(),
    });
    setCards((current) => [card, ...current]);
    return card;
  }, []);

  const updateCard = useCallback((id, patch) => {
    setCards((current) =>
      current.map((card) => (card.id === id ? { ...card, ...patch } : card))
    );
  }, []);

  const deleteCard = useCallback((id) => {
    setCards((current) => current.filter((card) => card.id !== id));
  }, []);

  const moveCard = useCallback((id, column) => {
    if (!COLUMN_IDS.includes(column)) return;
    setCards((current) =>
      current.map((card) => (card.id === id ? { ...card, column } : card))
    );
  }, []);

  return { cards, addCard, updateCard, deleteCard, moveCard };
}
