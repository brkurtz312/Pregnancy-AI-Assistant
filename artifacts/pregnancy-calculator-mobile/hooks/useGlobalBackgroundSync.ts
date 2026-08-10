import { useAuth } from "@clerk/expo";
import { useRef, useEffect } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListKickSessionsQueryKey,
  getListContractionsQueryKey,
} from "@workspace/api-client-react";
import { useNetReconnect } from "@/hooks/useNetReconnect";
import {
  hasPendingSync,
  clearPendingSync,
  tryAcquireSyncLock,
  releaseSyncLock,
  readWatchKickSessions,
  removeWatchKickSessionById,
  readWatchContractions,
  removeWatchContractionById,
  getWatchQueueGeneration,
} from "@/lib/sync-queue";
import { loadEntries, replaceEntryId } from "@/lib/journal";
import {
  apiUpsertJournalEntry,
  apiSaveHospitalBag,
  apiSaveBirthPlanAnswers,
  apiSaveWatchKickSession,
  apiSaveWatchContraction,
  isServerUuid,
} from "@/lib/sync-api";
import { loadHospitalBagChecklist } from "@/lib/hospital-bag";
import { loadBirthPlanAnswers } from "@/lib/birth-plan";

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

type TokenGetter = () => Promise<string | null>;
type UserIdGetter = () => string | null | undefined;

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

/**
 * Flushes pending Watch kick sessions for the given user.
 *
 * Uses a non-destructive approach: the queue is read without being cleared,
 * then each item is saved individually.  Only after a successful save is that
 * item removed from the queue by its `_clientId`.  This ensures that items
 * which fail mid-flush (or survive an app kill) remain in the queue and are
 * retried on the next reconnect.
 *
 * ACCOUNT SAFETY
 * The flush is bound to the `userId` whose queue it reads.  Before AND after
 * each network request the flush verifies:
 *   1. The session generation (in sync-queue) has not advanced — advancement
 *      means the user signed out, so we stop immediately and leave queued items
 *      intact (they will be cleared by `invalidateWatchQueueSession`).
 *   2. The currently authenticated userId (via `getActiveUserId()`) still
 *      matches — if a different user signed in since the flush started, the
 *      mutable `getToken` getter now returns that user's token, so any further
 *      POST would be cross-account. We stop rather than send the wrong data.
 *
 * The single-flight lock prevents concurrent flushes.
 */
async function syncPendingWatchKickSessions(
  userId: string,
  getToken: TokenGetter,
  getActiveUserId: UserIdGetter,
  onItemSaved?: () => void,
): Promise<void> {
  const genAtStart = getWatchQueueGeneration(userId);
  if (!tryAcquireSyncLock("watch-kicks")) return;
  try {
    const sessions = await readWatchKickSessions(userId);
    for (const session of sessions) {
      // Pre-request guard: verify identity before the async token fetch.
      if (getWatchQueueGeneration(userId) !== genAtStart) return;
      if (getActiveUserId() !== userId) return;

      // Snapshot the token while identity is confirmed.  Then re-check guards
      // once the async Clerk call resolves so that a sign-out that occurs while
      // the token is being fetched cannot let user A's frozen token reach
      // user B's API request if the account switches mid-await.
      let capturedToken: string | null = null;
      try {
        capturedToken = await getToken();
      } catch {
        // Token unavailable; leave item queued for the next reconnect.
        continue;
      }

      // Post-token-fetch guard — re-verify identity before the HTTP request.
      if (getWatchQueueGeneration(userId) !== genAtStart) return;
      if (getActiveUserId() !== userId) return;

      const frozenGetter: TokenGetter = () => Promise.resolve(capturedToken);
      try {
        await apiSaveWatchKickSession(session, frozenGetter);
        // Post-request guard — re-check before removing so we never remove an
        // item that may have been re-queued after an account switch.
        if (getWatchQueueGeneration(userId) !== genAtStart) return;
        if (getActiveUserId() !== userId) return;
        await removeWatchKickSessionById(userId, session._clientId);
        // Invalidate the Tools list so fresh data is visible after the flush.
        onItemSaved?.();
      } catch {
        // Leave item in queue; it will be retried on the next reconnect.
      }
    }
  } finally {
    releaseSyncLock("watch-kicks");
  }
}

/**
 * Flushes pending Watch contractions for the given user.
 * Same non-destructive per-item, generation-guarded pattern as
 * syncPendingWatchKickSessions.
 */
async function syncPendingWatchContractions(
  userId: string,
  getToken: TokenGetter,
  getActiveUserId: UserIdGetter,
  onItemSaved?: () => void,
): Promise<void> {
  const genAtStart = getWatchQueueGeneration(userId);
  if (!tryAcquireSyncLock("watch-contractions")) return;
  try {
    const contractions = await readWatchContractions(userId);
    for (const contraction of contractions) {
      // Pre-request guard
      if (getWatchQueueGeneration(userId) !== genAtStart) return;
      if (getActiveUserId() !== userId) return;

      // Snapshot the token and re-verify identity after the async fetch.
      // Same cross-account safety pattern as syncPendingWatchKickSessions.
      let capturedToken: string | null = null;
      try {
        capturedToken = await getToken();
      } catch {
        continue;
      }

      // Post-token-fetch guard
      if (getWatchQueueGeneration(userId) !== genAtStart) return;
      if (getActiveUserId() !== userId) return;

      const frozenGetter: TokenGetter = () => Promise.resolve(capturedToken);
      try {
        await apiSaveWatchContraction(contraction, frozenGetter);
        if (getWatchQueueGeneration(userId) !== genAtStart) return;
        if (getActiveUserId() !== userId) return;
        await removeWatchContractionById(userId, contraction._clientId);
        // Invalidate the Tools list so fresh data is visible after the flush.
        onItemSaved?.();
      } catch {
        // Leave item in queue; it will be retried on the next reconnect.
      }
    }
  } finally {
    releaseSyncLock("watch-contractions");
  }
}

async function runGlobalBackgroundSync(
  userId: string,
  getToken: TokenGetter,
  getActiveUserId: UserIdGetter,
  onKickSessionSaved?: () => void,
  onContractionSaved?: () => void,
): Promise<void> {
  await syncPendingJournal(getToken);
  await syncPendingHospitalBag(getToken);
  await syncPendingBirthPlan(getToken);
  await syncPendingWatchKickSessions(
    userId,
    getToken,
    getActiveUserId,
    onKickSessionSaved,
  );
  await syncPendingWatchContractions(
    userId,
    getToken,
    getActiveUserId,
    onContractionSaved,
  );
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
 *
 * Watch event flushes are additionally guarded by a session-generation counter
 * and a live userId check; see syncPendingWatchKickSessions for details.
 *
 * An initial-mount flush (useEffect below) handles the case where the app is
 * killed while offline and relaunched while already online — in that scenario
 * no offline → online network transition fires, so the reconnect handler is
 * never triggered.  The initial-mount flush ensures queued Watch events (and
 * other pending sync markers) are still flushed after relaunch.
 */
export function useGlobalBackgroundSync(): void {
  const { isSignedIn, getToken, userId } = useAuth();
  const queryClient = useQueryClient();

  const isSignedInRef = useRef(isSignedIn);
  isSignedInRef.current = isSignedIn;

  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;

  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const queryClientRef = useRef(queryClient);
  queryClientRef.current = queryClient;

  // Initial-mount / sign-in flush for Watch event queues.
  //
  // Watch kick sessions and contractions are stored directly in AsyncStorage
  // without a hasPendingSync marker, so the reconnect handler alone cannot
  // detect that there is queued data to send on an app relaunch while already
  // online (no offline → online transition fires).  This effect fills that gap:
  // it checks current connectivity via NetInfo.fetch() and, if online, flushes
  // pending Watch event queues using the same generation / userId guards as the
  // reconnect path to prevent cross-account data leaks.
  //
  // Journal, hospital-bag, and birth-plan are intentionally excluded here —
  // they are covered by the reconnect handler via their hasPendingSync markers,
  // and running them on every mount would cause duplicate upserts in tests and
  // potential race conditions with screen-level reconnect handlers.
  useEffect(() => {
    if (!isSignedIn || !userId) return;
    const flushUserId = userId;
    NetInfo.fetch()
      .then((state) => {
        if (state.isConnected !== true) return;
        return Promise.all([
          syncPendingWatchKickSessions(
            flushUserId,
            () => getTokenRef.current(),
            () => userIdRef.current,
            () => {
              queryClientRef.current.invalidateQueries({
                queryKey: getListKickSessionsQueryKey({ limit: 10, offset: 0 }),
              });
            },
          ),
          syncPendingWatchContractions(
            flushUserId,
            () => getTokenRef.current(),
            () => userIdRef.current,
            () => {
              queryClientRef.current.invalidateQueries({
                queryKey: getListContractionsQueryKey({
                  sessionDate: todayDate(),
                  limit: 50,
                }),
              });
            },
          ),
        ]);
      })
      .catch(() => {});
    // Run whenever the signed-in user identity changes (sign-in / account switch).
  }, [isSignedIn, userId]);

  useNetReconnect(() => {
    if (!isSignedInRef.current || !userIdRef.current) return;
    const flushUserId = userIdRef.current;
    runGlobalBackgroundSync(
      flushUserId,
      () => getTokenRef.current(),
      // Live getter so the flush can detect mid-flight user changes.
      () => userIdRef.current,
      () => {
        queryClientRef.current.invalidateQueries({
          queryKey: getListKickSessionsQueryKey({ limit: 10, offset: 0 }),
        });
      },
      () => {
        queryClientRef.current.invalidateQueries({
          queryKey: getListContractionsQueryKey({
            sessionDate: todayDate(),
            limit: 50,
          }),
        });
      },
    ).catch(() => {});
  });
}
