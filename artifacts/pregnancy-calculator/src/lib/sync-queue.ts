/**
 * sync-queue.ts
 *
 * Tracks which data stores have un-synced local changes so they can be
 * retried when connectivity is restored.  Everything is kept in localStorage
 * so the pending state survives page reloads.
 *
 * Design: each feature has a simple "dirty" flag.  The full data blob is
 * already stored in the feature's own localStorage key by the normal local-
 * storage helpers (saveHospitalBag, saveBirthPlanAnswers, saveJournalEntries),
 * so we only need to record *that* a retry is needed, not the payload itself.
 */

const KEY_HOSPITAL_BAG = "syncPending:hospitalBag";
const KEY_BIRTH_PLAN = "syncPending:birthPlan";
const KEY_JOURNAL_ENTRIES = "syncPending:journalEntries"; // comma-separated local entry IDs

// ─── Hospital Bag ─────────────────────────────────────────────────────────────

export function markHospitalBagPending(): void {
  localStorage.setItem(KEY_HOSPITAL_BAG, "1");
}

export function clearHospitalBagPending(): void {
  localStorage.removeItem(KEY_HOSPITAL_BAG);
}

export function isHospitalBagPending(): boolean {
  return localStorage.getItem(KEY_HOSPITAL_BAG) === "1";
}

// ─── Birth Plan ───────────────────────────────────────────────────────────────

export function markBirthPlanPending(): void {
  localStorage.setItem(KEY_BIRTH_PLAN, "1");
}

export function clearBirthPlanPending(): void {
  localStorage.removeItem(KEY_BIRTH_PLAN);
}

export function isBirthPlanPending(): boolean {
  return localStorage.getItem(KEY_BIRTH_PLAN) === "1";
}

// ─── Journal Entries ──────────────────────────────────────────────────────────

export function markJournalEntryPending(id: string): void {
  const existing = getPendingJournalIds();
  if (!existing.includes(id)) {
    localStorage.setItem(KEY_JOURNAL_ENTRIES, [...existing, id].join(","));
  }
}

export function clearJournalEntryPending(id: string): void {
  const remaining = getPendingJournalIds().filter((i) => i !== id);
  if (remaining.length === 0) {
    localStorage.removeItem(KEY_JOURNAL_ENTRIES);
  } else {
    localStorage.setItem(KEY_JOURNAL_ENTRIES, remaining.join(","));
  }
}

export function clearAllJournalPending(): void {
  localStorage.removeItem(KEY_JOURNAL_ENTRIES);
}

export function getPendingJournalIds(): string[] {
  const raw = localStorage.getItem(KEY_JOURNAL_ENTRIES);
  if (!raw) return [];
  return raw.split(",").filter(Boolean);
}
