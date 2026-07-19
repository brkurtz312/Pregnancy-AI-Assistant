import { Ionicons } from "@expo/vector-icons";
import { Audio } from "expo-av";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useLayoutEffect,
} from "react";
import {
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeInDown,
  useSharedValue,
  withRepeat,
  withTiming,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import {
  FHR_DIR,
  ensureFhrDir,
  loadFhrRecordings,
  addFhrRecording,
  removeFhrRecording,
  type FhrRecording,
} from "@/lib/fetal-heart-rate";

const MAX_SECONDS = 30;

function formatCountdown(s: number) {
  return `${s}s`;
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}:${rem.toString().padStart(2, "0")}` : `${s}s`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return (
    d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    }) +
    " · " +
    d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
  );
}

export default function FetalHeartRateScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [permission, setPermission] = useState<
    "unknown" | "granted" | "denied"
  >("unknown");
  const [recordings, setRecordings] = useState<FhrRecording[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [countdown, setCountdown] = useState(MAX_SECONDS);
  const [playingId, setPlayingId] = useState<string | null>(null);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stoppingRef = useRef(false);
  const pendingIdRef = useRef<string | null>(null);

  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(1);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  useEffect(() => {
    Audio.getPermissionsAsync().then(({ status }) => {
      setPermission(
        status === "granted"
          ? "granted"
          : status === "denied"
            ? "denied"
            : "unknown",
      );
    });
    loadFhrRecordings().then(setRecordings);
  }, []);

  useEffect(() => {
    if (isRecording) {
      pulseScale.value = withRepeat(
        withTiming(1.15, { duration: 650 }),
        -1,
        true,
      );
      pulseOpacity.value = withRepeat(
        withTiming(0.7, { duration: 650 }),
        -1,
        true,
      );
    } else {
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(1, { duration: 200 });
    }
  }, [isRecording, pulseScale, pulseOpacity]);

  useLayoutEffect(() => {
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      recordingRef.current?.stopAndUnloadAsync().catch(() => {});
      soundRef.current?.unloadAsync().catch(() => {});
    };
  }, []);

  const requestPermission = useCallback(async () => {
    const { status } = await Audio.requestPermissionsAsync();
    setPermission(status === "granted" ? "granted" : "denied");
  }, []);

  const stopRecording = useCallback(async () => {
    if (stoppingRef.current) return;
    stoppingRef.current = true;

    if (countdownRef.current) {
      clearInterval(countdownRef.current);
      countdownRef.current = null;
    }

    const rec = recordingRef.current;
    const id = pendingIdRef.current;
    recordingRef.current = null;
    pendingIdRef.current = null;

    setIsRecording(false);
    setCountdown(MAX_SECONDS);

    if (rec && id) {
      try {
        const status = await rec.getStatusAsync();
        const durationMs = status.durationMillis ?? 0;
        await rec.stopAndUnloadAsync();
        const tempUri = rec.getURI();

        if (tempUri) {
          await ensureFhrDir();
          const destUri = `${FHR_DIR}${id}.m4a`;
          await FileSystem.copyAsync({ from: tempUri, to: destUri });

          const entry: FhrRecording = {
            id,
            uri: destUri,
            recordedAt: new Date().toISOString(),
            durationMs: Math.max(durationMs, 500),
          };
          await addFhrRecording(entry);
          setRecordings((prev) => [entry, ...prev]);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        }
      } catch {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      }
    }

    await Audio.setAudioModeAsync({ allowsRecordingIOS: false }).catch(
      () => {},
    );
    stoppingRef.current = false;
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || stoppingRef.current) return;

    try {
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });

      const id = `fhr-${Date.now()}`;
      pendingIdRef.current = id;

      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
      setCountdown(MAX_SECONDS);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      let remaining = MAX_SECONDS;
      countdownRef.current = setInterval(() => {
        remaining -= 1;
        setCountdown(remaining);
        if (remaining <= 0) {
          stopRecording();
        }
      }, 1000);
    } catch {
      pendingIdRef.current = null;
      Alert.alert(
        "Recording Error",
        "Could not access the microphone. Please try again.",
      );
    }
  }, [isRecording, stopRecording]);

  const stopPlayback = useCallback(async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync().catch(() => {});
      await soundRef.current.unloadAsync().catch(() => {});
      soundRef.current = null;
    }
    setPlayingId(null);
  }, []);

  const togglePlayback = useCallback(
    async (rec: FhrRecording) => {
      if (playingId === rec.id) {
        await stopPlayback();
        return;
      }
      await stopPlayback();
      try {
        const { sound } = await Audio.Sound.createAsync(
          { uri: rec.uri },
          { shouldPlay: true },
        );
        soundRef.current = sound;
        setPlayingId(rec.id);
        sound.setOnPlaybackStatusUpdate((status) => {
          if (!status.isLoaded || status.didJustFinish) {
            setPlayingId(null);
            soundRef.current = null;
          }
        });
      } catch {
        Alert.alert("Playback Error", "Could not play this recording.");
      }
    },
    [playingId, stopPlayback],
  );

  const handleDelete = useCallback(
    (id: string) => {
      Alert.alert(
        "Delete Recording",
        "Remove this heart rate recording permanently?",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              if (playingId === id) await stopPlayback();
              const updated = await removeFhrRecording(id);
              setRecordings(updated);
            },
          },
        ],
      );
    },
    [playingId, stopPlayback],
  );

  const ringColor = isRecording ? "#ef4444" : colors.primary;

  return (
    <View style={[s.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          s.header,
          {
            backgroundColor: colors.primary,
            paddingTop: (Platform.OS === "web" ? 16 : insets.top) + 16,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={s.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={s.headerBadge}>
          <Ionicons name="pulse-outline" size={14} color={colors.primary} />
          <Text style={[s.headerBadgeText, { color: colors.primary }]}>
            Tools
          </Text>
        </View>
        <Text style={s.headerTitle}>Fetal Heart Rate</Text>
        <Text style={s.headerSub}>
          Record the heartbeat heard on Doppler — up to 30 seconds
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={[
          s.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Permission gate */}
        {permission === "denied" ? (
          <Animated.View entering={FadeInDown.duration(350)} style={s.permBox}>
            <Ionicons
              name="mic-off-outline"
              size={40}
              color={colors.mutedForeground}
            />
            <Text style={[s.permTitle, { color: colors.foreground }]}>
              Microphone access required
            </Text>
            <Text style={[s.permSub, { color: colors.mutedForeground }]}>
              Go to Settings → Privacy → Microphone and enable access for this
              app.
            </Text>
          </Animated.View>
        ) : permission === "unknown" ? (
          <Animated.View entering={FadeInDown.duration(350)} style={s.permBox}>
            <Ionicons
              name="mic-outline"
              size={40}
              color={colors.mutedForeground}
            />
            <Text style={[s.permTitle, { color: colors.foreground }]}>
              Microphone permission needed
            </Text>
            <Text style={[s.permSub, { color: colors.mutedForeground }]}>
              Allow microphone access to record the fetal heartbeat.
            </Text>
            <TouchableOpacity
              style={[s.permBtn, { backgroundColor: colors.primary }]}
              onPress={requestPermission}
            >
              <Text style={s.permBtnText}>Allow Microphone</Text>
            </TouchableOpacity>
          </Animated.View>
        ) : (
          <>
            {/* Recorder */}
            <Animated.View
              entering={FadeInDown.duration(350)}
              style={s.recorderBox}
            >
              <View style={s.ringWrap}>
                <Animated.View
                  style={[s.ringPulse, { borderColor: ringColor }, pulseStyle]}
                />
                <TouchableOpacity
                  style={[s.recordBtn, { backgroundColor: ringColor }]}
                  onPress={isRecording ? stopRecording : startRecording}
                  activeOpacity={0.85}
                >
                  <Ionicons
                    name={isRecording ? "stop" : "mic"}
                    size={32}
                    color="#fff"
                  />
                </TouchableOpacity>
              </View>

              {isRecording ? (
                <Text style={[s.countdownText, { color: colors.foreground }]}>
                  {formatCountdown(countdown)} remaining
                </Text>
              ) : (
                <Text style={[s.recLabel, { color: colors.mutedForeground }]}>
                  Tap to start recording
                </Text>
              )}

              {isRecording && (
                <TouchableOpacity
                  style={[s.stopRow, { borderColor: colors.border }]}
                  onPress={stopRecording}
                >
                  <Text style={[s.stopText, { color: colors.mutedForeground }]}>
                    Stop early
                  </Text>
                </TouchableOpacity>
              )}
            </Animated.View>

            {/* History */}
            <Animated.View
              entering={FadeInDown.delay(80).duration(350)}
              style={[
                s.historyCard,
                {
                  backgroundColor: colors.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text style={[s.historyTitle, { color: colors.foreground }]}>
                Past Recordings
              </Text>

              {recordings.length === 0 ? (
                <Text style={[s.empty, { color: colors.mutedForeground }]}>
                  No recordings yet. Tap the microphone above to capture the
                  heartbeat.
                </Text>
              ) : (
                recordings.map((rec) => {
                  const isPlaying = playingId === rec.id;
                  return (
                    <View
                      key={rec.id}
                      style={[s.recRow, { borderColor: colors.border }]}
                    >
                      <TouchableOpacity
                        style={[
                          s.playBtn,
                          {
                            backgroundColor: isPlaying
                              ? colors.primary
                              : colors.primary + "18",
                          },
                        ]}
                        onPress={() => togglePlayback(rec)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name={isPlaying ? "pause" : "play"}
                          size={18}
                          color={isPlaying ? "#fff" : colors.primary}
                        />
                      </TouchableOpacity>
                      <View style={s.recMeta}>
                        <Text style={[s.recDate, { color: colors.foreground }]}>
                          {formatDate(rec.recordedAt)}
                        </Text>
                        <Text
                          style={[s.recDur, { color: colors.mutedForeground }]}
                        >
                          {formatDuration(rec.durationMs)}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={() => handleDelete(rec.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons
                          name="trash-outline"
                          size={18}
                          color={colors.mutedForeground}
                        />
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </Animated.View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backBtn: { marginBottom: 12 },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginBottom: 10,
  },
  headerBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 4,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.8)",
    lineHeight: 18,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 24,
  },
  permBox: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 12,
  },
  permTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  permSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 16,
  },
  permBtn: {
    marginTop: 8,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  permBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  recorderBox: {
    alignItems: "center",
    paddingVertical: 32,
    gap: 16,
  },
  ringWrap: {
    width: 120,
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  ringPulse: {
    position: "absolute",
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 3,
  },
  recordBtn: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  countdownText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  recLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  stopRow: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  stopText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  historyCard: {
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    marginBottom: 24,
  },
  historyTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  empty: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingVertical: 16,
  },
  recRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  playBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  recMeta: { flex: 1 },
  recDate: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  recDur: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
});
