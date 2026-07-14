import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { AskCard } from "@/components/AskCard";
import {
  getVideoVaultTotals,
  VIDEO_VAULT_SOURCES,
  VIDEO_VAULT_SOURCE_COLORS,
  VIDEO_VAULT_TOPICS,
  type VideoVaultTopic,
  type VideoVaultVideo,
} from "@/lib/video-vault";

function VideoRow({ video }: { video: VideoVaultVideo }) {
  const colors = useColors();
  const sourceColor = VIDEO_VAULT_SOURCE_COLORS[video.source] ?? colors.primary;

  return (
    <TouchableOpacity
      style={[styles.videoRow, { borderColor: colors.border }]}
      onPress={() => WebBrowser.openBrowserAsync(video.url)}
      activeOpacity={0.7}
    >
      <View
        style={[styles.playIcon, { backgroundColor: colors.primary + "18" }]}
      >
        <Ionicons name="play" size={13} color={colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={[styles.videoTitle, { color: colors.foreground }]}
          numberOfLines={2}
        >
          {video.title}
        </Text>
        <View style={styles.videoMetaRow}>
          <View
            style={[
              styles.sourceBadge,
              { backgroundColor: sourceColor + "20" },
            ]}
          >
            <Text style={[styles.sourceBadgeText, { color: sourceColor }]}>
              {video.source}
            </Text>
          </View>
          {video.language && (
            <Text
              style={[styles.videoMetaText, { color: colors.mutedForeground }]}
            >
              🌐 {video.language}
            </Text>
          )}
          {!video.verified && (
            <Text
              style={[
                styles.videoMetaText,
                styles.videoMetaItalic,
                { color: colors.mutedForeground },
              ]}
            >
              Search result
            </Text>
          )}
        </View>
      </View>
      <Ionicons name="open-outline" size={16} color={colors.mutedForeground} />
    </TouchableOpacity>
  );
}

function TopicCard({
  topic,
  delay,
  openTrigger = 0,
}: {
  topic: VideoVaultTopic;
  delay: number;
  openTrigger?: number;
}) {
  const colors = useColors();
  const [open, setOpen] = useState(openTrigger > 0);

  useEffect(() => {
    if (openTrigger > 0) setOpen(true);
  }, [openTrigger]);

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(400)}
      style={[
        styles.topicCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
    >
      <TouchableOpacity
        style={styles.topicHeader}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Text style={styles.topicIcon}>{topic.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.topicNumber, { color: colors.mutedForeground }]}>
            Topic {topic.number}
          </Text>
          <Text style={[styles.topicTitle, { color: colors.foreground }]}>
            {topic.title}
          </Text>
        </View>
        <View style={styles.topicHeaderRight}>
          <Text style={[styles.topicCount, { color: colors.mutedForeground }]}>
            {topic.videos.length}
          </Text>
          <Ionicons
            name={open ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.mutedForeground}
          />
        </View>
      </TouchableOpacity>

      {open && (
        <View style={styles.topicBody}>
          {topic.videos.map((v, i) => (
            <VideoRow key={i} video={v} />
          ))}
        </View>
      )}
    </Animated.View>
  );
}

export default function VideoVaultScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { topic: deepLinkTopicId } = useLocalSearchParams<{ topic?: string }>();
  const [search, setSearch] = useState("");
  const [filterSource, setFilterSource] = useState("All");

  // Monotonically-increasing counter: increments every time deepLinkTopicId
  // changes to a non-empty value. Passed as `openTrigger` to the matching
  // TopicCard so that tapping the same search result a second time (after the
  // user manually closed the card) still re-opens it, even when the URL param
  // value did not change between navigations.
  const [deepLinkVersion, setDeepLinkVersion] = useState(0);
  const prevDeepLinkRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (deepLinkTopicId && deepLinkTopicId !== prevDeepLinkRef.current) {
      setDeepLinkVersion((v) => v + 1);
    }
    prevDeepLinkRef.current = deepLinkTopicId;
  }, [deepLinkTopicId]);

  const { totalVideos, verifiedCount, topicCount } = useMemo(
    () => getVideoVaultTotals(),
    [],
  );

  const q = search.toLowerCase().trim();

  const filtered = useMemo(() => {
    return VIDEO_VAULT_TOPICS.map((t) => ({
      ...t,
      videos: t.videos.filter((v) => {
        const matchSearch =
          !q ||
          v.title.toLowerCase().includes(q) ||
          v.source.toLowerCase().includes(q) ||
          t.title.toLowerCase().includes(q);
        const matchSource = filterSource === "All" || v.source === filterSource;
        return matchSearch && matchSource;
      }),
    })).filter((t) => t.videos.length > 0);
  }, [q, filterSource]);

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
            Learn
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>
            Video Vault
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Evidence-based pregnancy and newborn education videos from trusted
            sources — ACOG, SMFM, AAP, NICHD, CDC, March of Dimes, MotherToBaby,
            and AWHONN.
          </Text>
          <View style={styles.statsRow}>
            <Text style={[styles.statsText, { color: colors.mutedForeground }]}>
              {totalVideos} videos · {topicCount} topics
            </Text>
            <Text style={[styles.statsHighlight, { color: colors.primary }]}>
              {verifiedCount} direct links verified
            </Text>
          </View>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={styles.searchRow}
        >
          <View
            style={[
              styles.searchBox,
              { borderColor: colors.border, backgroundColor: colors.muted },
            ]}
          >
            <Ionicons name="search" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.searchInput, { color: colors.foreground }]}
              value={search}
              onChangeText={setSearch}
              placeholder="Search videos or topics…"
              placeholderTextColor={colors.mutedForeground}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearch("")}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="close-circle"
                  size={16}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            )}
          </View>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(60).duration(400)}>
          <FlatList
            data={VIDEO_VAULT_SOURCES}
            horizontal
            showsHorizontalScrollIndicator={false}
            keyExtractor={(s) => s}
            contentContainerStyle={styles.chipsRow}
            renderItem={({ item }) => {
              const active = filterSource === item;
              return (
                <TouchableOpacity
                  style={[
                    styles.chip,
                    {
                      backgroundColor: active ? colors.primary : colors.card,
                      borderColor: active ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setFilterSource(item)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: active
                          ? colors.primaryForeground
                          : colors.foreground,
                      },
                    ]}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              );
            }}
          />
        </Animated.View>

        {filtered.length === 0 ? (
          <Animated.View
            entering={FadeInDown.delay(100).duration(400)}
            style={styles.emptyState}
          >
            <Ionicons
              name="videocam-off-outline"
              size={28}
              color={colors.mutedForeground}
            />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>
              No videos found
            </Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              Try a different search term or source filter.
            </Text>
          </Animated.View>
        ) : (
          filtered.map((topic, i) => (
            <TopicCard
              key={topic.id}
              topic={topic}
              delay={100 + i * 30}
              openTrigger={deepLinkTopicId === topic.id ? deepLinkVersion : 0}
            />
          ))
        )}

        <AskCard returnTo="/video-vault" />
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
  backBtn: { flexDirection: "row", alignItems: "center" },
  backText: { fontSize: 16, fontFamily: "Inter_500Medium", marginLeft: 2 },
  scroll: { paddingHorizontal: 16, paddingTop: 16 },
  pageTitle: { fontSize: 26, fontFamily: "Inter_700Bold", marginBottom: 4 },
  pageSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  statsText: { fontSize: 12, fontFamily: "Inter_400Regular" },
  statsHighlight: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  searchRow: { marginBottom: 12 },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    padding: 0,
  },
  chipsRow: { gap: 8, paddingBottom: 16 },
  chip: {
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  chipText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  topicCard: {
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 12,
    overflow: "hidden",
  },
  topicHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 14,
  },
  topicIcon: { fontSize: 22 },
  topicNumber: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 2,
  },
  topicTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  topicHeaderRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  topicCount: { fontSize: 12, fontFamily: "Inter_400Regular" },
  topicBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  videoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderTopWidth: 1,
    paddingTop: 10,
  },
  playIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  videoTitle: {
    fontSize: 13.5,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
    marginBottom: 4,
  },
  videoMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flexWrap: "wrap",
  },
  sourceBadge: {
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sourceBadgeText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  videoMetaText: { fontSize: 11, fontFamily: "Inter_400Regular" },
  videoMetaItalic: { fontStyle: "italic" },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 6,
  },
  emptyTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
