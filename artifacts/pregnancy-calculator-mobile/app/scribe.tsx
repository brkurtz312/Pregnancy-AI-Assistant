import { Ionicons } from "@expo/vector-icons";
import { useAppAuth as useAuth } from "@/hooks/useAppAuth";
import { router } from "expo-router";
import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import { useState, useRef, useCallback, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { saveScribeNote, type PatientSummary } from "@/lib/scribe-note";
import { PassGate } from "@/components/PassGate";
import { usePass } from "@/hooks/usePass";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";

const apiBase = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
  : "";

type Phase =
  | "idle"
  | "recording"
  | "transcribing"
  | "transcribed"
  | "generating"
  | "done";

export default function ScribeScreen() {
  const colors = useColors();
  const { getToken } = useAuth();
  const { hasPass } = usePass();

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [note, setNote] = useState<PatientSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showPassGate, setShowPassGate] = useState(false);

  useEffect(() => {
    if (hasPass && showPassGate) {
      setShowPassGate(false);
    }
  }, [hasPass, showPassGate]);

  const recordingRef = useRef<Audio.Recording | null>(null);

  const startRecording = useCallback(async () => {
    setError(null);
    setTranscript("");
    setNote(null);
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert(
          "Microphone access needed",
          "Please allow microphone access in Settings to record your appointment.",
        );
        return;
      }
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: true,
        playsInSilentModeIOS: true,
      });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY,
      );
      recordingRef.current = recording;
      setPhase("recording");
    } catch {
      setError("Could not start recording. Please try again.");
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const recording = recordingRef.current;
    if (!recording) return;
    setPhase("transcribing");
    try {
      await recording.stopAndUnloadAsync();
      await Audio.setAudioModeAsync({ allowsRecordingIOS: false });
      const uri = recording.getURI();
      recordingRef.current = null;
      if (!uri) throw new Error("No recording URI");

      const token = await getToken();
      const formData = new FormData();
      formData.append("audio", {
        uri,
        name: "encounter.m4a",
        type: "audio/m4a",
      } as unknown as Blob);

      const res = await fetch(`${apiBase}/api/scribe/transcribe`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (res.status === 403 && data.code === "SCRIBE_LIMIT_REACHED") {
        setPhase("idle");
        setShowPassGate(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Transcription failed");

      setTranscript(data.transcript);
      setPhase("transcribed");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      setError(msg);
      setPhase("idle");
    }
  }, [getToken]);

  const generateSummary = useCallback(async () => {
    setNote(null);
    setError(null);
    setPhase("generating");
    try {
      const token = await getToken();
      const res = await fetch(`${apiBase}/api/scribe/generate-note`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ transcript, mode: "summary" }),
      });
      const data = await res.json();
      if (res.status === 403 && data.code === "SCRIBE_LIMIT_REACHED") {
        setPhase("transcribed");
        setShowPassGate(true);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Summary generation failed");
      const summary = data.note as PatientSummary;
      setNote(summary);
      void saveScribeNote(summary);
      setPhase("done");
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Summary generation failed";
      setError(msg);
      setPhase("transcribed");
    }
  }, [transcript, getToken]);

  const copyToClipboard = useCallback(() => {
    if (!note) return;
    const text = `${note.headline}\n\nWhat Was Discussed:\n${note.whatWasDiscussed}\n\nNext Steps:\n${(note.nextSteps ?? []).map((x) => `• ${x}`).join("\n")}\n\n${note.rememberTo}`;
    void Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Your visit summary has been copied to clipboard.");
  }, [note]);

  const reset = useCallback(() => {
    setPhase("idle");
    setTranscript("");
    setNote(null);
    setError(null);
  }, []);

  const ACCENT = colors.primary ?? "#e86cad";

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
      <TouchableOpacity
        onPress={() => router.back()}
        style={styles.backBtn}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        <Ionicons name="chevron-back" size={22} color={colors.foreground} />
        <Text style={[styles.backText, { color: colors.foreground }]}>
          Office Visits
        </Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContainer style={{ paddingHorizontal: 16 }}>
          <View style={styles.header}>
            <Ionicons name="mic-circle-outline" size={44} color={ACCENT} />
            <Text style={[styles.title, { color: colors.foreground }]}>
              Visit Notes Scribe
            </Text>
            <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
              Record your appointment and get a plain-language summary of what
              was discussed, your next steps, and what to remember — in your own
              words.
            </Text>
          </View>

          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View
              style={[
                styles.infoBox,
                { backgroundColor: colors.muted ?? "#f5f5f5" },
              ]}
            >
              <Ionicons
                name="information-circle-outline"
                size={16}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.infoText, { color: colors.mutedForeground }]}
              >
                Keep this screen open during your visit. Your recording stays on
                your device and is only used to create your personal summary.
              </Text>
            </View>

            {phase === "idle" && (
              <TouchableOpacity
                style={[styles.recordBtn, { backgroundColor: ACCENT }]}
                onPress={startRecording}
                activeOpacity={0.85}
              >
                <Ionicons name="mic" size={28} color="#fff" />
                <Text style={styles.recordBtnText}>Start Recording</Text>
              </TouchableOpacity>
            )}

            {phase === "recording" && (
              <View style={styles.recordingState}>
                <View style={[styles.pulse, { borderColor: "#ef4444" }]}>
                  <TouchableOpacity
                    style={[styles.stopBtn, { backgroundColor: "#ef4444" }]}
                    onPress={stopRecording}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="stop" size={28} color="#fff" />
                  </TouchableOpacity>
                </View>
                <Text style={[styles.recordingLabel, { color: "#ef4444" }]}>
                  Recording… tap to stop
                </Text>
              </View>
            )}

            {(phase === "transcribing" || phase === "generating") && (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={ACCENT} />
                <Text
                  style={[
                    styles.loadingText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {phase === "transcribing"
                    ? "Transcribing your recording…"
                    : "Creating your visit summary…"}
                </Text>
              </View>
            )}

            {(phase === "transcribed" || phase === "done") && (
              <View style={styles.transcriptSection}>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  WHAT WAS RECORDED
                </Text>
                <Text
                  style={[styles.transcriptText, { color: colors.foreground }]}
                >
                  {transcript}
                </Text>
                {phase === "transcribed" && (
                  <TouchableOpacity
                    style={[styles.generateBtn, { backgroundColor: ACCENT }]}
                    onPress={generateSummary}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="sparkles-outline" size={18} color="#fff" />
                    <Text style={styles.generateBtnText}>
                      Create My Visit Summary
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>

          {phase === "done" && note && (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.noteHeader}>
                <Text
                  style={[
                    styles.sectionLabel,
                    { color: colors.mutedForeground },
                  ]}
                >
                  MY VISIT SUMMARY
                </Text>
                <TouchableOpacity
                  onPress={copyToClipboard}
                  style={styles.copyBtn}
                >
                  <Ionicons name="copy-outline" size={18} color={ACCENT} />
                  <Text style={[styles.copyBtnText, { color: ACCENT }]}>
                    Copy
                  </Text>
                </TouchableOpacity>
              </View>

              <PatientSummaryView note={note} colors={colors} />

              <View
                style={[
                  styles.disclaimer,
                  { backgroundColor: colors.muted ?? "#f5f5f5" },
                ]}
              >
                <Ionicons
                  name="heart-outline"
                  size={15}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.disclaimerText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  This is a personal note to help you remember your visit — not
                  a medical record. Always check with your provider if anything
                  is unclear.
                </Text>
              </View>

              <TouchableOpacity
                style={[styles.resetBtn, { borderColor: colors.border }]}
                onPress={reset}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="refresh-outline"
                  size={16}
                  color={colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.resetBtnText,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Record another visit
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {error && (
            <View
              style={[
                styles.errorBox,
                { backgroundColor: "#fef2f2", borderColor: "#fca5a5" },
              ]}
            >
              <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
              <Text style={[styles.errorText, { color: "#b91c1c" }]}>
                {error}
              </Text>
            </View>
          )}
        </ResponsiveContainer>
      </ScrollView>

      <PassGate
        visible={showPassGate}
        onClose={() => setShowPassGate(false)}
        title="Free Session Used"
        description="You've used your free Visit Notes Scribe session. Upgrade to the Full Pregnancy Pass for unlimited appointment recordings and summaries."
      />
    </SafeAreaView>
  );
}

function PatientSummaryView({
  note,
  colors,
}: {
  note: PatientSummary;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.noteBody}>
      <Text style={[styles.summaryHeadline, { color: colors.foreground }]}>
        {note.headline}
      </Text>
      <View style={styles.noteSection}>
        <Text
          style={[styles.noteSectionLabel, { color: colors.mutedForeground }]}
        >
          What Was Discussed
        </Text>
        <Text style={[styles.noteSectionText, { color: colors.foreground }]}>
          {note.whatWasDiscussed}
        </Text>
      </View>
      {(note.nextSteps ?? []).length > 0 && (
        <View style={styles.noteSection}>
          <Text
            style={[styles.noteSectionLabel, { color: colors.mutedForeground }]}
          >
            Your Next Steps
          </Text>
          {(note.nextSteps ?? []).map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={[styles.stepBullet, { color: colors.primary }]}>
                •
              </Text>
              <Text
                style={[styles.noteSectionText, { color: colors.foreground }]}
              >
                {step}
              </Text>
            </View>
          ))}
        </View>
      )}
      {note.rememberTo ? (
        <View
          style={[
            styles.rememberBox,
            {
              backgroundColor: (colors.primary ?? "#e86cad") + "15",
              borderColor: (colors.primary ?? "#e86cad") + "40",
            },
          ]}
        >
          <Text style={[styles.rememberText, { color: colors.foreground }]}>
            💛 {note.rememberTo}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: Platform.OS === "android" ? 12 : 8,
    paddingBottom: 4,
    gap: 4,
  },
  backText: { fontSize: 16, fontFamily: "Inter_500Medium" },
  scroll: { paddingTop: 16, gap: 16, paddingBottom: 48 },
  header: { alignItems: "center", gap: 10, paddingVertical: 8 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  card: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 16 },
  infoBox: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  recordBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  recordBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  recordingState: { alignItems: "center", gap: 16, paddingVertical: 8 },
  pulse: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  stopBtn: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  recordingLabel: { fontSize: 14, fontFamily: "Inter_500Medium" },
  loadingState: { alignItems: "center", gap: 12, paddingVertical: 24 },
  loadingText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  transcriptSection: { gap: 12 },
  sectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  transcriptText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
  },
  generateBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  copyBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  noteBody: { gap: 14 },
  noteSection: { gap: 6 },
  noteSectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  noteSectionText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    flex: 1,
  },
  stepRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
  },
  stepBullet: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 22,
  },
  summaryHeadline: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    lineHeight: 25,
  },
  rememberBox: { borderRadius: 10, borderWidth: 1, padding: 12 },
  rememberText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
  },
  disclaimer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    alignItems: "flex-start",
  },
  disclaimerText: {
    flex: 1,
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  resetBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  resetBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
});
