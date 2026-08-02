/**
 * WatchBackgroundListener
 *
 * Subscribes to Apple Watch events (kick session end, contraction update) at
 * the root layout level so data is never dropped when the user is on a tab
 * other than Tools.  The component saves each record to the API and shows a
 * brief confirmation toast, then invalidates the relevant React Query caches so
 * the Tools tab sees fresh data next time it mounts.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCreateKickSession,
  useCreateContraction,
  getListKickSessionsQueryKey,
  getListContractionsQueryKey,
} from "@workspace/api-client-react";
import {
  useWatchConnectivity,
  type KickSessionSummary,
  type ContractionRecord,
} from "@/hooks/useWatchConnectivity";

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
  const { isSignedIn } = useAuth();
  const queryClient = useQueryClient();
  const kickMutation = useCreateKickSession();
  const contractionMutation = useCreateContraction();

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
      if (!isSignedIn) return;
      try {
        await kickMutation.mutateAsync({
          data: {
            startedAt: session.startedAt,
            endedAt: session.endedAt,
            kickCount: session.kickCount,
          },
        });
        // Invalidate so Tools tab fetches fresh data on next focus
        queryClient.invalidateQueries({
          queryKey: getListKickSessionsQueryKey({ limit: 10, offset: 0 }),
        });
        showToast("Kick session saved");
      } catch {
        showToast(
          "Kick session couldn't be saved. Please log it manually.",
          true,
        );
      }
    },
    [isSignedIn, kickMutation, queryClient, showToast],
  );

  const handleContractionUpdate = useCallback(
    async (record: ContractionRecord) => {
      if (!isSignedIn) return;
      try {
        const durationSeconds =
          record.startedAt && record.endedAt
            ? Math.round(
                (new Date(record.endedAt).getTime() -
                  new Date(record.startedAt).getTime()) /
                  1000,
              )
            : undefined;
        await contractionMutation.mutateAsync({
          data: {
            startedAt: record.startedAt,
            endedAt: record.endedAt,
            durationSeconds,
            intervalSeconds: record.interval,
            sessionDate: todayDate(),
          },
        });
        queryClient.invalidateQueries({
          queryKey: getListContractionsQueryKey({
            sessionDate: todayDate(),
            limit: 50,
          }),
        });
        showToast("Contraction recorded");
      } catch {
        showToast(
          "Contraction couldn't be saved. Please log it manually.",
          true,
        );
      }
    },
    [isSignedIn, contractionMutation, queryClient, showToast],
  );

  useWatchConnectivity({
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
