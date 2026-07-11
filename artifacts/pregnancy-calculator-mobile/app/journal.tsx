import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "expo-router";
import { useAuth, useUser } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import {
  cacheEntries,
  clearJournalCache,
  getJournalCacheOwner,
  loadEntries,
  setJournalCacheOwner,
  getAgeLabel,
  MOOD_OPTIONS,
  type JournalEntry,
  type JournalMedia,
} from "@/lib/journal";
import { apiLoadJournalEntries, apiUpsertJournalEntry } from "@/lib/sync-api";
import {
  clearPendingSync,
  hasPendingSync,
  markPendingSync,
  tryAcquireSyncLock,
  releaseSyncLock,
} from "@/lib/sync-queue";
import { useNetReconnect } from "@/hooks/useNetReconnect";
import { SyncBanner } from "@/components/SyncBanner";
import { exportJournalPdf } from "@/lib/journal-pdf";
import { usePass } from "@/hooks/usePass";
import { PassGate } from "@/components/PassGate";
import { FREE_JOURNAL_ENTRY_LIMIT } from "@/constants/free-limits";

const SCREEN_WIDTH = Dimensions.get("window").width;
const GRID_GAP = 4;
const GRID_PADDING = 16;
const GRID_CELL = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP) / 2;

type Tab = "journal" | "bump" | "ultrasound";

function formatEntryDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getMoodEmoji(mood: JournalEntry["mood"]): string {
  return MOOD_OPTIONS.find((m) => m.value === mood)?.emoji ?? "";
}

function EntryCard({
  entry,
  onPress,
  colors,
}: {
  entry: JournalEntry;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  const ageLabel = getAgeLabel(entry);
  const moodEmoji = getMoodEmoji(entry.mood);
  const firstPhoto = entry.media.find((m) => m.type === "photo");
  const mediaCount = entry.media.length;

  return (
    <TouchableOpacity
      style={[
        styles.entryCard,
        { backgroundColor: colors.card, borderColor: colors.border },
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.entryCardContent}>
        <View style={{ flex: 1 }}>
          <View style={styles.entryMeta}>
            <Text style={[styles.entryDate, { color: colors.mutedForeground }]}>
              {formatEntryDate(entry.createdAt)}
            </Text>
            {moodEmoji ? (
              <Text style={styles.moodEmoji}>{moodEmoji}</Text>
            ) : null}
          </View>
          {ageLabel ? (
            <View
              style={[
                styles.agePill,
                { backgroundColor: (colors.primary ?? "#e86cad") + "18" },
              ]}
            >
              <Text style={[styles.agePillText, { color: colors.primary }]}>
                {ageLabel}
              </Text>
            </View>
          ) : null}
          {entry.text ? (
            <Text
              style={[styles.entryPreview, { color: colors.foreground }]}
              numberOfLines={3}
            >
              {entry.text}
            </Text>
          ) : (
            <Text
              style={[
                styles.entryPreview,
                { color: colors.mutedForeground, fontStyle: "italic" },
              ]}
            >
              No text — tap to edit
            </Text>
          )}
          {mediaCount > 0 && (
            <View style={styles.mediaCountRow}>
              <Ionicons
                name="images-outline"
                size={13}
                color={colors.mutedForeground}
              />
              <Text
                style={[
                  styles.mediaCountText,
                  { color: colors.mutedForeground },
                ]}
              >
                {mediaCount} {mediaCount === 1 ? "photo" : "photos/videos"}
              </Text>
            </View>
          )}
        </View>
        {firstPhoto ? (
          <Image
            source={{ uri: firstPhoto.uri }}
            style={styles.entryThumb}
            contentFit="cover"
          />
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function PhotoGrid({
  items,
  onPress,
  emptyIcon,
  emptyText,
  colors,
}: {
  items: { media: JournalMedia; entry: JournalEntry }[];
  onPress: (entry: JournalEntry) => void;
  emptyIcon: keyof typeof Ionicons.glyphMap;
  emptyText: string;
  colors: ReturnType<typeof useColors>;
}) {
  if (!items.length) {
    return (
      <View style={styles.emptyState}>
        <Ionicons name={emptyIcon} size={48} color={colors.mutedForeground} />
        <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>
          {emptyText}
        </Text>
      </View>
    );
  }

  const rows: (typeof items)[] = [];
  for (let i = 0; i < items.length; i += 2) {
    rows.push(items.slice(i, i + 2));
  }

  return (
    <View style={styles.gridContainer}>
      {rows.map((row, ri) => (
        <View key={ri} style={styles.gridRow}>
          {row.map(({ media, entry }) => {
            const ageLabel = getAgeLabel(entry);
            return (
              <TouchableOpacity
                key={media.id}
                style={[
                  styles.gridCell,
                  { backgroundColor: colors.muted, borderColor: colors.border },
                ]}
                onPress={() => onPress(entry)}
                activeOpacity={0.85}
              >
                {media.type === "photo" ? (
                  <Image
                    source={{ uri: media.uri }}
                    style={styles.gridImage}
                    contentFit="cover"
                  />
                ) : (
                  <View
                    style={[
                      styles.gridImage,
                      {
                        backgroundColor: colors.muted,
                        alignItems: "center",
                        justifyContent: "center",
                      },
                    ]}
                  >
                    <Ionicons
                      name="play-circle"
                      size={40}
                      color={colors.primary}
                    />
                  </View>
                )}
                {ageLabel ? (
                  <View style={styles.gridLabel}>
                    <Text
                      style={[
                        styles.gridLabelText,
                        { color: colors.mutedForeground },
                      ]}
                      numberOfLines={1}
                    >
                      {ageLabel}
                    </Text>
                  </View>
                ) : null}
              </TouchableOpacity>
            );
          })}
          {row.length === 1 && <View style={{ width: GRID_CELL }} />}
        </View>
      ))}
    </View>
  );
}

export default function JournalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>("journal");
  const [showGate, setShowGate] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncFailed, setSyncFailed] = useState(false);
  const { hasPass } = usePass();
  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const migratedForUserRef = useRef<string | null>(null);
  // Holds the latest sync function so useNetReconnect can call it without
  // capturing a stale closure or needing extra state as a trigger.
  const syncNowRef = useRef<() => void>(() => {});

  async function handleExportPdf() {
    if (exporting || entries.length === 0) return;
    setExporting(true);
    try {
      await exportJournalPdf(entries);
    } finally {
      setExporting(false);
    }
  }

  // Fire the latest sync function whenever connectivity is restored.
  useNetReconnect(() => syncNowRef.current());

  useFocusEffect(
    useCallback(() => {
      const userId = user?.id ?? null;

      const syncNow = () => {
        if (isSignedIn && userId) {
          // Acquire the single-flight lock so the global background sync hook
          // (mounted at the root layout) cannot concurrently upsert the same
          // local-only entries, which would create duplicate server records.
          // If the global hook already holds the lock this call skips
          // gracefully — the global path will clear the pending marker.
          if (!tryAcquireSyncLock("journal")) return;
          // Pre-flight: clear stale cross-user cache before any load. Running
          // this before the API call ensures isolation even when the network is
          // unavailable and the catch path falls back to local data.
          // owner=null means anonymous cache (valid first-sign-in migration).
          getJournalCacheOwner()
            .then(async (cacheOwner) => {
              if (cacheOwner !== null && cacheOwner !== userId) {
                await clearJournalCache();
              }
            })
            .then(() => apiLoadJournalEntries(getToken))
            .then(async (serverEntries) => {
              const localEntries = await loadEntries();
              const localById = new Map(localEntries.map((e) => [e.id, e]));

              if (migratedForUserRef.current !== userId) {
                migratedForUserRef.current = userId;
                if (serverEntries.length === 0 && localEntries.length > 0) {
                  // First sign-in migration: push all local entries to server
                  // sequentially to avoid concurrent AsyncStorage ID rewrites.
                  // We build the final array with server UUIDs, then persist once.
                  const migrated: JournalEntry[] = [];
                  let anyMigrateFailed = false;
                  for (const e of localEntries) {
                    try {
                      const synced = await apiUpsertJournalEntry(e, getToken);
                      migrated.push({ ...synced, media: e.media });
                    } catch {
                      migrated.push(e);
                      anyMigrateFailed = true;
                    }
                  }
                  // Single write: overwrites AsyncStorage with correct server IDs.
                  await cacheEntries(migrated);
                  await setJournalCacheOwner(userId);
                  setEntries(migrated);
                  if (anyMigrateFailed) {
                    setSyncFailed(true);
                    markPendingSync("journal").catch(() => {});
                  } else {
                    setSyncFailed(false);
                    clearPendingSync("journal").catch(() => {});
                  }
                  return;
                }
              }

              // Build the merged list: server entries (with local media re-attached)
              // plus any local-only entries not yet on the server. Local-only entries
              // have non-UUID IDs (created offline or whose prior sync failed).
              const serverIds = new Set(serverEntries.map((se) => se.id));
              const localOnlyEntries = localEntries.filter(
                (e) => !serverIds.has(e.id),
              );

              // Best-effort: push local-only entries to server sequentially.
              // Sequential avoids concurrent read-modify-write races on AsyncStorage.
              // We collect results and write once at the end via cacheEntries.
              const syncedLocalEntries: JournalEntry[] = [];
              let anySyncFailed = false;
              for (const e of localOnlyEntries) {
                try {
                  const synced = await apiUpsertJournalEntry(e, getToken);
                  syncedLocalEntries.push({ ...synced, media: e.media });
                } catch {
                  syncedLocalEntries.push(e);
                  anySyncFailed = true;
                }
              }

              const merged = [
                ...serverEntries.map((se) => ({
                  ...se,
                  media: localById.get(se.id)?.media ?? [],
                })),
                ...syncedLocalEntries,
              ].sort(
                (a, b) =>
                  new Date(b.createdAt).getTime() -
                  new Date(a.createdAt).getTime(),
              );
              // Single write: overwrites AsyncStorage with the authoritative merged
              // list (correct server UUIDs). No separate replaceEntryId calls needed.
              await cacheEntries(merged);
              await setJournalCacheOwner(userId);
              setEntries(merged);

              // Clear the pending marker whenever all local-only entries have been
              // pushed successfully (including those marked by journal-entry.tsx).
              // Keep it only when we know at least one entry is still unsynced.
              if (anySyncFailed) {
                setSyncFailed(true);
                markPendingSync("journal").catch(() => {});
              } else {
                setSyncFailed(false);
                clearPendingSync("journal").catch(() => {});
              }
            })
            .catch(async () => {
              const local = await loadEntries();
              setEntries(local);
              // Can't reach the server — show banner if a prior write failed.
              const pending = await hasPendingSync("journal");
              setSyncFailed(pending);
            })
            .finally(() => releaseSyncLock("journal"));
        } else {
          loadEntries().then(setEntries);
        }
      };

      syncNowRef.current = syncNow;
      syncNow();
    }, [isSignedIn, getToken, user]),
  );

  const bumpMedia = entries.flatMap((e) =>
    e.media
      .filter((m) => m.category === "bump")
      .map((m) => ({ media: m, entry: e })),
  );

  const ultrasoundMedia = entries.flatMap((e) =>
    e.media
      .filter((m) => m.category === "ultrasound")
      .map((m) => ({ media: m, entry: e })),
  );

  const ACCENT = colors.primary ?? "#e86cad";
  const TABS: {
    key: Tab;
    label: string;
    icon: keyof typeof Ionicons.glyphMap;
  }[] = [
    { key: "journal", label: "Journal", icon: "book-outline" },
    { key: "bump", label: "Baby Bump", icon: "camera-outline" },
    { key: "ultrasound", label: "Ultrasound", icon: "scan-outline" },
  ];

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <SyncBanner visible={syncFailed} />
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 12,
            borderBottomColor: colors.border,
            backgroundColor: colors.background,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color={colors.foreground} />
          <Text style={[styles.backText, { color: colors.foreground }]}>
            Tools
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.newBtn, { backgroundColor: ACCENT }]}
          onPress={() => {
            if (!hasPass && entries.length >= FREE_JOURNAL_ENTRY_LIMIT) {
              setShowGate(true);
              return;
            }
            router.push("/journal-entry");
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.newBtnText}>New Entry</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 32 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(350)}>
          <Text style={[styles.pageTitle, { color: colors.foreground }]}>
            My Pregnancy Journal
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Your personal record of this journey — from first heartbeat to first
            steps.
          </Text>
          {entries.length > 0 && (
            <TouchableOpacity
              style={[
                styles.exportBtn,
                {
                  backgroundColor: (ACCENT ?? "#e86cad") + "14",
                  borderColor: (ACCENT ?? "#e86cad") + "40",
                },
              ]}
              onPress={handleExportPdf}
              disabled={exporting}
              activeOpacity={0.75}
            >
              {exporting ? (
                <ActivityIndicator size="small" color={ACCENT} />
              ) : (
                <Ionicons
                  name="document-text-outline"
                  size={16}
                  color={ACCENT}
                />
              )}
              <Text style={[styles.exportBtnText, { color: ACCENT }]}>
                {exporting ? "Building PDF…" : "Export Journal as PDF"}
              </Text>
            </TouchableOpacity>
          )}
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(60).duration(350)}
          style={styles.tabRow}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                style={[
                  styles.tabPill,
                  {
                    backgroundColor: active
                      ? ACCENT
                      : (colors.muted ?? "#f5f5f5"),
                    borderColor: active ? ACCENT : colors.border,
                  },
                ]}
                onPress={() => setActiveTab(tab.key)}
                activeOpacity={0.8}
              >
                <Ionicons
                  name={tab.icon}
                  size={13}
                  color={active ? "#fff" : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.tabPillText,
                    { color: active ? "#fff" : colors.mutedForeground },
                  ]}
                >
                  {tab.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(350)}>
          {activeTab === "journal" && (
            <>
              {entries.length === 0 ? (
                <View style={styles.emptyState}>
                  <Ionicons
                    name="book-outline"
                    size={48}
                    color={colors.mutedForeground}
                  />
                  <Text
                    style={[styles.emptyTitle, { color: colors.foreground }]}
                  >
                    Your journal is empty
                  </Text>
                  <Text
                    style={[
                      styles.emptyText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Tap "New Entry" to capture your first moment.
                  </Text>
                </View>
              ) : (
                entries.map((entry) => (
                  <EntryCard
                    key={entry.id}
                    entry={entry}
                    colors={colors}
                    onPress={() =>
                      router.push({
                        pathname: "/journal-entry",
                        params: { entryId: entry.id },
                      })
                    }
                  />
                ))
              )}
            </>
          )}

          {activeTab === "bump" && (
            <>
              <Text
                style={[
                  styles.gridSectionHint,
                  { color: colors.mutedForeground },
                ]}
              >
                Watch your bump grow — add bump photos to any journal entry.
              </Text>
              <PhotoGrid
                items={bumpMedia}
                onPress={(entry) =>
                  router.push({
                    pathname: "/journal-entry",
                    params: { entryId: entry.id },
                  })
                }
                emptyIcon="camera-outline"
                emptyText={
                  "No bump photos yet.\nAdd them when creating a journal entry."
                }
                colors={colors}
              />
            </>
          )}

          {activeTab === "ultrasound" && (
            <>
              <Text
                style={[
                  styles.gridSectionHint,
                  { color: colors.mutedForeground },
                ]}
              >
                Save your ultrasound images here for safekeeping.
              </Text>
              <PhotoGrid
                items={ultrasoundMedia}
                onPress={(entry) =>
                  router.push({
                    pathname: "/journal-entry",
                    params: { entryId: entry.id },
                  })
                }
                emptyIcon="scan-outline"
                emptyText={
                  "No ultrasound images yet.\nAdd them when creating a journal entry."
                }
                colors={colors}
              />
            </>
          )}
        </Animated.View>
      </ScrollView>

      <PassGate
        visible={showGate}
        onClose={() => setShowGate(false)}
        title="Journal Full"
        description="You've used your 5 free journal entries. Upgrade to the Full Pregnancy Pass to write unlimited entries throughout your pregnancy."
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  backText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  newBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  scroll: {
    paddingHorizontal: GRID_PADDING,
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
    lineHeight: 21,
    marginBottom: 20,
  },
  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 20,
  },
  tabPill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 20,
    borderWidth: 1,
  },
  tabPillText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  entryCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  entryCardContent: {
    flexDirection: "row",
    gap: 12,
  },
  entryMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 4,
  },
  entryDate: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
  },
  moodEmoji: {
    fontSize: 14,
  },
  agePill: {
    alignSelf: "flex-start",
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 8,
  },
  agePillText: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  entryPreview: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  mediaCountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
  },
  mediaCountText: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
  },
  entryThumb: {
    width: 72,
    height: 72,
    borderRadius: 10,
  },
  gridSectionHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
    marginBottom: 16,
  },
  gridContainer: {
    gap: GRID_GAP,
  },
  gridRow: {
    flexDirection: "row",
    gap: GRID_GAP,
  },
  gridCell: {
    width: GRID_CELL,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
  },
  gridImage: {
    width: GRID_CELL,
    height: GRID_CELL,
  },
  gridLabel: {
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  gridLabelText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 21,
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    alignSelf: "flex-start",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginTop: 12,
    marginBottom: 4,
  },
  exportBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
});
