import { useAuth } from "@clerk/expo";
import { useRef } from "react";
import { useNetReconnect } from "@/hooks/useNetReconnect";
import {
  hasPendingSync,
  clearPendingSync,
  tryAcquireSyncLock,
  releaseSyncLock,
} from "@/lib/sync-queue";
import { loadEntries, replaceEntryId } from "@/lib/journal";
import {
  apiUpsertJournalEntry,
  apiSaveHospitalBag,
  apiSaveBirthPlanAnswers,
  isServerUuid,
} from "@/lib/sync-api";
import { loadHospitalBagChecklist } from "@/lib/hospital-bag";
import { loadBirthPlanAnswers } from "@/lib/birth-plan";

type TokenGetter = () => Promise<string | null>;

async function syncPendingJournal(getToken: TokenGetter): Promise<void> {
  if (!(await hasPendingSync("journal"))) return;
  // Acquire the single-flight lock.  If the journal screen's own reconnect
  // handler got here first (screen is mounted), defer to it — it runs the full
  // server-merge path and will clear the pending marker on success.
  if (!tryAcquireSyncLock("journal")) return;
  try {
    const entries = await loadEntries();
    const unsynced = entries.filter((e) => !isServerUuid(e.id));
    let allSucceeded = true;
    for (const entry of unsynced) {
      try {
        const synced = await apiUpsertJournalEntry(entry, getToken);
        // Replace the local base36 ID with the server UUID so the journal
        // screen does not re-upsert this entry as a new record (duplicate).
        if (synced.id !== entry.id) {
          await replaceEntryId(entry.id, synced.id);
        }
      } catch {
        allSucceeded = false;
      }
    }
    if (allSucceeded) {
      await clearPendingSync("journal");
    }
  } finally {
    releaseSyncLock("journal");
  }
}

async function syncPendingHospitalBag(getToken: TokenGetter): Promise<void> {
  if (!(await hasPendingSync("hospital-bag"))) return;
  try {
    const categories = await loadHospitalBagChecklist();
    await apiSaveHospitalBag(categories, getToken);
    await clearPendingSync("hospital-bag");
  } catch {
    // will retry on the next reconnect
  }
}

async function syncPendingBirthPlan(getToken: TokenGetter): Promise<void> {
  if (!(await hasPendingSync("birth-plan"))) return;
  try {
    const answers = await loadBirthPlanAnswers();
    await apiSaveBirthPlanAnswers(answers, getToken);
    await clearPendingSync("birth-plan");
  } catch {
    // will retry on the next reconnect
  }
}

async function runGlobalBackgroundSync(getToken: TokenGetter): Promise<void> {
  await syncPendingJournal(getToken);
  await syncPendingHospitalBag(getToken);
  await syncPendingBirthPlan(getToken);
}

/**
 * Registers a global reconnect listener at the app root so pending sync
 * markers are flushed whenever connectivity is restored, regardless of which
 * screen is currently visible.  Each tool screen's own useNetReconnect
 * listener handles UI state; this hook handles the network push for the case
 * where those screens are not mounted.
 *
 * A single-flight lock (tryAcquireSyncLock / releaseSyncLock from sync-queue)
 * prevents this hook and a mounted tool screen's reconnect handler from both
 * upserting the same local-only journal entry simultaneously, which would
 * create duplicate server records.
 */
export function useGlobalBackgroundSync(): void {
  const { isSignedIn, getToken } = useAuth();

  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  useNetReconnect(() => {
    if (!isSignedInRef.current) return;
    runGlobalBackgroundSync(getTokenRef.current).catch(() => {});
  });
}
