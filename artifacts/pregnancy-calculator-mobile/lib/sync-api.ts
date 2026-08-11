import type { JournalEntry, JournalMood } from "./journal";
import type { HospitalBagCategory } from "./hospital-bag";
import type { BirthPlanAnswers } from "./birth-plan";
import type { PendingKickSession, PendingContraction } from "./sync-queue";

type TokenGetter = () => Promise<string | null>;

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  return domain ? `https://${domain}` : "";
}

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
  const url = `${getApiBase()}${path}`;
  const res = await fetch(url, { ...options, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `API ${options.method ?? "GET"} ${path} failed ${res.status}: ${body}`,
    );
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

// ─── Journal ──────────────────────────────────────────────────────────────────

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
    media: [],
  };
}

/**
 * Returns true when `id` is a server-assigned UUID (contains hyphens in the
 * expected UUID v4 pattern). Local IDs generated on-device are base36-encoded
 * timestamps and will not match.
 */
export function isServerUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id,
  );
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

/**
 * Upserts the journal entry on the server. Omits `id` for locally-generated
 * (non-UUID) IDs so the server creates a new record and returns a UUID.
 * Returns the server entry, with media preserved from the local copy.
 */
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
  if (isServerUuid(entry.id)) {
    body.id = entry.id;
  }
  const data = await authFetch<ServerJournalEntry>(
    "/api/tools/journal",
    getToken,
    { method: "POST", body: JSON.stringify(body) },
  );
  return { ...serverToLocal(data), media: entry.media };
}

/**
 * Deletes the journal entry from the server. Skips silently if the ID is a
 * locally-generated (non-UUID) ID that was never synced to the server.
 */
export async function apiDeleteJournalEntry(
  id: string,
  getToken: TokenGetter,
): Promise<void> {
  if (!isServerUuid(id)) return;
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

// ─── Watch events ─────────────────────────────────────────────────────────────

export async function apiSaveWatchKickSession(
  session: PendingKickSession,
  getToken: TokenGetter,
): Promise<void> {
  // Strip the local-only _clientId before sending to the API.
  const { _clientId: _ignored, ...payload } = session;
  await authFetch("/api/tools/kick-sessions", getToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function apiSaveWatchContraction(
  contraction: PendingContraction,
  getToken: TokenGetter,
): Promise<void> {
  // Strip the local-only _clientId before sending to the API.
  const { _clientId: _ignored, ...payload } = contraction;
  await authFetch("/api/tools/contractions", getToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

// ─── Direct (live) Watch event saves ─────────────────────────────────────────
//
// Used by WatchBackgroundListener for the primary (online) save path.  These
// functions accept a token getter that the caller must snapshot and verify
// against the session generation BEFORE calling, ensuring the request is
// always sent with the token that belongs to the user who owns the data.

export interface WatchKickSessionPayload {
  startedAt?: string | null;
  endedAt?: string | null;
  kickCount?: number | null;
  /** Server-enforced idempotency key for Watch-originated sessions (the Watch
   *  session's startedAt).  A retry of the same logical session returns the
   *  existing row instead of creating a duplicate. */
  watchSessionId?: string | null;
}

export interface WatchContractionPayload {
  startedAt: string;
  endedAt?: string | null;
  durationSeconds?: number | null;
  intervalSeconds?: number | null;
  sessionDate: string;
  /** Watch-assigned UUID used as a server-enforced idempotency key.
   *  When supplied, the server returns the existing row if one with this ID
   *  already exists, preventing a duplicate save on replay after a phone
   *  force-quit between API success and native receipt acknowledgement. */
  watchRecordId?: string | null;
}

export async function apiDirectSaveKickSession(
  session: WatchKickSessionPayload,
  getToken: TokenGetter,
): Promise<void> {
  await authFetch("/api/tools/kick-sessions", getToken, {
    method: "POST",
    body: JSON.stringify(session),
  });
}

export async function apiDirectSaveContraction(
  contraction: WatchContractionPayload,
  getToken: TokenGetter,
): Promise<void> {
  await authFetch("/api/tools/contractions", getToken, {
    method: "POST",
    body: JSON.stringify(contraction),
  });
}
