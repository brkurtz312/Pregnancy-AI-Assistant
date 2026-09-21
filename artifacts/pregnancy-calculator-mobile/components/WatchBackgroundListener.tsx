/**
 * WatchBackgroundListener
 *
 * Subscribes to Apple Watch events (kick session end, contraction update) at
 * the root layout level so data is never dropped when the user is on a tab
 * other than Tools.  The component saves each record to the API and shows a
 * brief confirmation toast, then invalidates the relevant React Query caches so
 * the Tools tab sees fresh data next time it mounts.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Animated, Platform, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  clearWatchBridgeFailure,
  countWatchBridge,
  getWatchBridgeFailure,
  recordWatchBridgeFailure,
} from "@/lib/watch-bridge-log";
import { Ionicons } from "@expo/vector-icons";
import { useAppAuth as useAuth } from "@/hooks/useAppAuth";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListKickSessionsQueryKey,
  getListContractionsQueryKey,
  useGetProfile,
  getGetProfileQueryKey,
} from "@workspace/api-client-react";
import {
  apiDirectSaveKickSession,
  apiDirectSaveContraction,
} from "@/lib/sync-api";
import {
  useWatchConnectivity,
  type KickSessionSummary,
  type ContractionRecord,
  type WatchTip,
} from "@/hooks/useWatchConnectivity";
// Lazy-require so Android / missing-module builds degrade cleanly.
function getWatchModule() {
  try {
    const mod = require("../modules/WatchConnectivity");
    return mod?.default ?? mod ?? null;
  } catch {
    return null;
  }
}
import { getWeeklyDevelopment } from "@/lib/fetal-development";
import { calculateByDueDate } from "@/lib/pregnancy-math";
import {
  enqueueWatchKickSession,
  enqueueWatchContraction,
  getWatchQueueGeneration,
  isKickSessionRecentlySaved,
  markKickSessionSaved,
} from "@/lib/sync-queue";
import { parseApiDate, localDateString } from "@/lib/dates";

// ─── Toast ────────────────────────────────────────────────────────────────────

interface WatchToastState {
  message: string;
  visible: boolean;
  isError?: boolean;
}

/** Height of the native bottom tab bar (pt). */
/**
 * How long to wait for setActiveWatchUser before draining anyway. The native
 * body is synchronous; a promise still pending after this is not coming back.
 */
const REGISTER_TIMEOUT_MS = 1000;

const TAB_BAR_HEIGHT = 49;
/** Extra breathing room above the tab bar (pt). */
const TOAST_MARGIN = 8;

function WatchToast({ message, visible, isError }: WatchToastState) {
  const opacity = useRef(new Animated.Value(0)).current;
  const { bottom: safeBottom } = useSafeAreaInsets();

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 200 : 300,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  // Sit above the tab bar on every device: tab bar height + safe-area inset +
  // a small gap.  On devices with a home indicator (iPhone ≥ X) the inset is
  // typically 34 pt; on iPad it is 0–20 pt; on older phones it is 0.
  const toastBottom = TAB_BAR_HEIGHT + safeBottom + TOAST_MARGIN;

  return (
    <Animated.View
      style={[styles.toast, { opacity, bottom: toastBottom }]}
      pointerEvents="none"
    >
      <View
        style={[
          styles.inner,
          isError ? styles.innerError : styles.innerSuccess,
        ]}
      >
        <Ionicons
          name={isError ? "alert-circle-outline" : "checkmark-circle-outline"}
          size={15}
          color="#fff"
        />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

// ─── Live kick-count banner ────────────────────────────────────────────────────

interface LiveKickBannerProps {
  count: number | null;
  safeBottom: number;
}

/**
 * Persistent floating banner that appears while a Watch kick-counting session
 * is in progress.  It mounts only when `count` is non-null and unmounts
 * (cleanly removing itself from the tree) as soon as the session ends so that
 * the stale count is never visible — even briefly — after onKickSessionEnd.
 */
function LiveKickBanner({ count, safeBottom }: LiveKickBannerProps) {
  if (count === null) return null;

  const bannerBottom = TAB_BAR_HEIGHT + safeBottom + TOAST_MARGIN;

  return (
    <View
      style={[styles.toast, { bottom: bannerBottom + 52 }]}
      pointerEvents="none"
    >
      <View style={[styles.inner, styles.innerLiveKick]}>
        <Text style={styles.text}>
          {`⌚ Watch session in progress — ${count} kick${count === 1 ? "" : "s"}`}
        </Text>
      </View>
    </View>
  );
}

// ─── Listener ─────────────────────────────────────────────────────────────────

export function WatchBackgroundListener() {
  const { isSignedIn, userId, getToken } = useAuth();
  const queryClient = useQueryClient();

  // ── Kick-session deduplication ────────────────────────────────────────────
  // The Watch may retry onKickSessionEnd for the same logical session (e.g.
  // after a WCSession reconnect) even though the phone already recorded it via
  // handleEndSession.  Two layers of protection prevent a duplicate write:
  //
  //  1. React Query cache check — if the session is already in the cached list
  //     (e.g. because the phone saved it and the list has since been fetched)
  //     the Watch retry is silently dropped.
  //
  //  2. In-process Set — added OPTIMISTICALLY before the async API call so
  //     concurrent Watch callbacks for the same startedAt are blocked
  //     immediately.  Removed from the Set if the save fails so that the
  //     offline-queue retry path is not accidentally gated.
  //
  // The Set is cleared whenever the userId changes (sign-out / account switch)
  // so one user's history never bleeds into another's on a shared device.
  const savedKickStartsRef = useRef(new Set<string>());
  // Clerk userId can be string | null | undefined depending on auth state.
  const lastUserIdRef = useRef<string | null | undefined>(undefined);
  if (userId !== lastUserIdRef.current) {
    savedKickStartsRef.current.clear();
    lastUserIdRef.current = userId;
  }

  // ── Tips sync ─────────────────────────────────────────────────────────────
  // Compute tips here (globally mounted) so they sync on every app open,
  // not only when the Home or Tools tab happens to be active.
  const { data: profile } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });

  const gestationalWeek = useMemo(() => {
    if (!profile?.dueDate) return undefined;
    try {
      return calculateByDueDate(parseApiDate(profile.dueDate))
        .currentGestationalAgeWeeks;
    } catch {
      return undefined;
    }
  }, [profile?.dueDate]);

  const watchTips = useMemo((): WatchTip[] => {
    if (gestationalWeek == null) return [];
    const weekData = getWeeklyDevelopment(gestationalWeek);
    return [
      {
        week: gestationalWeek,
        emoji: "👶",
        text:
          weekData.development[0] ??
          `Week ${gestationalWeek}: Baby is growing every day.`,
      },
      {
        week: gestationalWeek,
        emoji: "🤰",
        text: weekData.motherChanges[0] ?? "Take care of yourself this week.",
      },
      {
        week: gestationalWeek,
        emoji: "📅",
        text: weekData.comingUp,
      },
      {
        week: gestationalWeek,
        emoji: "💧",
        text: "Stay hydrated — aim for 8–10 glasses of water daily.",
      },
    ];
  }, [gestationalWeek]);

  // ── Live kick-count state ─────────────────────────────────────────────────
  // null  → no Watch session currently in progress (banner hidden)
  // number → Watch session active; value reflects the latest tap count
  const [liveKickCount, setLiveKickCount] = useState<number | null>(null);

  const handleKickUpdate = useCallback((count: number) => {
    setLiveKickCount(count);
  }, []);

  // Reset the live-count banner whenever the user signs out so a stale
  // mid-session count is never visible to the next user on a shared device.
  useEffect(() => {
    if (!isSignedIn) {
      setLiveKickCount(null);
    }
  }, [isSignedIn]);

  const [toast, setToast] = useState<WatchToastState>({
    message: "",
    visible: false,
  });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, isError = false) => {
    setToast({ message, visible: true, isError });
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setToast((prev) => ({ ...prev, visible: false }));
    }, 3000);
  }, []);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const handleKickSessionEnd = useCallback(
    async (session: KickSessionSummary) => {
      if (!isSignedIn || !userId) return;

      // The session is over — clear the live-count banner immediately so the
      // user doesn't see a stale mid-session count while the save is in flight.
      setLiveKickCount(null);

      // ── Deduplication guard ───────────────────────────────────────────────
      // Layer 1: in-process Set — added optimistically so that a concurrent
      // duplicate callback is blocked before either request is sent.
      if (savedKickStartsRef.current.has(session.startedAt)) return;

      // Layer 2: React Query cache — catches the primary scenario where the
      // phone already saved this session (handleEndSession → refetch) before
      // the Watch retry fires.
      const cachedList = queryClient.getQueryData<{
        items: Array<{ startedAt: string }>;
      }>(getListKickSessionsQueryKey({ limit: 10, offset: 0 }));
      if (cachedList?.items?.some((s) => s.startedAt === session.startedAt)) {
        return;
      }

      // Optimistically claim this startedAt so any concurrent duplicate
      // callback is blocked immediately (before any async gap).
      savedKickStartsRef.current.add(session.startedAt);

      // Capture the session generation at Watch-event-receive time.
      const capturedGen = getWatchQueueGeneration(userId);

      // Layer 3: persisted recent-saves store — covers the cold-start gap.
      // The in-process Set (layer 1) dies with the JS process, so if the app
      // is force-quit after a successful save and the Watch retries the same
      // session on relaunch, only this persisted check can suppress it.
      try {
        if (await isKickSessionRecentlySaved(userId, session.startedAt)) {
          return; // already saved within the last 24h — drop the retry
        }
      } catch {
        // Persisted-store read failed — fall through to the API save; the
        // server-side layers above still guard the common duplicate paths.
      }
      // Re-verify the session is still valid after the async store read.
      if (getWatchQueueGeneration(userId) !== capturedGen) return;

      // Snapshot the token for THIS user's session before any async gap.
      // Using a frozen getter ensures the HTTP request always carries the token
      // that corresponds to the data owner, even if another user signs in while
      // the request is in flight.
      const token = await getToken();
      // Re-verify the session is still valid after the async token fetch.
      if (getWatchQueueGeneration(userId) !== capturedGen) return;

      const frozenGetter = () => Promise.resolve(token);

      try {
        await apiDirectSaveKickSession(
          {
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            kickCount: session.kickCount,
            // Server-enforced idempotency key: even if the app is force-quit
            // before the persisted recent-save marker below commits, a Watch
            // retry of this logical session returns the existing row instead
            // of creating a duplicate.
            watchSessionId: session.startedAt,
          },
          frozenGetter,
        );
        // Re-verify before touching the cache — if sign-out occurred during the
        // request the data was either accepted with the correct (frozen) token
        // or rejected by the server; either way, do not update this session's cache.
        if (getWatchQueueGeneration(userId) !== capturedGen) return;
        // Persist the startedAt (24h TTL) so a Watch retry after force-quit +
        // relaunch is suppressed even though the in-process Set is gone.
        // Awaited so the marker is durably committed before this save path
        // completes; if the write fails we still proceed — the server-side
        // watchSessionId unique constraint is the backstop for duplicates.
        try {
          await markKickSessionSaved(userId, session.startedAt);
        } catch {
          // Non-fatal: dedup falls back to the server idempotency key.
        }
        // Invalidate the base kick-session key so every variant is refreshed:
        // – KickCounterSection in tools.tsx   (limit:10, offset:0)
        // – KickHistoryTab in session-history.tsx (limit:50, offset:0)
        // React Query treats the base key as a prefix and invalidates every
        // matching query, so both screens update without a manual pull-to-refresh.
        queryClient.invalidateQueries({
          queryKey: getListKickSessionsQueryKey(),
        });
        showToast("Kick session saved");
      } catch {
        // Save failed — remove from the dedup Set so the offline-queue retry
        // path is not permanently blocked for this session.
        savedKickStartsRef.current.delete(session.startedAt);
        // Save locally so the data isn't lost; retry when connectivity returns.
        try {
          await enqueueWatchKickSession(
            {
              startedAt: session.startedAt,
              endedAt: session.endedAt,
              kickCount: session.kickCount,
              // Forward the idempotency key so the queue flush submits it too
              // and a flush/retry race cannot create a duplicate row.
              watchSessionId: session.startedAt,
            },
            userId,
            capturedGen,
          );
          showToast("Kick session saved locally — will sync when online", true);
        } catch {
          showToast(
            "Kick session couldn't be saved. Please log it manually.",
            true,
          );
        }
      }
    },
    [isSignedIn, userId, getToken, queryClient, showToast],
  );

  const handleContractionUpdate = useCallback(
    async (record: ContractionRecord, opts?: { nativeReceiptId?: string }) => {
      if (!isSignedIn || !userId) {
        // Silent until now, and a real possibility: the record arrives while
        // JS considers itself signed out, so nothing is saved and nothing says so.
        countWatchBridge({ droppedSignedOut: 1 });
        return;
      }
      const capturedGen = getWatchQueueGeneration(userId);

      // `await getToken()` was outside the try below, so a rejection threw
      // straight out of this handler: no save, no toast, no error, and the
      // native receipt never acknowledged — so it replays on every launch and
      // fails the same silent way. That is indistinguishable from the Watch
      // never having delivered anything.
      let token: string | null;
      try {
        token = await getToken();
      } catch (err) {
        countWatchBridge({ tokenFailed: 1 });
        recordWatchBridgeFailure("dispatch", err);
        return;
      }
      if (getWatchQueueGeneration(userId) !== capturedGen) {
        countWatchBridge({ droppedGeneration: 1 });
        return;
      }

      const frozenGetter = () => Promise.resolve(token);

      const durationSeconds =
        record.startedAt && record.endedAt
          ? Math.round(
              (new Date(record.endedAt).getTime() -
                new Date(record.startedAt).getTime()) /
                1000,
            )
          : undefined;

      try {
        await apiDirectSaveContraction(
          {
            startedAt: record.startedAt,
            endedAt: record.endedAt ?? undefined,
            durationSeconds,
            intervalSeconds: record.interval,
            sessionDate: localDateString(),
            // Pass the Watch-assigned UUID as a server-enforced idempotency key.
            // If the phone is force-quit after the API succeeds but before the
            // native receipt acknowledgement fires, the startup drain will replay
            // this record. The server returns the existing row instead of creating
            // a duplicate when watchRecordId matches an already-saved record.
            watchRecordId: record.id ?? null,
          },
          frozenGetter,
        );
        if (getWatchQueueGeneration(userId) !== capturedGen) return;
        // Remove from the phone's native pending store now that the record is
        // durably saved to the API. This prevents the record from being replayed
        // on the next app launch.
        const nativeId = opts?.nativeReceiptId ?? record.id;
        if (nativeId) {
          getWatchModule()
            ?.acknowledgeContractionReceipt(nativeId)
            ?.catch(() => {});
        }
        // Invalidate the base contraction key so every variant is refreshed:
        // – the single-date view in tools.tsx (sessionDate + limit:50)
        // – the all-dates view in session-history.tsx (limit:200, no sessionDate)
        // React Query treats the base key as a prefix and invalidates every
        // matching query, so both screens update without a manual pull-to-refresh.
        countWatchBridge({ saved: 1 });
        queryClient.invalidateQueries({
          queryKey: getListContractionsQueryKey(),
        });
        showToast("Contraction recorded");
      } catch {
        // Direct API save failed; enqueue the record locally so it is retried
        // when connectivity returns.  The Watch UUID is forwarded as watchRecordId
        // so that the queue flush — and the native startup drain — both submit the
        // same idempotency key to the server.  This ensures that if both paths
        // race (offline queue flush + startup drain replay), only one row is saved.
        try {
          await enqueueWatchContraction(
            {
              startedAt: record.startedAt,
              endedAt: record.endedAt ?? undefined,
              durationSeconds,
              intervalSeconds: record.interval,
              sessionDate: localDateString(),
              // Propagate the Watch UUID so the offline queue flush submits the
              // same idempotency key as the startup drain path.
              watchRecordId: record.id ?? null,
            },
            userId,
            capturedGen,
          );
          // Now that the record is durably held in the offline queue, clear it
          // from the native receipt store.  If the app is killed before this
          // line, the worst outcome is a redundant queue entry on next launch —
          // the idempotency key prevents a duplicate API row.
          const nativeId = opts?.nativeReceiptId ?? record.id;
          if (nativeId) {
            getWatchModule()
              ?.acknowledgeContractionReceipt(nativeId)
              ?.catch(() => {});
          }
          countWatchBridge({ queued: 1 });
          showToast("Contraction saved locally — will sync when online", true);
        } catch {
          showToast(
            "Contraction couldn't be saved. Please log it manually.",
            true,
          );
        }
      }
    },
    [isSignedIn, userId, getToken, queryClient, showToast],
  );

  // ── Active user gate + startup drain (chained, generation-gated) ───────────
  //
  // setActiveWatchUser MUST complete before getPendingContractionReceipts is
  // called, otherwise the native bridge has not yet registered the active user
  // and getPendingContractionReceipts returns an empty array (wrong partition).
  //
  // A monotonically increasing generation counter (drainGenRef) is captured at
  // the start of each effect run.  Every async stage re-checks that the counter
  // has not advanced before doing any native I/O or dispatching health data.
  // This ensures a stale chain initiated for user A that resolves after B has
  // signed in cannot:
  //   • re-register A's native partition (which would redirect incoming Watch
  //     deliveries to A's UserDefaults key-space while B is the active user), or
  //   • read A's receipts and call handleContractionUpdate with A's health data
  //     under B's authenticated session / React Query context.
  // Guards the one-shot nature of a bridge-failure toast. Showing a toast
  // sets state; this effect re-runs on renders it does not control; so an
  // ungated toast is a loop waiting to happen. The persistent message under
  // the Watch badge is what the user reads at leisure — the toast only has to
  // fire once to draw the eye.
  const reportedRef = useRef<string | null>(null);
  const reportOnce = useCallback(
    (message: string) => {
      if (reportedRef.current === message) return;
      reportedRef.current = message;
      showToast(message, true);
    },
    [showToast],
  );

  const drainedForUserRef = useRef<string | null>(null);
  const drainGenRef = useRef(0);
  useEffect(() => {
    const mod = getWatchModule();
    if (!mod) {
      // Not a no-op worth staying quiet about on iOS: without the module the
      // phone can never accept a Watch record.
      if (Platform.OS === "ios") {
        const f = recordWatchBridgeFailure("module", null);
        reportOnce(f.message);
      }
      return;
    }

    if (!isSignedIn || !userId) {
      // Signed out: deregister active user so incoming Watch deliveries are dropped.
      // No generation check needed — deregistration is always safe.
      mod.setActiveWatchUser(null)?.catch((err: unknown) => {
        recordWatchBridgeFailure("deregister", err);
      });
      return;
    }

    if (drainedForUserRef.current === userId) {
      countWatchBridge({ alreadyDrained: 1 });
      return; // already drained this session
    }
    countWatchBridge({ effectRuns: 1 });
    drainedForUserRef.current = userId;

    // Claim a generation token for this effect run.  Any async work started by
    // a previous run will observe gen !== drainGenRef.current and abort.
    //
    // Claimed HERE, not at the top of the effect. This effect re-runs
    // constantly — its deps include handleContractionUpdate, whose identity
    // changes with Clerk's getToken on every render — and the runs that
    // return at the already-drained guard above do no work at all. Bumping
    // the token on those runs invalidated the one chain that was actually
    // draining, milliseconds after it started, on every launch. The drain
    // then abandoned itself at its first generation check, before any
    // counter, which is why it looked like the register promise had never
    // settled. 18 skipped runs, one real chain, killed by all of them.
    const gen = ++drainGenRef.current;

    // Stage 1: register the active user in the native bridge.
    //
    // Raced against a timeout, because this promise not settling is exactly
    // what broke Watch sync: the native side set the active user and went on
    // acknowledging records, while `await` here never returned and the drain
    // chained behind it never ran once in any session. The native work is
    // synchronous, so a promise still pending after a second is not coming
    // back, and proceeding beats stalling forever.
    //
    // This stage failing is the quiet catastrophe: the bridge keeps
    // activeUserId == nil, persistContractionReceipt refuses every record and
    // withholds the ack, and the Watch retries forever while the phone log
    // stays empty. Surface it instead of continuing as if it had worked.
    const registerTimedOut = Symbol("register-timeout");
    const register = mod.setActiveWatchUser(userId) ?? Promise.resolve();
    Promise.race([
      register,
      new Promise((resolve) =>
        setTimeout(() => resolve(registerTimedOut), REGISTER_TIMEOUT_MS),
      ),
    ])
      .then((outcome: unknown) => {
        if (drainGenRef.current !== gen) {
          countWatchBridge({ generationAbandoned: 1 });
          return;
        }
        // The stage between "effect ran" and "drain ran". If this never
        // increments, setActiveWatchUser is where the chain stalls.
        if (outcome === registerTimedOut) {
          countWatchBridge({ registerTimeouts: 1 });
        } else {
          countWatchBridge({ registered: 1 });
          clearWatchBridgeFailure();
        }
      })
      .catch((err: unknown) => {
        if (drainGenRef.current !== gen) return;
        const f = recordWatchBridgeFailure("register", err);
        reportOnce(f.message);
        // The drained-for-this-user guard stays SET. Releasing it here let the
        // effect re-enter: its deps include handleContractionUpdate, which
        // depends on Clerk's getToken and changes identity across renders, so
        // the toast's own setState re-ran the effect, which retried, failed,
        // and toasted again — a loop that froze the app at launch. Recording
        // the failure is this chain's job; retrying is not.
        throw err;
      })
      // Stage 2: read pending receipts — only if generation is still current.
      // If the user signed out or switched accounts while stage 1 was running,
      // drainGenRef will have advanced; return an empty array to skip dispatch.
      .then(
        (): Promise<
          Array<{
            id?: string;
            startedAt?: string;
            endedAt?: string;
            interval?: number;
          }>
        > => {
          if (drainGenRef.current !== gen) {
            countWatchBridge({ generationAbandoned: 1 });
            return Promise.resolve([]);
          }
          return mod
            .getPendingContractionReceipts()
            .then(
              (
                records: Array<{
                  id?: string;
                  startedAt?: string;
                  endedAt?: string;
                  interval?: number;
                }>,
              ) => {
                // A drain that returns nothing and reports no error used to be
                // invisible. It is the single most useful number here.
                countWatchBridge({ drains: 1, returned: records.length });
                return records;
              },
            )
            .catch((err: unknown) => {
              recordWatchBridgeFailure("drain", err);
              throw err;
            });
        },
      )
      // Stage 3: dispatch — only if generation is still current.
      .then(
        (
          records: Array<{
            id?: string;
            startedAt?: string;
            endedAt?: string;
            interval?: number;
          }>,
        ) => {
          if (drainGenRef.current !== gen) {
            countWatchBridge({ generationAbandoned: 1 });
            return;
          }
          for (const raw of records) {
            if (!raw.startedAt || !raw.endedAt) {
              // Was a bare `continue`: a record missing either field vanished
              // with no log, no toast and no counter, which is indistinguishable
              // from an empty drain.
              countWatchBridge({
                skipped: 1,
                lastSkipReason: !raw.startedAt
                  ? "no start time"
                  : "no end time",
              });
              continue;
            }
            const record: ContractionRecord = {
              id: raw.id,
              startedAt: raw.startedAt,
              endedAt: raw.endedAt,
              interval: raw.interval,
            };
            // Pass the native receipt ID so acknowledgeContractionReceipt fires
            // after the API save succeeds.
            countWatchBridge({ dispatched: 1 });
            // Never let a throw here become an unhandled rejection: that is
            // how this failure stayed invisible.
            handleContractionUpdate(record, { nativeReceiptId: raw.id }).catch(
              (err: unknown) => recordWatchBridgeFailure("dispatch", err),
            );
          }
        },
      )
      .catch((err: unknown) => {
        // Registration and drain already recorded their own stage; anything
        // reaching here is the dispatch loop. Either way it is never dropped.
        if (getWatchBridgeFailure() === null) {
          recordWatchBridgeFailure("dispatch", err);
        }
      });
  }, [isSignedIn, userId, handleContractionUpdate, reportOnce]);

  useWatchConnectivity({
    gestationalWeek,
    tips: watchTips,
    onKickSessionEnd: isSignedIn ? handleKickSessionEnd : undefined,
    onContractionUpdate: isSignedIn
      ? (record: ContractionRecord) => {
          countWatchBridge({ live: 1, dispatched: 1 });
          return handleContractionUpdate(record).catch((err: unknown) =>
            recordWatchBridgeFailure("dispatch", err),
          );
        }
      : undefined,
    onKickUpdate: isSignedIn ? handleKickUpdate : undefined,
  });

  const { bottom: safeBottom } = useSafeAreaInsets();

  return (
    <>
      <LiveKickBanner count={liveKickCount} safeBottom={safeBottom} />
      <WatchToast
        message={toast.message}
        visible={toast.visible}
        isError={toast.isError}
      />
    </>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    // bottom is set dynamically from useSafeAreaInsets — see WatchToast
    left: 16,
    right: 16,
    zIndex: 200,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  innerSuccess: {
    backgroundColor: "rgba(34,139,82,0.92)",
  },
  innerError: {
    backgroundColor: "rgba(185,28,28,0.92)",
  },
  innerLiveKick: {
    backgroundColor: "rgba(99,102,241,0.92)",
  },
  text: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },
});
