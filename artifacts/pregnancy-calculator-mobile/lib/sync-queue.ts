import AsyncStorage from "@react-native-async-storage/async-storage";

export type SyncKey = "hospital-bag" | "birth-plan" | "journal";

const PREFIX = "pending_sync:";

export async function markPendingSync(key: SyncKey): Promise<void> {
  await AsyncStorage.setItem(`${PREFIX}${key}`, "1");
}

export async function clearPendingSync(key: SyncKey): Promise<void> {
  await AsyncStorage.removeItem(`${PREFIX}${key}`);
}

export async function hasPendingSync(key: SyncKey): Promise<boolean> {
  const v = await AsyncStorage.getItem(`${PREFIX}${key}`);
  return v !== null;
}

// ─── Single-flight sync lock ──────────────────────────────────────────────────
//
// Prevents two reconnect handlers (the global root hook and a tool screen's own
// useNetReconnect) from concurrently upserting the same local-only journal
// entries, which would create duplicate server records.
//
// Usage:
//   if (!tryAcquireSyncLock("journal")) return; // another path is running
//   try { ... } finally { releaseSyncLock("journal"); }

const syncInFlight = new Set<SyncKey>();

/**
 * Attempts to acquire the sync lock for the given key.
 * Returns `true` if the caller may proceed, `false` if another sync is already
 * in progress for the same key (caller should bail out immediately).
 */
export function tryAcquireSyncLock(key: SyncKey): boolean {
  if (syncInFlight.has(key)) return false;
  syncInFlight.add(key);
  return true;
}

/**
 * Releases the sync lock acquired by `tryAcquireSyncLock`.
 * Must be called in a `finally` block to ensure the lock is always freed.
 */
export function releaseSyncLock(key: SyncKey): void {
  syncInFlight.delete(key);
}
