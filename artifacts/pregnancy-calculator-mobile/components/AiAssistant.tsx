import { Ionicons } from "@expo/vector-icons";
import { useAskAssistant, useGetWeeklyInsight } from "@workspace/api-client-react";
import * as Haptics from "expo-haptics";
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

  const weekly = useGetWeeklyInsight();
  const ask = useAskAssistant();

  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [disclaimer, setDisclaimer] = useState<string | null>(null);

  useEffect(() => {
    if (week == null) return;
    weekly.mutate({ data: { week } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [week]);

  const send = (text: string) => {
    const question = text.trim();
    if (!question || ask.isPending) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const history = messages.slice(-8);
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setInput("");

    ask.mutate(
      { data: { question, week: week ?? undefined, history } },
      {
        onSuccess: (res) => {
          setMessages((prev) => [...prev, { role: "assistant", content: res.answer }]);
          setDisclaimer(res.disclaimer);
        },
        onError: () => {
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
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.cardHeaderRow}>
            <View style={styles.cardTitleRow}>
              <Ionicons name="sparkles-outline" size={18} color={colors.primary} />
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
                color={weekly.isPending ? colors.mutedForeground : colors.primary}
              />
            </TouchableOpacity>
          </View>

          {weekly.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.primary} />
              <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>
                Gathering guidance for week {week}…
              </Text>
            </View>
          ) : weekly.isError ? (
            <TouchableOpacity onPress={() => weekly.mutate({ data: { week } })}>
              <Text style={[styles.errorText, { color: colors.mutedForeground }]}>
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
      <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.cardTitleRow}>
          <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.primary} />
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>Ask a Question</Text>
        </View>

        {messages.length === 0 ? (
          <>
            <Text style={[styles.introText, { color: colors.mutedForeground }]}>
              Ask anything about your pregnancy or your baby's development. Answers reflect
              evidence-based guidance from organizations like ACOG and the AAP.
            </Text>
            <View style={styles.suggestionWrap}>
              {SUGGESTED_QUESTIONS.map((q) => (
                <TouchableOpacity
                  key={q}
                  style={[styles.suggestionPill, { borderColor: colors.border, backgroundColor: colors.muted }]}
                  onPress={() => send(q)}
                >
                  <Text style={[styles.suggestionText, { color: colors.primary }]}>{q}</Text>
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
                    : { alignSelf: "flex-start", backgroundColor: colors.muted },
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
              <View style={[styles.bubble, { alignSelf: "flex-start", backgroundColor: colors.muted }]}>
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={colors.mutedForeground} />
                  <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>Thinking…</Text>
                </View>
              </View>
            )}
          </View>
        )}

        <View style={styles.inputRow}>
          <TextInput
            style={[
              styles.input,
              { borderColor: colors.border, color: colors.foreground, backgroundColor: colors.background },
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
              { backgroundColor: input.trim() && !ask.isPending ? colors.primary : colors.muted },
            ]}
            onPress={() => send(input)}
            disabled={!input.trim() || ask.isPending}
          >
            <Ionicons
              name="send"
              size={18}
              color={input.trim() && !ask.isPending ? "#fff" : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.disclaimerRow}>
          <Ionicons name="information-circle-outline" size={13} color={colors.mutedForeground} />
          <Text style={[styles.disclaimerText, { color: colors.mutedForeground }]}>
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
  disclaimerText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", lineHeight: 16 },
});
