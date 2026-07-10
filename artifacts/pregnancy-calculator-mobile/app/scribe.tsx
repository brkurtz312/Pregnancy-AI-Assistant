import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { router } from "expo-router";
import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import { useState, useRef, useCallback } from "react";
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

type NoteMode = "soap" | "summary";

interface SoapNote {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface PatientSummary {
  headline: string;
  whatWasDiscussed: string;
  nextSteps: string[];
  rememberTo: string;
}

export default function ScribeScreen() {
  const colors = useColors();
  const { getToken } = useAuth();

  const [phase, setPhase] = useState<Phase>("idle");
  const [transcript, setTranscript] = useState("");
  const [note, setNote] = useState<SoapNote | PatientSummary | null>(null);
  const [noteMode, setNoteMode] = useState<NoteMode>("soap");
  const [error, setError] = useState<string | null>(null);

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
          "Please allow microphone access in Settings to use Medical Scribe.",
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
    } catch (err) {
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
      if (!res.ok) throw new Error(data.error ?? "Transcription failed");

      setTranscript(data.transcript);
      setPhase("transcribed");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Transcription failed";
      setError(msg);
      setPhase("idle");
    }
  }, [getToken]);

  const generateNote = useCallback(
    async (mode: NoteMode) => {
      setNoteMode(mode);
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
          body: JSON.stringify({ transcript, mode }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Note generation failed");
        setNote(data.note);
        setPhase("done");
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Note generation failed";
        setError(msg);
        setPhase("transcribed");
      }
    },
    [transcript, getToken],
  );

  const copyToClipboard = useCallback(() => {
    if (!note) return;
    let text = "";
    if (noteMode === "soap") {
      const s = note as SoapNote;
      text = `SOAP NOTE — DRAFT FOR CLINICIAN REVIEW\n\nSubjective:\n${s.subjective}\n\nObjective:\n${s.objective}\n\nAssessment:\n${s.assessment}\n\nPlan:\n${s.plan}`;
    } else {
      const s = note as PatientSummary;
      text = `${s.headline}\n\nWhat We Discussed:\n${s.whatWasDiscussed}\n\nNext Steps:\n${(s.nextSteps ?? []).map((x) => `• ${x}`).join("\n")}\n\n${s.rememberTo}`;
    }
    void Clipboard.setStringAsync(text);
    Alert.alert("Copied", "Note copied to clipboard.");
  }, [note, noteMode]);

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
        <Text style={[styles.backText, { color: colors.foreground }]}>Tools</Text>
      </TouchableOpacity>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.header}>
          <Ionicons name="mic-circle-outline" size={40} color={ACCENT} />
          <Text style={[styles.title, { color: colors.foreground }]}>Medical Scribe</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
            Record a patient encounter and generate a draft SOAP note or patient summary.
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={[styles.disclaimer, { backgroundColor: colors.muted ?? "#f5f5f5" }]}>
            <Ionicons name="information-circle-outline" size={16} color={colors.mutedForeground} />
            <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
              All output is a draft for clinician review. Not a medical record. Obtain patient
              consent before recording.
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
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                {phase === "transcribing" ? "Transcribing audio…" : "Generating note…"}
              </Text>
            </View>
          )}

          {(phase === "transcribed" || phase === "done") && (
            <View style={styles.transcriptSection}>
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                TRANSCRIPT
              </Text>
              <Text style={[styles.transcriptText, { color: colors.foreground }]}>
                {transcript}
              </Text>
              {phase === "transcribed" && (
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[styles.modeBtn, { backgroundColor: ACCENT }]}
                    onPress={() => generateNote("soap")}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="document-text-outline" size={18} color="#fff" />
                    <Text style={styles.modeBtnText}>SOAP Note</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeBtn, { backgroundColor: colors.secondary ?? "#6b7280" }]}
                    onPress={() => generateNote("summary")}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="person-outline" size={18} color="#fff" />
                    <Text style={styles.modeBtnText}>Patient Summary</Text>
                  </TouchableOpacity>
                </View>
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
              <Text style={[styles.sectionLabel, { color: colors.mutedForeground }]}>
                {noteMode === "soap" ? "SOAP NOTE — DRAFT" : "PATIENT SUMMARY — DRAFT"}
              </Text>
              <TouchableOpacity onPress={copyToClipboard} style={styles.copyBtn}>
                <Ionicons name="copy-outline" size={18} color={ACCENT} />
                <Text style={[styles.copyBtnText, { color: ACCENT }]}>Copy</Text>
              </TouchableOpacity>
            </View>

            {noteMode === "soap" ? (
              <SoapNoteView note={note as SoapNote} colors={colors} />
            ) : (
              <PatientSummaryView note={note as PatientSummary} colors={colors} />
            )}

            <View style={styles.noteActions}>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={() =>
                  generateNote(noteMode === "soap" ? "summary" : "soap")
                }
                activeOpacity={0.8}
              >
                <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
                  {noteMode === "soap" ? "Also generate patient summary" : "Also generate SOAP note"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.secondaryBtn, { borderColor: colors.border }]}
                onPress={reset}
                activeOpacity={0.8}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.mutedForeground} />
                <Text style={[styles.secondaryBtnText, { color: colors.mutedForeground }]}>
                  New recording
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {error && (
          <View style={[styles.errorBox, { backgroundColor: "#fef2f2", borderColor: "#fca5a5" }]}>
            <Ionicons name="alert-circle-outline" size={18} color="#ef4444" />
            <Text style={[styles.errorText, { color: "#b91c1c" }]}>{error}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function SoapNoteView({
  note,
  colors,
}: {
  note: SoapNote;
  colors: ReturnType<typeof useColors>;
}) {
  const sections: { label: string; key: keyof SoapNote }[] = [
    { label: "Subjective", key: "subjective" },
    { label: "Objective", key: "objective" },
    { label: "Assessment", key: "assessment" },
    { label: "Plan", key: "plan" },
  ];
  return (
    <View style={styles.noteBody}>
      {sections.map(({ label, key }) => (
        <View key={key} style={styles.noteSection}>
          <Text style={[styles.noteSectionLabel, { color: colors.mutedForeground }]}>{label}</Text>
          <Text style={[styles.noteSectionText, { color: colors.foreground }]}>{note[key]}</Text>
        </View>
      ))}
    </View>
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
      <Text style={[styles.summaryHeadline, { color: colors.foreground }]}>{note.headline}</Text>
      <View style={styles.noteSection}>
        <Text style={[styles.noteSectionLabel, { color: colors.mutedForeground }]}>
          What We Discussed
        </Text>
        <Text style={[styles.noteSectionText, { color: colors.foreground }]}>
          {note.whatWasDiscussed}
        </Text>
      </View>
      {(note.nextSteps ?? []).length > 0 && (
        <View style={styles.noteSection}>
          <Text style={[styles.noteSectionLabel, { color: colors.mutedForeground }]}>
            Next Steps
          </Text>
          {(note.nextSteps ?? []).map((step, i) => (
            <Text
              key={i}
              style={[styles.noteSectionText, { color: colors.foreground }]}
            >
              • {step}
            </Text>
          ))}
        </View>
      )}
      {note.rememberTo ? (
        <View
          style={[
            styles.rememberBox,
            { backgroundColor: colors.muted ?? "#f5f5f5", borderColor: colors.border },
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
  scroll: { padding: 16, gap: 16, paddingBottom: 48 },
  header: { alignItems: "center", gap: 8, paddingVertical: 8 },
  title: { fontSize: 24, fontFamily: "Inter_700Bold" },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 22,
  },
  card: { borderRadius: 18, borderWidth: 1, padding: 16, gap: 16 },
  disclaimer: {
    flexDirection: "row",
    gap: 8,
    padding: 12,
    borderRadius: 10,
    alignItems: "flex-start",
  },
  disclaimerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 18 },
  recordBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 16,
    borderRadius: 14,
  },
  recordBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_600SemiBold" },
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
  transcriptText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  modeRow: { flexDirection: "row", gap: 10 },
  modeBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
  },
  modeBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  noteHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  copyBtn: { flexDirection: "row", alignItems: "center", gap: 4 },
  copyBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  noteBody: { gap: 14 },
  noteSection: { gap: 4 },
  noteSectionLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  noteSectionText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  summaryHeadline: { fontSize: 16, fontFamily: "Inter_600SemiBold", lineHeight: 24 },
  rememberBox: { borderRadius: 10, borderWidth: 1, padding: 12 },
  rememberText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22 },
  noteActions: { gap: 10 },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 14, fontFamily: "Inter_500Medium" },
  errorBox: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  errorText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
});
