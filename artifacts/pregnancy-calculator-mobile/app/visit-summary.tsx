import { Ionicons } from "@expo/vector-icons";
import { useUser } from "@clerk/expo";
import { router } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import React, { useEffect, useMemo, useState } from "react";
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
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  useGetProfile,
  getGetProfileQueryKey,
  useListPrenatalVisits,
  getListPrenatalVisitsQueryKey,
  useListSymptoms,
  getListSymptomsQueryKey,
  useListKickSessions,
  getListKickSessionsQueryKey,
  useListContractions,
  getListContractionsQueryKey,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { getGestationalAgeAtDate } from "@/lib/pregnancy-math";
import { getTimelineForWeeks } from "@/lib/prenatal-testing-content";
import { loadQuestions, getSelectedQuestions } from "@/lib/visit-questions";
import { loadScribeNote, type StoredScribeNote } from "@/lib/scribe-note";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatShortDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export default function VisitSummaryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useUser();
  const [exporting, setExporting] = useState(false);
  const [viewing, setViewing] = useState(false);

  const { data: profile } = useGetProfile({
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetProfileQueryKey(),
    },
  });
  const visitsParams = { limit: 50, offset: 0 };
  const { data: visits } = useListPrenatalVisits(visitsParams, {
    query: {
      enabled: !!isSignedIn,
      queryKey: getListPrenatalVisitsQueryKey(visitsParams),
    },
  });
  const symptomsParams = { limit: 5, offset: 0 };
  const { data: symptoms } = useListSymptoms(symptomsParams, {
    query: {
      enabled: !!isSignedIn,
      queryKey: getListSymptomsQueryKey(symptomsParams),
    },
  });
  const kickParams = { limit: 1, offset: 0 };
  const { data: kickSessions } = useListKickSessions(kickParams, {
    query: {
      enabled: !!isSignedIn,
      queryKey: getListKickSessionsQueryKey(kickParams),
    },
  });
  const { data: contractions } = useListContractions(
    {},
    {
      query: {
        enabled: !!isSignedIn,
        queryKey: getListContractionsQueryKey({}),
      },
    },
  );

  const [selectedQuestions, setSelectedQuestions] = useState<string[]>([]);
  const [scribeNote, setScribeNote] = useState<StoredScribeNote | null>(null);

  useEffect(() => {
    loadQuestions().then((items) =>
      setSelectedQuestions(getSelectedQuestions(items)),
    );
    loadScribeNote().then(setScribeNote);
  }, []);

  const nextVisit = useMemo(() => {
    if (!visits?.items?.length) return null;
    const upcoming = visits.items
      .filter((v) => new Date(v.visitDate).getTime() > Date.now())
      .sort(
        (a, b) =>
          new Date(a.visitDate).getTime() - new Date(b.visitDate).getTime(),
      );
    return upcoming[0] ?? null;
  }, [visits]);

  const dueDate = profile?.dueDate ? new Date(profile.dueDate) : null;
  const visitDate = nextVisit ? new Date(nextVisit.visitDate) : new Date();
  const gaAtVisit = dueDate
    ? getGestationalAgeAtDate(dueDate, visitDate)
    : null;
  const whatToExpect = gaAtVisit ? getTimelineForWeeks(gaAtVisit.weeks) : [];

  const latestKickSession = kickSessions?.items?.find((s) => s.endedAt);
  const contractionItems = contractions?.items ?? [];

  const buildHtml = () => {
    const questionsHtml = selectedQuestions.length
      ? `<ul>${selectedQuestions.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul>`
      : "<p>No questions selected.</p>";

    const expectHtml = whatToExpect.length
      ? `<ul>${whatToExpect
          .map(
            (t) =>
              `<li><strong>${escapeHtml(t.time)}:</strong> ${escapeHtml(t.tests)} — ${escapeHtml(t.why)}</li>`,
          )
          .join("")}</ul>`
      : "<p>No specific testing milestones for this stage.</p>";

    const symptomsHtml = symptoms?.items?.length
      ? `<ul>${symptoms.items
          .map(
            (s) =>
              `<li>${escapeHtml(s.symptom)} (${formatShortDate(s.loggedAt)})${
                s.severity ? ` — severity ${s.severity}/5` : ""
              }${s.notes ? `: ${escapeHtml(s.notes)}` : ""}</li>`,
          )
          .join("")}</ul>`
      : "<p>No symptoms logged recently.</p>";

    const kickHtml = latestKickSession
      ? `<p>${latestKickSession.kickCount} kicks recorded on ${formatShortDate(latestKickSession.startedAt)}${
          latestKickSession.endedAt
            ? ` (ended ${formatShortDate(latestKickSession.endedAt)})`
            : ""
        }</p>`
      : "<p>No kick counting sessions recorded yet.</p>";

    const contractionsHtml = contractionItems.length
      ? `<ul>${contractionItems
          .map((c) => {
            const dur = c.durationSeconds
              ? `${Math.round(c.durationSeconds / 60)} min`
              : "in progress";
            const interval = c.intervalSeconds
              ? `, ${Math.round(c.intervalSeconds / 60)} min since last`
              : "";
            return `<li>Started ${formatShortDate(c.startedAt)} — duration ${dur}${interval}</li>`;
          })
          .join("")}</ul>`
      : "<p>No contractions logged today.</p>";

    const scribeHtml = scribeNote
      ? `
        <p><strong>${escapeHtml(scribeNote.note.headline)}</strong></p>
        <p>${escapeHtml(scribeNote.note.whatWasDiscussed)}</p>
        ${
          scribeNote.note.nextSteps?.length
            ? `<p><strong>Next Steps:</strong></p><ul>${scribeNote.note.nextSteps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ul>`
            : ""
        }
        ${scribeNote.note.rememberTo ? `<p><em>${escapeHtml(scribeNote.note.rememberTo)}</em></p>` : ""}
        <p class="sub">Recorded ${formatDate(scribeNote.savedAt)}</p>
      `
      : "<p>No encounter notes recorded yet.</p>";

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 24px; color: #222; }
            h1 { font-size: 22px; margin-bottom: 4px; }
            h2 { font-size: 16px; margin-top: 24px; margin-bottom: 8px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
            p, li { font-size: 13px; line-height: 1.5; }
            ul { padding-left: 18px; margin: 0; }
            .sub { color: #666; font-size: 13px; margin-bottom: 16px; }
          </style>
        </head>
        <body>
          <h1>Visit Report</h1>
          <p class="sub">${nextVisit ? `Appointment: ${formatDate(nextVisit.visitDate)}` : "No upcoming appointment scheduled"}${
            gaAtVisit
              ? ` — ${gaAtVisit.weeks}w ${gaAtVisit.days}d gestational age`
              : ""
          }</p>

          <h2>What to Expect at This Visit</h2>
          ${expectHtml}

          <h2>Questions to Ask</h2>
          ${questionsHtml}

          <h2>Recent Symptoms</h2>
          ${symptomsHtml}

          <h2>Kick Counts</h2>
          ${kickHtml}

          <h2>Contraction Timing (Today)</h2>
          ${contractionsHtml}

          <h2>Encounter Notes (Scribe)</h2>
          ${scribeHtml}
        </body>
      </html>
    `;
  };

  const handleExport = async () => {
    try {
      setExporting(true);
      const html = buildHtml();
      if (Platform.OS === "web") {
        Alert.alert(
          "Not available on web",
          "PDF export is available on the mobile app.",
        );
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: "Share Visit Summary",
        });
      } else {
        Alert.alert("Saved", "Your visit summary PDF was created.");
      }
    } catch {
      Alert.alert("Couldn't export", "Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const handleViewInApp = async () => {
    try {
      setViewing(true);
      const html = buildHtml();
      const { uri } = await Print.printToFileAsync({ html });
      router.push({
        pathname: "/pdf-viewer",
        params: { uri, title: "Visit Summary" },
      });
    } catch {
      Alert.alert("Couldn't generate PDF", "Please try again.");
    } finally {
      setViewing(false);
    }
  };

  if (!isSignedIn) {
    return (
      <View
        style={[
          styles.signInScreen,
          { backgroundColor: colors.background, paddingTop: insets.top + 20 },
        ]}
      >
        <Ionicons
          name="lock-closed-outline"
          size={48}
          color={colors.mutedForeground}
        />
        <Text style={[styles.signInTitle, { color: colors.foreground }]}>
          Sign in to view your visit summary
        </Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + 12, borderBottomColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>
            Office Visits
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>
            Visit Report
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            {nextVisit
              ? formatDate(nextVisit.visitDate)
              : "No upcoming appointment scheduled"}
            {gaAtVisit ? ` · ${gaAtVisit.weeks}w ${gaAtVisit.days}d` : ""}
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(80).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            What to Expect at This Visit
          </Text>
          {whatToExpect.length ? (
            whatToExpect.map((t) => (
              <View key={t.time} style={styles.expectItem}>
                <Text style={[styles.expectTime, { color: colors.primary }]}>
                  {t.time}
                </Text>
                <Text style={[styles.body, { color: colors.foreground }]}>
                  {t.tests}
                </Text>
                <Text
                  style={[styles.bodyMuted, { color: colors.mutedForeground }]}
                >
                  {t.why}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.bodyMuted, { color: colors.mutedForeground }]}>
              Set a due date and appointment to see stage-specific guidance.
            </Text>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(140).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Questions to Ask
          </Text>
          {selectedQuestions.length ? (
            selectedQuestions.map((q) => (
              <View key={q} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: colors.primary }]}>
                  •
                </Text>
                <Text style={[styles.body, { color: colors.foreground }]}>
                  {q}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.bodyMuted, { color: colors.mutedForeground }]}>
              No questions selected yet. Go back to Office Visits to pick some.
            </Text>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(200).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Recent Symptoms
          </Text>
          {symptoms?.items?.length ? (
            symptoms.items.map((s) => (
              <View key={s.id} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: colors.primary }]}>
                  •
                </Text>
                <Text style={[styles.body, { color: colors.foreground }]}>
                  {s.symptom} ({formatShortDate(s.loggedAt)})
                  {s.severity ? ` — severity ${s.severity}/5` : ""}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.bodyMuted, { color: colors.mutedForeground }]}>
              No symptoms logged recently.
            </Text>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(260).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Kick Counts
          </Text>
          {latestKickSession ? (
            <Text style={[styles.body, { color: colors.foreground }]}>
              {latestKickSession.kickCount} kicks on{" "}
              {formatShortDate(latestKickSession.startedAt)}
            </Text>
          ) : (
            <Text style={[styles.bodyMuted, { color: colors.mutedForeground }]}>
              No kick counting sessions recorded yet.
            </Text>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(320).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Contraction Timing (Today)
          </Text>
          {contractionItems.length ? (
            contractionItems.map((c) => (
              <View key={c.id} style={styles.bulletRow}>
                <Text style={[styles.bullet, { color: colors.primary }]}>
                  •
                </Text>
                <Text style={[styles.body, { color: colors.foreground }]}>
                  Started {formatShortDate(c.startedAt)}
                  {c.durationSeconds
                    ? ` — ${Math.round(c.durationSeconds / 60)} min`
                    : ""}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.bodyMuted, { color: colors.mutedForeground }]}>
              No contractions logged today.
            </Text>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(380).duration(400)}
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
            Encounter Notes
          </Text>
          {scribeNote ? (
            <>
              <Text
                style={[styles.encounterHeadline, { color: colors.foreground }]}
              >
                {scribeNote.note.headline}
              </Text>
              <Text
                style={[
                  styles.bodyMuted,
                  { color: colors.mutedForeground, marginBottom: 10 },
                ]}
              >
                Recorded{" "}
                {new Date(scribeNote.savedAt).toLocaleDateString(undefined, {
                  weekday: "short",
                  month: "short",
                  day: "numeric",
                })}
              </Text>
              <Text style={[styles.body, { color: colors.foreground }]}>
                {scribeNote.note.whatWasDiscussed}
              </Text>
              {scribeNote.note.nextSteps?.length ? (
                <View style={{ marginTop: 10 }}>
                  <Text
                    style={[
                      styles.encounterLabel,
                      { color: colors.foreground },
                    ]}
                  >
                    Next Steps
                  </Text>
                  {scribeNote.note.nextSteps.map((step, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <Text style={[styles.bullet, { color: colors.primary }]}>
                        •
                      </Text>
                      <Text style={[styles.body, { color: colors.foreground }]}>
                        {step}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
              {scribeNote.note.rememberTo ? (
                <View
                  style={[
                    styles.rememberBox,
                    { backgroundColor: colors.muted },
                  ]}
                >
                  <Text
                    style={[
                      styles.bodyMuted,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {scribeNote.note.rememberTo}
                  </Text>
                </View>
              ) : null}
            </>
          ) : (
            <Text style={[styles.bodyMuted, { color: colors.mutedForeground }]}>
              No encounter notes yet. Use the Visit Notes Scribe to record your
              appointment and generate a summary.
            </Text>
          )}
        </Animated.View>

        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.primary }]}
          onPress={handleExport}
          disabled={exporting || viewing}
        >
          {exporting ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons
                name="share-outline"
                size={18}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.exportBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                View PDF
              </Text>
            </>
          )}
        </TouchableOpacity>

        {Platform.OS !== "web" && (
          <TouchableOpacity
            style={[
              styles.exportBtn,
              {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                marginTop: 10,
              },
            ]}
            onPress={handleViewInApp}
            disabled={exporting || viewing}
          >
            {viewing ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Ionicons
                  name="document-text-outline"
                  size={18}
                  color={colors.primary}
                />
                <Text style={[styles.exportBtnText, { color: colors.primary }]}>
                  View PDF in App
                </Text>
              </>
            )}
          </TouchableOpacity>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
  },
  backText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
    marginLeft: 2,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  pageTitle: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  pageSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
  },
  card: {
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  sectionTitle: {
    fontSize: 17,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 12,
  },
  expectItem: {
    marginBottom: 12,
  },
  expectTime: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  body: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    flex: 1,
  },
  bodyMuted: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 8,
  },
  bullet: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 8,
  },
  exportBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  signInScreen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  signInTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
  },
  encounterHeadline: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 4,
    lineHeight: 22,
  },
  encounterLabel: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 6,
  },
  rememberBox: {
    borderRadius: 10,
    padding: 12,
    marginTop: 10,
  },
});
