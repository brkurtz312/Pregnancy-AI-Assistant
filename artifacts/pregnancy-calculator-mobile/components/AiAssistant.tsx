import { Ionicons } from "@expo/vector-icons";
import {
  ApiError,
  useAskAssistant,
  useGetWeeklyInsight,
} from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";

import { useColors } from "@/hooks/useColors";
import { usePass } from "@/hooks/usePass";

interface AiAssistantProps {
  currentWeek: number;
}

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

const SUGGESTED_QUESTIONS = [
  "What foods should I avoid?",
  "How much weight gain is healthy?",
  "Is this amount of exercise safe?",
  "What prenatal tests happen now?",
];

const DEFAULT_DISCLAIMER =
  "This assistant gives general, evidence-based education — not medical advice. Always consult your healthcare provider about your specific situation.";

export function AiAssistant({ currentWeek }: AiAssistantProps) {
  const colors = useColors();
  const week = currentWeek > 0 ? Math.min(42, currentWeek) : null;

  const router = useRouter();
  const pass = usePass();

  const weekly = useGetWeeklyInsight();
  const ask = useAskAssistant();

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [disclaimer, setDisclaimer] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  useEffect(() => {
    if (week == null) return;
    weekly.mutate({ data: { week } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  // Re-enable the input whenever entitlement changes so a freshly purchased
  // pass, a new weekly free quota, or an account switch lifts the limit gate
  // immediately instead of leaving the user stuck on the upgrade banner.
  useEffect(() => {
    if (pass.hasPass || pass.freeRemaining > 0) {
      setLimitReached(false);
    }
  }, [pass.hasPass, pass.freeRemaining]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || ask.isPending) return;

    // Pre-empt the known weekly limit for signed-in free users so we don't
    // spend a request just to get a 403 back. Anonymous users are metered by
    // IP, so we let the server be the source of truth and handle 403 below.
    if (pass.isSignedIn && !pass.hasPass && pass.freeRemaining <= 0) {
      setLimitReached(true);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const history = messages.slice(-8);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");

    ask.mutate(
      { data: { question, week: week ?? undefined, history } },
      {
        onSuccess: (res) => {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: res.answer },
          ]);
          setDisclaimer(res.disclaimer);
          // Refresh remaining free count for signed-in users.
          pass.refresh();
        },
        onError: (err) => {
          // Server-enforced free limit: show the upgrade path, not an error.
          if (err instanceof ApiError && err.status === 403) {
            setLimitReached(true);
            pass.refresh();
            return;
          }
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "Sorry — I couldn't answer that just now. Please check your connection and try again.",
            },
          ]);
        },
      },
    );
  };

  return (
    <Animated.View entering={FadeInDown.duration(400).springify()}>
      {/* Weekly insight */}
      {week != null && (
        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleRow}>
              <Ionicons
                name="sparkles-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                Your Week {week} Insight
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                weekly.mutate({ data: { week } });
              }}
              disabled={weekly.isPending}
              hitSlop={8}
            >
              <Ionicons
                name="refresh-outline"
                size={18}
                color={
                  weekly.isPending ? colors.mutedForeground : colors.primary
                }
              />
            </TouchableOpacity>
          </View>

          {weekly.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text
                style={[styles.loadingText, { color: colors.mutedForeground }]}
              >
                Gathering guidance for week {week}…
              </Text>
            </View>
          ) : weekly.isError ? (
            <TouchableOpacity onPress={() => weekly.mutate({ data: { week } })}>
              <Text
                style={[styles.errorText, { color: colors.mutedForeground }]}
              >
                Couldn't load this week's insight. Tap to try again.
              </Text>
            </TouchableOpacity>
          ) : weekly.data ? (
            <Text style={[styles.insightText, { color: colors.foreground }]}>
              {weekly.data.insight}
            </Text>
          ) : null}
        </View>
      )}

      {/* Q&A */}
      <View
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <View style={styles.askHeaderRow}>
          <View style={styles.cardTitleRow}>
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.cardTitle, { color: colors.foreground }]}>
              Ask a Question
            </Text>
          </View>
          {pass.hasPass ? (
            <View
              style={[styles.unlimitedPill, { backgroundColor: colors.muted }]}
            >
              <Ionicons name="sparkles" size={12} color={colors.primary} />
              <Text style={[styles.unlimitedText, { color: colors.primary }]}>
                Unlimited
              </Text>
            </View>
          ) : pass.isSignedIn ? (
            <Text
              style={[styles.remainingText, { color: colors.mutedForeground }]}
            >
              {pass.freeRemaining} free left
            </Text>
          ) : null}
        </View>

        {messages.length === 0 ? (
          <>
            <Text style={[styles.introText, { color: colors.mutedForeground }]}>
              Ask anything about your pregnancy or your baby's development.
              Answers reflect evidence-based guidance from organizations like
              ACOG and the AAP.
            </Text>
            <View style={styles.suggestionWrap}>
              {SUGGESTED_QUESTIONS.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[
                    styles.suggestionPill,
                    {
                      borderColor: colors.border,
                      backgroundColor: colors.muted,
                    },
                  ]}
                  onPress={() => send(q)}
                >
                  <Text
                    style={[styles.suggestionText, { color: colors.primary }]}
                  >
                    {q}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <View style={styles.messagesWrap}>
            {messages.map((m, i) => (
              <View
                key={i}
                style={[
                  styles.bubble,
                  m.role === "user"
                    ? { alignSelf: "flex-end", backgroundColor: colors.primary }
                    : {
                        alignSelf: "flex-start",
                        backgroundColor: colors.muted,
                      },
                ]}
              >
                <Text
                  style={[
                    styles.bubbleText,
                    { color: m.role === "user" ? "#fff" : colors.foreground },
                  ]}
                >
                  {m.content}
                </Text>
              </View>
            ))}
            {ask.isPending && (
              <View
                style={[
                  styles.bubble,
                  { alignSelf: "flex-start", backgroundColor: colors.muted },
                ]}
              >
                <View style={styles.loadingRow}>
                  <ActivityIndicator
                    size="small"
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.loadingText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Thinking…
                  </Text>
                </View>
              </View>
            )}
          </View>
        )}

        {limitReached ? (
          <View
            style={[
              styles.upgradeBanner,
              { borderColor: colors.primary, backgroundColor: colors.muted },
            ]}
          >
            <Text style={[styles.upgradeTitle, { color: colors.foreground }]}>
              {pass.isSignedIn
                ? "You've used your free questions this week"
                : "Free question limit reached"}
            </Text>
            <Text
              style={[styles.upgradeBody, { color: colors.mutedForeground }]}
            >
              {pass.isSignedIn
                ? "Unlock the Full Pregnancy Pass for unlimited AI questions on every device."
                : "Sign in, then unlock the Full Pregnancy Pass for unlimited AI questions."}
            </Text>
            <TouchableOpacity
              style={[styles.upgradeBtn, { backgroundColor: colors.primary }]}
              onPress={() => {
                if (pass.isSignedIn) pass.startCheckout();
                else router.push("/sign-in");
              }}
              disabled={pass.isStartingCheckout}
            >
              {pass.isStartingCheckout ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.upgradeBtnText}>
                  {pass.isSignedIn ? "Get the Pass — $24.99" : "Sign In"}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.inputRow}>
            <TextInput
              style={[
                styles.input,
                {
                  borderColor: colors.border,
                  color: colors.foreground,
                  backgroundColor: colors.background,
                },
              ]}
              value={input}
              onChangeText={setInput}
              placeholder="Type your question…"
              placeholderTextColor={colors.mutedForeground}
              multiline
              onSubmitEditing={() => send(input)}
              blurOnSubmit={Platform.OS === "ios"}
              returnKeyType="send"
            />
            <TouchableOpacity
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    input.trim() && !ask.isPending
                      ? colors.primary
                      : colors.muted,
                },
              ]}
              onPress={() => send(input)}
              disabled={!input.trim() || ask.isPending}
            >
              <Ionicons
                name="send"
                size={18}
                color={
                  input.trim() && !ask.isPending
                    ? "#fff"
                    : colors.mutedForeground
                }
              />
            </TouchableOpacity>
          </View>
        )}

        <View style={styles.disclaimerRow}>
          <Ionicons
            name="information-circle-outline"
            size={13}
            color={colors.mutedForeground}
          />
          <Text
            style={[styles.disclaimerText, { color: colors.mutedForeground }]}
          >
            {disclaimer ?? DEFAULT_DISCLAIMER}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginTop: 12,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  cardTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  cardTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  askHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  remainingText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  unlimitedPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  unlimitedText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  upgradeBanner: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  upgradeTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  upgradeBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  upgradeBtn: {
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 2,
  },
  upgradeBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  loadingText: { fontSize: 13, fontFamily: "Inter_400Regular" },
  errorText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  insightText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  introText: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  suggestionWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  suggestionPill: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  suggestionText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  messagesWrap: { gap: 8 },
  bubble: {
    maxWidth: "88%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    maxHeight: 120,
    minHeight: 44,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  disclaimerRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
  disclaimerText: {
    flex: 1,
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    lineHeight: 16,
  },
});
