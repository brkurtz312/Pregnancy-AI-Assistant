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
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
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
import { getWeeklyDevelopment } from "@/lib/fetal-development";
import { calculateByDueDate } from "@/lib/pregnancy-math";
import {
  enqueueWatchKickSession,
  enqueueWatchContraction,
  getWatchQueueGeneration,
} from "@/lib/sync-queue";
function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface WatchToastState {
  message: string;
  visible: boolean;
  isError?: boolean;
}

function WatchToast({ message, visible, isError }: WatchToastState) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: visible ? 200 : 300,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  return (
    <Animated.View style={[styles.toast, { opacity }]} pointerEvents="none">
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
      return calculateByDueDate(new Date(profile.dueDate))
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
          },
          frozenGetter,
        );
        // Re-verify before touching the cache — if sign-out occurred during the
        // request the data was either accepted with the correct (frozen) token
        // or rejected by the server; either way, do not update this session's cache.
        if (getWatchQueueGeneration(userId) !== capturedGen) return;
        queryClient.invalidateQueries({
          queryKey: getListKickSessionsQueryKey({ limit: 10, offset: 0 }),
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
    async (record: ContractionRecord) => {
      if (!isSignedIn || !userId) return;
      const capturedGen = getWatchQueueGeneration(userId);

      const token = await getToken();
      if (getWatchQueueGeneration(userId) !== capturedGen) return;

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
            sessionDate: todayDate(),
          },
          frozenGetter,
        );
        if (getWatchQueueGeneration(userId) !== capturedGen) return;
        queryClient.invalidateQueries({
          queryKey: getListContractionsQueryKey({
            sessionDate: todayDate(),
            limit: 50,
          }),
        });
        showToast("Contraction recorded");
      } catch {
        // Save locally so the data isn't lost; retry when connectivity returns.
        try {
          await enqueueWatchContraction(
            {
              startedAt: record.startedAt,
              endedAt: record.endedAt ?? undefined,
              durationSeconds,
              intervalSeconds: record.interval,
              sessionDate: todayDate(),
            },
            userId,
            capturedGen,
          );
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

  useWatchConnectivity({
    gestationalWeek,
    tips: watchTips,
    onKickSessionEnd: isSignedIn ? handleKickSessionEnd : undefined,
    onContractionUpdate: isSignedIn ? handleContractionUpdate : undefined,
  });

  return (
    <WatchToast
      message={toast.message}
      visible={toast.visible}
      isError={toast.isError}
    />
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  toast: {
    position: "absolute",
    // Sit above the tab bar (≈49 pt) with some breathing room
    bottom: 80,
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
  text: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    flex: 1,
    lineHeight: 18,
  },
});
