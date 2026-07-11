import type { JournalEntry, JournalMood } from "./web-journal";
import type { HospitalBagCategory } from "./web-hospital-bag";
import type { BirthPlanAnswers } from "./web-birth-plan";

type TokenGetter = () => Promise<string | null>;

async function authFetch<T = unknown>(
  path: string,
  getToken: TokenGetter,
  options: RequestInit = {},
): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const res = await fetch(path, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `API ${options.method ?? "GET"} ${path} failed ${res.status}: ${body}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Journal ─────────────────────────────────────────────────────────────────

interface ServerJournalEntry {
  id: string;
  text: string;
  mood?: string;
  gestationalWeeks?: number;
  gestationalDays?: number;
  postpartumDays?: number;
  createdAt: string;
  updatedAt: string;
}

function serverToLocal(e: ServerJournalEntry): JournalEntry {
  return {
    id: e.id,
    text: e.text,
    mood: e.mood as JournalMood | undefined,
    gestationalWeeks: e.gestationalWeeks,
    gestationalDays: e.gestationalDays,
    postpartumDays: e.postpartumDays,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/**
 * Returns true when `id` is a client-generated local ID (not a server UUID).
 * Local IDs look like "entry-{timestamp}-{random}" — they are NOT valid UUIDs
 * and must not be sent to the server.
 */
function isLocalId(id: string): boolean {
  return id.startsWith("entry-");
}

export async function apiLoadJournalEntries(
  getToken: TokenGetter,
): Promise<JournalEntry[]> {
  const data = await authFetch<{ entries: ServerJournalEntry[] }>(
    "/api/tools/journal",
    getToken,
  );
  return data.entries.map(serverToLocal);
}

export async function apiUpsertJournalEntry(
  entry: JournalEntry,
  getToken: TokenGetter,
): Promise<JournalEntry> {
  const body: Record<string, unknown> = {
    text: entry.text,
    mood: entry.mood ?? null,
    gestationalWeeks: entry.gestationalWeeks ?? null,
    gestationalDays: entry.gestationalDays ?? null,
    postpartumDays: entry.postpartumDays ?? null,
    createdAt: entry.createdAt,
  };
  // Only send `id` when it is a server-assigned UUID. Local IDs (entry-…) are
  // not valid UUIDs and would be rejected by the DB; omit them so the server
  // generates a proper UUID on insert.
  if (!isLocalId(entry.id)) {
    body.id = entry.id;
  }
  const data = await authFetch<ServerJournalEntry>(
    "/api/tools/journal",
    getToken,
    { method: "POST", body: JSON.stringify(body) },
  );
  return serverToLocal(data);
}

export async function apiDeleteJournalEntry(
  id: string,
  getToken: TokenGetter,
): Promise<void> {
  await authFetch(`/api/tools/journal/${id}`, getToken, { method: "DELETE" });
}

// ─── Hospital Bag ─────────────────────────────────────────────────────────────

export async function apiLoadHospitalBag(
  getToken: TokenGetter,
): Promise<HospitalBagCategory[] | null> {
  const data = await authFetch<{ categories: HospitalBagCategory[] | null }>(
    "/api/tools/hospital-bag",
    getToken,
  );
  return data.categories;
}

export async function apiSaveHospitalBag(
  categories: HospitalBagCategory[],
  getToken: TokenGetter,
): Promise<void> {
  await authFetch("/api/tools/hospital-bag", getToken, {
    method: "POST",
    body: JSON.stringify({ categories }),
  });
}

export async function apiDeleteHospitalBag(
  getToken: TokenGetter,
): Promise<void> {
  await authFetch("/api/tools/hospital-bag", getToken, { method: "DELETE" });
}

// ─── Birth Plan ───────────────────────────────────────────────────────────────

export async function apiLoadBirthPlanAnswers(
  getToken: TokenGetter,
): Promise<BirthPlanAnswers | null> {
  const data = await authFetch<{ answers: BirthPlanAnswers | null }>(
    "/api/tools/birth-plan",
    getToken,
  );
  return data.answers;
}

export async function apiSaveBirthPlanAnswers(
  answers: BirthPlanAnswers,
  getToken: TokenGetter,
): Promise<void> {
  await authFetch("/api/tools/birth-plan", getToken, {
    method: "POST",
    body: JSON.stringify({ answers }),
  });
}

export async function apiDeleteBirthPlanAnswers(
  getToken: TokenGetter,
): Promise<void> {
  await authFetch("/api/tools/birth-plan", getToken, { method: "DELETE" });
}
