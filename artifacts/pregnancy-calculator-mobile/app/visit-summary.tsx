import { Ionicons } from "@expo/vector-icons";
import { useAppAuth as useUser } from "@/hooks/useAppAuth";
import { router } from "expo-router";
import * as Print from "expo-print";
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
import { PassGate } from "@/components/PassGate";
import { usePass } from "@/hooks/usePass";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";

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
  const [showPassGate, setShowPassGate] = useState(false);
  const { hasPass } = usePass();

  useEffect(() => {
    loadQuestions().then((items) =>
      setSelectedQuestions(getSelectedQuestions(items)),
    );
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

  const latestMeasurementVisit = useMemo(() => {
    if (!visits?.items?.length) return null;
    return (
      [...visits.items]
        .sort(
          (a, b) =>
            new Date(b.visitDate).getTime() - new Date(a.visitDate).getTime(),
        )
        .find((v) => v.weight || v.bloodPressure) ?? null
    );
  }, [visits]);

  const weightGainText = useMemo(() => {
    const preStr = profile?.prePregnancyWeight;
    const curStr = latestMeasurementVisit?.weight;
    if (!preStr || !curStr) return null;
    const parseNum = (s: string) => parseFloat(s.replace(/[^0-9.]/g, ""));
    const isKg = (s: string) => /kg/i.test(s);
    const preNum = parseNum(preStr);
    const curNum = parseNum(curStr);
    if (isNaN(preNum) || isNaN(curNum)) return null;
    const preLbs = isKg(preStr) ? preNum * 2.20462 : preNum;
    const curLbs = isKg(curStr) ? curNum * 2.20462 : curNum;
    const diff = curLbs - preLbs;
    const sign = diff >= 0 ? "+" : "";
    return `${sign}${diff.toFixed(1)} lbs gained`;
  }, [profile?.prePregnancyWeight, latestMeasurementVisit?.weight]);

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

    const providerName = profile?.providerName;
    const providerAddress = profile?.providerAddress;
    const patientName = profile?.firstName;

    const providerHtml =
      providerName || providerAddress
        ? `<div class="provider-card">
            <span class="provider-icon">🏥</span>
            <div class="provider-info">
              ${providerName ? `<div class="provider-name">${escapeHtml(providerName)}</div>` : ""}
              ${providerAddress ? `<div class="provider-addr">${escapeHtml(providerAddress)}</div>` : ""}
            </div>
          </div>`
        : "";

    const hasMeasurements =
      latestMeasurementVisit?.weight ||
      latestMeasurementVisit?.bloodPressure ||
      weightGainText;
    const measurementsHtml = hasMeasurements
      ? `<div class="stats-row">
          ${
            latestMeasurementVisit?.weight
              ? `<div class="stat-box">
                  <div class="stat-label">Weight</div>
                  <div class="stat-value">${escapeHtml(latestMeasurementVisit.weight)}</div>
                </div>`
              : ""
          }
          ${
            latestMeasurementVisit?.bloodPressure
              ? `<div class="stat-box">
                  <div class="stat-label">Blood Pressure</div>
                  <div class="stat-value">${escapeHtml(latestMeasurementVisit.bloodPressure)}</div>
                </div>`
              : ""
          }
          ${
            weightGainText
              ? `<div class="stat-box stat-gain">
                  <div class="stat-label">Total Gained</div>
                  <div class="stat-value">${escapeHtml(weightGainText)}</div>
                </div>`
              : ""
          }
        </div>`
      : "";

    return `
      <html>
        <head>
          <meta charset="utf-8" />
          <style>
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body {
              font-family: -apple-system, Georgia, "Times New Roman", serif;
              background: #fff;
              color: #2d2d2d;
            }
            .header {
              background: linear-gradient(135deg, #c2185b 0%, #e91e8c 50%, #f8a4c4 100%);
              padding: 36px 28px 28px;
              color: #fff;
            }
            .header-heart { font-size: 28px; margin-bottom: 8px; }
            .header h1 {
              font-size: 26px;
              font-weight: 700;
              letter-spacing: -0.5px;
              margin-bottom: 6px;
            }
            .header-sub {
              font-size: 14px;
              opacity: 0.92;
              line-height: 1.5;
            }
            .body-wrap { padding: 24px 28px; }
            .provider-card {
              display: flex;
              align-items: flex-start;
              gap: 12px;
              background: #fce4ec;
              border-left: 4px solid #c2185b;
              border-radius: 10px;
              padding: 14px 16px;
              margin-bottom: 20px;
            }
            .provider-icon { font-size: 22px; }
            .provider-name {
              font-size: 15px;
              font-weight: 700;
              color: #880e4f;
            }
            .provider-addr {
              font-size: 13px;
              color: #ad1457;
              margin-top: 3px;
            }
            .stats-row {
              display: flex;
              gap: 10px;
              margin-bottom: 22px;
              flex-wrap: wrap;
            }
            .stat-box {
              flex: 1;
              min-width: 90px;
              background: #fce4ec;
              border-radius: 12px;
              padding: 12px 14px;
              text-align: center;
            }
            .stat-gain {
              background: #e8f5e9;
            }
            .stat-label {
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.6px;
              color: #880e4f;
              margin-bottom: 5px;
            }
            .stat-gain .stat-label { color: #2e7d32; }
            .stat-value {
              font-size: 16px;
              font-weight: 700;
              color: #c2185b;
            }
            .stat-gain .stat-value { color: #388e3c; }
            h2 {
              font-size: 14px;
              font-weight: 700;
              text-transform: uppercase;
              letter-spacing: 0.8px;
              color: #c2185b;
              margin-top: 24px;
              margin-bottom: 10px;
              padding-bottom: 6px;
              border-bottom: 2px solid #fce4ec;
            }
            p, li {
              font-size: 13px;
              line-height: 1.65;
              color: #3d3d3d;
            }
            ul { padding-left: 18px; }
            li { margin-bottom: 5px; }
            .sub {
              font-size: 12px;
              color: #999;
              margin-top: 4px;
              font-style: italic;
            }
            .footer {
              margin-top: 36px;
              padding: 18px 28px;
              background: #fce4ec;
              text-align: center;
              font-size: 11px;
              color: #ad1457;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="header-heart">♥</div>
            <h1>Visit Report</h1>
            <div class="header-sub">
              ${patientName ? `${escapeHtml(patientName)}'s Appointment` : "Appointment"}
              ${nextVisit ? ` · ${formatDate(nextVisit.visitDate)}` : " · No upcoming appointment scheduled"}
              ${gaAtVisit ? `<br/>${gaAtVisit.weeks}w ${gaAtVisit.days}d gestational age` : ""}
            </div>
          </div>

          <div class="body-wrap">
            ${providerHtml}
            ${measurementsHtml}

            <h2>What to Expect at This Visit</h2>
            ${expectHtml}

            <h2>Questions to Ask</h2>
            ${questionsHtml}

            <h2>Recent Symptoms</h2>
            ${symptomsHtml}

            <h2>Kick Counts</h2>
            ${kickHtml}

            <h2>Contraction Timing</h2>
            ${contractionsHtml}

          </div>

          <div class="footer">
            ♥ Generated by Pregnancy Assistant · ${new Date().toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
          </div>
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
      router.push({
        pathname: "/pdf-viewer",
        params: { uri, title: "Visit Report", shareTitle: "Visit Report" },
      });
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
        params: { uri, title: "Visit Report" },
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
        <ResponsiveContainer style={{ paddingHorizontal: 16 }}>
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

          {(latestMeasurementVisit?.weight ||
            latestMeasurementVisit?.bloodPressure ||
            weightGainText) && (
            <Animated.View
              entering={FadeInDown.delay(60).duration(400)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                Last Recorded Measurements
              </Text>
              <View style={styles.statsRow}>
                {latestMeasurementVisit?.weight && (
                  <View
                    style={[styles.statBox, { backgroundColor: colors.muted }]}
                  >
                    <Text
                      style={[
                        styles.statLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      WEIGHT
                    </Text>
                    <Text
                      style={[styles.statValue, { color: colors.foreground }]}
                    >
                      {latestMeasurementVisit.weight}
                    </Text>
                  </View>
                )}
                {latestMeasurementVisit?.bloodPressure && (
                  <View
                    style={[styles.statBox, { backgroundColor: colors.muted }]}
                  >
                    <Text
                      style={[
                        styles.statLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      BLOOD PRESSURE
                    </Text>
                    <Text
                      style={[styles.statValue, { color: colors.foreground }]}
                    >
                      {latestMeasurementVisit.bloodPressure}
                    </Text>
                  </View>
                )}
                {weightGainText && (
                  <View
                    style={[
                      styles.statBox,
                      { backgroundColor: colors.primary + "18" },
                    ]}
                  >
                    <Text style={[styles.statLabel, { color: colors.primary }]}>
                      TOTAL GAINED
                    </Text>
                    <Text style={[styles.statValue, { color: colors.primary }]}>
                      {weightGainText}
                    </Text>
                  </View>
                )}
              </View>
              <Text
                style={[
                  styles.bodyMuted,
                  { color: colors.mutedForeground, marginTop: 6 },
                ]}
              >
                From visit on{" "}
                {formatShortDate(latestMeasurementVisit!.visitDate)}
              </Text>
            </Animated.View>
          )}

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
                    style={[
                      styles.bodyMuted,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {t.why}
                  </Text>
                </View>
              ))
            ) : (
              <Text
                style={[styles.bodyMuted, { color: colors.mutedForeground }]}
              >
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
              <Text
                style={[styles.bodyMuted, { color: colors.mutedForeground }]}
              >
                No questions selected yet. Go back to Office Visits to pick
                some.
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
              <Text
                style={[styles.bodyMuted, { color: colors.mutedForeground }]}
              >
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
              <Text
                style={[styles.bodyMuted, { color: colors.mutedForeground }]}
              >
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
              <Text
                style={[styles.bodyMuted, { color: colors.mutedForeground }]}
              >
                No contractions logged today.
              </Text>
            )}
          </Animated.View>

          <TouchableOpacity
            style={[
              styles.exportBtn,
              {
                backgroundColor: hasPass
                  ? colors.primary
                  : (colors.muted ?? "#f5f5f5"),
                borderWidth: hasPass ? 0 : 1,
                borderColor: colors.border,
              },
            ]}
            onPress={() => {
              if (!hasPass) {
                setShowPassGate(true);
                return;
              }
              if (Platform.OS === "web") {
                void handleExport();
              } else {
                void handleViewInApp();
              }
            }}
            disabled={exporting || viewing}
          >
            {exporting || viewing ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Ionicons
                  name={
                    hasPass ? "document-text-outline" : "lock-closed-outline"
                  }
                  size={18}
                  color={
                    hasPass ? colors.primaryForeground : colors.mutedForeground
                  }
                />
                <Text
                  style={[
                    styles.exportBtnText,
                    {
                      color: hasPass
                        ? colors.primaryForeground
                        : colors.mutedForeground,
                    },
                  ]}
                >
                  {hasPass ? "View Visit Report" : "Unlock to View Report"}
                </Text>
              </>
            )}
          </TouchableOpacity>

          <PassGate
            visible={showPassGate}
            onClose={() => setShowPassGate(false)}
            title="Full Pregnancy Pass"
            description="View and share your complete visit report — including encounter notes, prep questions, and test timeline — as a beautiful PDF."
          />
        </ResponsiveContainer>
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
  statsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
    marginBottom: 4,
  },
  statBox: {
    flex: 1,
    minWidth: 90,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  statLabel: {
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.6,
    marginBottom: 4,
  },
  statValue: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
  },
});
