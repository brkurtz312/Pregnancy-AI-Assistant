export type JournalMood =
  | "happy"
  | "grateful"
  | "excited"
  | "tired"
  | "anxious"
  | "overwhelmed";

export const MOOD_OPTIONS: {
  value: JournalMood;
  emoji: string;
  label: string;
}[] = [
  { value: "happy", emoji: "😊", label: "Happy" },
  { value: "grateful", emoji: "🙏", label: "Grateful" },
  { value: "excited", emoji: "🤩", label: "Excited" },
  { value: "tired", emoji: "😴", label: "Tired" },
  { value: "anxious", emoji: "😰", label: "Anxious" },
  { value: "overwhelmed", emoji: "😩", label: "A Lot" },
];

export interface JournalEntry {
  id: string;
  createdAt: string;
  updatedAt: string;
  text: string;
  mood?: JournalMood;
  gestationalWeeks?: number;
  gestationalDays?: number;
  postpartumDays?: number;
}

const JOURNAL_KEY = "pregnancy_journal_entries_v1";

export function loadJournalEntries(): JournalEntry[] {
  try {
    const raw = localStorage.getItem(JOURNAL_KEY);
    return raw ? (JSON.parse(raw) as JournalEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveJournalEntries(entries: JournalEntry[]): void {
  localStorage.setItem(JOURNAL_KEY, JSON.stringify(entries));
}

export function upsertJournalEntry(entry: JournalEntry): void {
  const entries = loadJournalEntries();
  const idx = entries.findIndex((e) => e.id === entry.id);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.unshift(entry);
  }
  saveJournalEntries(entries);
}

export function deleteJournalEntry(id: string): void {
  const entries = loadJournalEntries().filter((e) => e.id !== id);
  saveJournalEntries(entries);
}

export function getJournalAgeLabel(entry: JournalEntry): string {
  if (entry.postpartumDays !== undefined) {
    if (entry.postpartumDays < 7)
      return `Day ${entry.postpartumDays + 1} postpartum`;
    const weeks = Math.floor(entry.postpartumDays / 7);
    const days = entry.postpartumDays % 7;
    return days > 0 ? `${weeks}w ${days}d postpartum` : `${weeks}w postpartum`;
  }
  if (entry.gestationalWeeks !== undefined) {
    const d = entry.gestationalDays ?? 0;
    return d > 0
      ? `Week ${entry.gestationalWeeks} + ${d}d`
      : `Week ${entry.gestationalWeeks}`;
  }
  return "";
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function formatLongDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function buildJournalHtml(entries: JournalEntry[]): string {
  const exportDate = new Date().toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const sorted = [...entries].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );

  const entrySections = sorted
    .map((entry) => {
      const ageLabel = getJournalAgeLabel(entry);
      const moodOpt = entry.mood
        ? MOOD_OPTIONS.find((m) => m.value === entry.mood)
        : null;
      return `
      <div class="entry">
        <div class="entry-date">${formatLongDate(entry.createdAt)}</div>
        <div class="entry-meta">
          ${ageLabel ? `<span class="pill age">${escapeHtml(ageLabel)}</span>` : ""}
          ${moodOpt ? `<span class="mood">${moodOpt.emoji} ${moodOpt.label}</span>` : ""}
        </div>
        ${entry.text ? `<div class="entry-text">${escapeHtml(entry.text).replace(/\n/g, "<br/>")}</div>` : ""}
      </div>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>My Pregnancy Journal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, "Times New Roman", serif; background: #fff; color: #2d1f1a; padding: 48px 52px; }
    .cover { text-align: center; padding: 64px 0 72px; border-bottom: 2px solid #f0d8d0; margin-bottom: 56px; }
    .cover-title { font-size: 38px; color: #c96b6b; letter-spacing: 3px; margin-bottom: 10px; }
    .cover-sub { font-size: 13px; color: #9a7070; letter-spacing: 2px; text-transform: uppercase; font-family: Arial, sans-serif; }
    .cover-count { font-size: 12px; color: #c0a8a8; margin-top: 20px; font-family: Arial, sans-serif; }
    .entry { margin-bottom: 48px; padding-bottom: 40px; border-bottom: 1px solid #f0e8e4; page-break-inside: avoid; }
    .entry:last-child { border-bottom: none; }
    .entry-date { font-size: 15px; font-weight: bold; color: #c96b6b; margin-bottom: 8px; }
    .entry-meta { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
    .pill { font-size: 10px; padding: 2px 9px; border-radius: 20px; font-family: Arial, sans-serif; }
    .pill.age { background: #fce8e0; color: #c96b6b; }
    .mood { font-size: 12px; color: #9a7070; font-family: Arial, sans-serif; }
    .entry-text { font-size: 14px; line-height: 2; color: #3d2a2a; }
    @media print { .entry { page-break-inside: avoid; } }
  </style>
</head>
<body>
  <div class="cover">
    <div class="cover-title">My Pregnancy Journal</div>
    <div class="cover-sub">A record of this beautiful journey</div>
    <div class="cover-count">Exported ${exportDate} &nbsp;·&nbsp; ${entries.length} ${entries.length === 1 ? "entry" : "entries"}</div>
  </div>
  ${entrySections}
</body>
</html>`;
}
