import { Ionicons } from "@expo/vector-icons";
import { useAppAuth as useAuth } from "@/hooks/useAppAuth";
import * as Location from "expo-location";
import { router } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  type AppStateStatus,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import {
  getGetProfileQueryKey,
  useGetProfile,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  checkDismissed,
  dismissForNow,
  geocodeAddress,
  haversineMeters,
  type LocationModeType,
  PROXIMITY_THRESHOLD_METERS,
} from "@/lib/location-mode";

interface ProximityResult {
  mode: LocationModeType;
  name: string;
}

async function detectProximity(
  providerAddress: string | null | undefined,
  providerName: string | null | undefined,
  facilityAddress: string | null | undefined,
  facilityName: string | null | undefined,
): Promise<ProximityResult | null> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  if (status !== "granted") return null;

  const loc = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  const user = { lat: loc.coords.latitude, lon: loc.coords.longitude };

  if (providerAddress) {
    const coords = await geocodeAddress(providerAddress);
    if (coords && haversineMeters(user, coords) <= PROXIMITY_THRESHOLD_METERS) {
      return {
        mode: "provider",
        name: providerName || "your provider's office",
      };
    }
  }

  if (facilityAddress) {
    const coords = await geocodeAddress(facilityAddress);
    if (coords && haversineMeters(user, coords) <= PROXIMITY_THRESHOLD_METERS) {
      return {
        mode: "facility",
        name: facilityName || "your birthing facility",
      };
    }
  }

  return null;
}

export function LocationModeGate() {
  const { isSignedIn } = useAuth();
  const { data: profile } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });

  const [prompt, setPrompt] = useState<ProximityResult | null>(null);
  const checkingRef = useRef(false);
  const hasCheckedThisSession = useRef(false);

  const runCheck = useCallback(async () => {
    if (checkingRef.current) return;
    if (!profile) return;
    if (!profile.providerAddress && !profile.hospitalAddress) return;

    const dismissed = await checkDismissed();
    if (dismissed) return;

    checkingRef.current = true;
    try {
      const result = await detectProximity(
        profile.providerAddress,
        profile.providerName,
        profile.hospitalAddress,
        profile.hospitalName,
      );
      if (result) setPrompt(result);
    } catch {
      // Location permission denied or unavailable — silently skip
    } finally {
      checkingRef.current = false;
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    if (hasCheckedThisSession.current) return;
    hasCheckedThisSession.current = true;
    runCheck();
  }, [profile, runCheck]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state === "active") runCheck();
    });
    return () => sub.remove();
  }, [runCheck]);

  const handleConfirm = useCallback(() => {
    if (!prompt) return;
    setPrompt(null);
    router.push(prompt.mode === "provider" ? "/in-office" : "/at-facility");
  }, [prompt]);

  const handleDismiss = useCallback(async () => {
    setPrompt(null);
    await dismissForNow();
  }, []);

  if (!prompt) return null;

  const isProvider = prompt.mode === "provider";
  const modeLabel = isProvider ? "In-Office Mode" : "Labor & Delivery Mode";
  const modeDesc = isProvider
    ? "View your questions, symptom log, and visit checklist."
    : "Access your birth plan, contraction timer, and hospital bag.";
  const iconName: keyof typeof Ionicons.glyphMap = isProvider
    ? "medical-outline"
    : "heart-outline";

  return (
    <Modal transparent animationType="none" visible statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={handleDismiss}>
        <Animated.View entering={FadeInDown.duration(300)} style={styles.sheet}>
          <Pressable>
            <LocationPromptContent
              iconName={iconName}
              name={prompt.name}
              modeLabel={modeLabel}
              modeDesc={modeDesc}
              onConfirm={handleConfirm}
              onDismiss={handleDismiss}
            />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function LocationPromptContent({
  iconName,
  name,
  modeLabel,
  modeDesc,
  onConfirm,
  onDismiss,
}: {
  iconName: keyof typeof Ionicons.glyphMap;
  name: string;
  modeLabel: string;
  modeDesc: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.card, { backgroundColor: colors.card }]}>
      <View style={styles.top}>
        <View
          style={[
            styles.iconCircle,
            { backgroundColor: colors.primary + "18" },
          ]}
        >
          <Ionicons name="location" size={20} color={colors.primary} />
        </View>
        <View style={styles.topText}>
          <Text style={[styles.nearby, { color: colors.mutedForeground }]}>
            You&apos;re near
          </Text>
          <Text
            style={[styles.locationName, { color: colors.foreground }]}
            numberOfLines={1}
          >
            {name}
          </Text>
        </View>
      </View>

      <View
        style={[styles.modeBanner, { backgroundColor: colors.primary + "12" }]}
      >
        <Ionicons name={iconName} size={18} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.modeLabel, { color: colors.primary }]}>
            {modeLabel}
          </Text>
          <Text style={[styles.modeDesc, { color: colors.mutedForeground }]}>
            {modeDesc}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.dismissBtn, { borderColor: colors.border }]}
          onPress={onDismiss}
        >
          <Text style={[styles.dismissText, { color: colors.mutedForeground }]}>
            Not now
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.openBtn, { backgroundColor: colors.primary }]}
          onPress={onConfirm}
        >
          <Ionicons name={iconName} size={16} color="#fff" />
          <Text style={styles.openText}>Open {modeLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "flex-end",
  },
  sheet: {
    paddingHorizontal: 12,
    paddingBottom: 32,
  },
  card: {
    borderRadius: 20,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
  },
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 14,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  topText: { flex: 1 },
  nearby: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  locationName: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    marginTop: 1,
  },
  modeBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 12,
    padding: 12,
    marginBottom: 14,
  },
  modeLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  modeDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
  },
  dismissBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: "center",
  },
  dismissText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  openBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 12,
    paddingVertical: 13,
  },
  openText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
});
