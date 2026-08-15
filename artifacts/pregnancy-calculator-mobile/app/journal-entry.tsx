import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetProfileQueryKey,
  useGetProfile,
} from "@workspace/api-client-react";
import { useAuth } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";
import { MediaViewerModal } from "@/components/MediaViewerModal";
import { usePass } from "@/hooks/usePass";
import { PassGate } from "@/components/PassGate";
import { FREE_PHOTO_LIMIT } from "@/constants/free-limits";
import { getGestationalAgeAtDate } from "@/lib/pregnancy-math";
import {
  copyMediaToDocuments,
  deleteEntry,
  getJournalPrompts,
  JournalKeyWriteError,
  loadEntries,
  MEDIA_CATEGORY_LABELS,
  MediaIndexWriteError,
  MOOD_OPTIONS,
  replaceEntryId,
  upsertEntry,
  type JournalEntry,
  type JournalMedia,
  type JournalMediaCategory,
  type JournalMood,
} from "@/lib/journal";
import { apiUpsertJournalEntry, apiDeleteJournalEntry } from "@/lib/sync-api";
import { markPendingSync } from "@/lib/sync-queue";

const SCREEN_WIDTH = Dimensions.get("window").width;
const MEDIA_CELL = (SCREEN_WIDTH - 32 - 8) / 3;

function uuid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function formatHeaderDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export default function JournalEntryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { entryId } = useLocalSearchParams<{ entryId?: string }>();
  const isNew = !entryId;

  const { isSignedIn, getToken } = useAuth();
  const { data: profile } = useGetProfile({
    query: {
      enabled: !!isSignedIn,
      queryKey: getGetProfileQueryKey(),
    },
  });

  const [entry, setEntry] = useState<JournalEntry>(() => ({
    id: uuid(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    text: "",
    media: [],
  }));

  const [showPrompts, setShowPrompts] = useState(isNew);
  const [saving, setSaving] = useState(false);
  const [showPhotoGate, setShowPhotoGate] = useState(false);
  const [viewerMedia, setViewerMedia] = useState<JournalMedia | null>(null);
  const { hasPass } = usePass();
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    if (entryId) {
      loadEntries().then((all) => {
        const found = all.find((e) => e.id === entryId);
        if (found) setEntry(found);
      });
    }
  }, [entryId]);

  const prompts = getJournalPrompts({
    gestationalWeeks: entry.gestationalWeeks,
    postpartumDays: entry.postpartumDays,
  });

  function computeAge(): Pick<
    JournalEntry,
    "gestationalWeeks" | "gestationalDays" | "postpartumDays"
  > {
    if (!profile?.dueDate) return {};
    const due = new Date(profile.dueDate);
    const today = new Date();
    if (today > due) {
      const msPerDay = 1000 * 60 * 60 * 24;
      const postpartumDays = Math.floor(
        (today.getTime() - due.getTime()) / msPerDay,
      );
      return { postpartumDays };
    }
    const { weeks, days } = getGestationalAgeAtDate(due, today);
    return { gestationalWeeks: weeks, gestationalDays: days };
  }

  async function handleSave() {
    if (!entry.text.trim() && entry.media.length === 0) {
      Alert.alert(
        "Empty entry",
        "Please write something or add a photo before saving.",
      );
      return;
    }
    setSaving(true);
    try {
      const ageFields = isNew ? computeAge() : {};
      const toSave: JournalEntry = {
        ...entry,
        ...ageFields,
        updatedAt: new Date().toISOString(),
      };
      await upsertEntry(toSave);
      if (isSignedIn) {
        try {
          const synced = await apiUpsertJournalEntry(toSave, getToken);
          if (synced.id !== toSave.id) {
            await replaceEntryId(toSave.id, synced.id);
          }
        } catch {
          await markPendingSync("journal");
          Alert.alert(
            "Saved locally",
            "No connection — your entry is saved on this device and will sync automatically when you're back online.",
          );
        }
      }
      router.back();
    } catch (err) {
      if (err instanceof JournalKeyWriteError) {
        Alert.alert(
          "Could not save entry",
          "Could not save: your device storage may be full. Free up some space and try again — your draft is still here.",
        );
      } else if (err instanceof MediaIndexWriteError) {
        Alert.alert(
          "Could not save entry",
          "Could not save: your device storage may be full. Free up some space and try again — your draft is still here.",
        );
      } else {
        Alert.alert("Couldn't save", "Something went wrong. Please try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    Alert.alert(
      "Delete entry",
      "This will permanently delete this entry and any attached photos.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (isSignedIn) {
              apiDeleteJournalEntry(entry.id, getToken).catch(() => {});
            }
            await deleteEntry(entry.id);
            router.back();
          },
        },
      ],
    );
  }

  async function handlePickMedia() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission needed",
        "Please allow access to your photo library in Settings.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsEditing: false,
      quality: 0.85,
    });

    if (result.canceled || !result.assets[0]) return;

    const asset = result.assets[0];
    const isVideo = asset.type === "video";

    Alert.alert("Save photo as…", "Choose a category for this media:", [
      {
        text: MEDIA_CATEGORY_LABELS.bump,
        onPress: () => addMedia(asset.uri, isVideo ? "video" : "photo", "bump"),
      },
      {
        text: MEDIA_CATEGORY_LABELS.ultrasound,
        onPress: () =>
          addMedia(asset.uri, isVideo ? "video" : "photo", "ultrasound"),
      },
      {
        text: MEDIA_CATEGORY_LABELS.general,
        onPress: () =>
          addMedia(asset.uri, isVideo ? "video" : "photo", "general"),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }

  async function addMedia(
    uri: string,
    type: "photo" | "video",
    category: JournalMediaCategory,
  ) {
    if (!hasPass && (category === "bump" || category === "ultrasound")) {
      const saved = await loadEntries();
      const savedCount = saved.reduce(
        (n, e) =>
          n +
          e.media.filter(
            (m) => m.category === "bump" || m.category === "ultrasound",
          ).length,
        0,
      );
      const currentCount = entry.media.filter(
        (m) => m.category === "bump" || m.category === "ultrasound",
      ).length;
      if (savedCount + currentCount >= FREE_PHOTO_LIMIT) {
        setShowPhotoGate(true);
        return;
      }
    }
    try {
      const id = uuid();
      const localUri = await copyMediaToDocuments(uri, id, type);
      const newMedia: JournalMedia = { id, uri: localUri, type, category };
      setEntry((prev) => ({
        ...prev,
        media: [...prev.media, newMedia],
      }));
    } catch {
      Alert.alert(
        "Couldn't add photo",
        "There was a problem saving this media. Please try again.",
      );
    }
  }

  function removeMedia(id: string) {
    Alert.alert("Remove photo", "Remove this photo from the entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () =>
          setEntry((prev) => ({
            ...prev,
            media: prev.media.filter((m) => m.id !== id),
          })),
      },
    ]);
  }

  function insertPrompt(text: string) {
    setEntry((prev) => ({
      ...prev,
      text: prev.text ? prev.text.trimEnd() + "\n\n" + text : text,
    }));
    setShowPrompts(false);
  }

  const ACCENT = colors.primary ?? "#e86cad";

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={0}
    >
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
            Journal
          </Text>
        </TouchableOpacity>
        <Text
          style={[styles.headerDate, { color: colors.mutedForeground }]}
          numberOfLines={1}
        >
          {formatHeaderDate(entry.createdAt)}
        </Text>
        <TouchableOpacity
          style={[
            styles.saveBtn,
            { backgroundColor: saving ? colors.muted : ACCENT },
          ]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save"}</Text>
        </TouchableOpacity>
      </View>

      <ResponsiveContainer>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + 48 },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {showPrompts && prompts.length > 0 && (
            <Animated.View entering={FadeInDown.duration(300)}>
              <View
                style={[
                  styles.promptsCard,
                  {
                    backgroundColor: ACCENT + "12",
                    borderColor: ACCENT + "30",
                  },
                ]}
              >
                <View style={styles.promptsHeader}>
                  <Ionicons name="sparkles" size={15} color={ACCENT} />
                  <Text style={[styles.promptsTitle, { color: ACCENT }]}>
                    Writing prompts for you
                  </Text>
                  <TouchableOpacity onPress={() => setShowPrompts(false)}>
                    <Ionicons
                      name="close-circle"
                      size={18}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>
                </View>
                {prompts.map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.promptRow,
                      i < prompts.length - 1 && {
                        borderBottomColor: ACCENT + "20",
                        borderBottomWidth: 1,
                      },
                    ]}
                    onPress={() => insertPrompt(p)}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[styles.promptText, { color: colors.foreground }]}
                    >
                      {p}
                    </Text>
                    <Ionicons
                      name="arrow-down-circle-outline"
                      size={16}
                      color={ACCENT}
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </Animated.View>
          )}

          {!showPrompts && (
            <TouchableOpacity
              style={styles.promptsToggle}
              onPress={() => setShowPrompts(true)}
            >
              <Ionicons name="sparkles" size={13} color={ACCENT} />
              <Text style={[styles.promptsToggleText, { color: ACCENT }]}>
                Show writing prompts
              </Text>
            </TouchableOpacity>
          )}

          <TextInput
            style={[
              styles.textInput,
              { color: colors.foreground, borderColor: colors.border },
            ]}
            placeholder="What's on your mind today? How are you feeling? What do you want to remember?"
            placeholderTextColor={colors.mutedForeground}
            value={entry.text}
            onChangeText={(t) => setEntry((prev) => ({ ...prev, text: t }))}
            multiline
            textAlignVertical="top"
            scrollEnabled={false}
            autoCorrect
            autoCapitalize="sentences"
          />

          <View style={styles.section}>
            <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
              Mood
            </Text>
            <View style={styles.moodRow}>
              {MOOD_OPTIONS.map((m) => {
                const active = entry.mood === m.value;
                return (
                  <TouchableOpacity
                    key={m.value}
                    style={[
                      styles.moodChip,
                      {
                        backgroundColor: active
                          ? ACCENT + "18"
                          : (colors.muted ?? "#f5f5f5"),
                        borderColor: active ? ACCENT : colors.border,
                      },
                    ]}
                    onPress={() =>
                      setEntry((prev) => ({
                        ...prev,
                        mood:
                          prev.mood === m.value
                            ? undefined
                            : (m.value as JournalMood),
                      }))
                    }
                    activeOpacity={0.8}
                  >
                    <Text style={styles.moodEmoji}>{m.emoji}</Text>
                    <Text
                      style={[
                        styles.moodLabel,
                        { color: active ? ACCENT : colors.mutedForeground },
                      ]}
                    >
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.section}>
            <View style={styles.sectionRow}>
              <Text style={[styles.sectionLabel, { color: colors.foreground }]}>
                Photos & Videos
              </Text>
              <TouchableOpacity
                style={[styles.addMediaBtn, { borderColor: ACCENT }]}
                onPress={handlePickMedia}
                activeOpacity={0.8}
              >
                <Ionicons name="add" size={16} color={ACCENT} />
                <Text style={[styles.addMediaText, { color: ACCENT }]}>
                  Add
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={[styles.mediaHint, { color: colors.mutedForeground }]}>
              You'll be asked whether each photo is a bump photo, ultrasound, or
              general journal photo.
            </Text>

            {entry.media.length > 0 && (
              <View style={styles.mediaGrid}>
                {entry.media.map((m) => (
                  <View key={m.id} style={styles.mediaItem}>
                    <TouchableOpacity
                      onPress={() => setViewerMedia(m)}
                      activeOpacity={0.85}
                      style={StyleSheet.absoluteFill}
                    >
                      {m.type === "photo" ? (
                        <Image
                          source={{ uri: m.uri }}
                          style={styles.mediaThumb}
                          contentFit="cover"
                        />
                      ) : (
                        <View
                          style={[
                            styles.mediaThumb,
                            {
                              backgroundColor: colors.muted,
                              alignItems: "center",
                              justifyContent: "center",
                            },
                          ]}
                        >
                          <Ionicons
                            name="play-circle"
                            size={32}
                            color={ACCENT}
                          />
                        </View>
                      )}
                    </TouchableOpacity>
                    <View
                      style={[
                        styles.mediaCategoryBadge,
                        { backgroundColor: ACCENT + "dd" },
                      ]}
                    >
                      <Text style={styles.mediaCategoryText}>
                        {m.category === "bump"
                          ? "Bump"
                          : m.category === "ultrasound"
                            ? "US"
                            : ""}
                      </Text>
                    </View>
                    <TouchableOpacity
                      style={styles.mediaRemoveBtn}
                      onPress={() => removeMedia(m.id)}
                      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                    >
                      <Ionicons name="close-circle" size={20} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </View>

          {!isNew && (
            <TouchableOpacity
              style={[
                styles.deleteBtn,
                { borderColor: colors.destructive ?? "#e53e3e" },
              ]}
              onPress={handleDelete}
              activeOpacity={0.8}
            >
              <Ionicons
                name="trash-outline"
                size={16}
                color={colors.destructive ?? "#e53e3e"}
              />
              <Text
                style={[
                  styles.deleteBtnText,
                  { color: colors.destructive ?? "#e53e3e" },
                ]}
              >
                Delete Entry
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </ResponsiveContainer>

      <PassGate
        visible={showPhotoGate}
        onClose={() => setShowPhotoGate(false)}
        title="Photo Limit Reached"
        description="Free accounts can store up to 3 bump and ultrasound photos. Upgrade to the Full Pregnancy Pass to save unlimited photos throughout your journey."
      />

      <MediaViewerModal
        visible={viewerMedia !== null}
        media={viewerMedia}
        onClose={() => setViewerMedia(null)}
      />
    </KeyboardAvoidingView>
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
    minWidth: 80,
  },
  backText: {
    fontSize: 16,
    fontFamily: "Inter_500Medium",
  },
  headerDate: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    flex: 1,
    textAlign: "center",
  },
  saveBtn: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 8,
    minWidth: 80,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 4,
  },
  promptsCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  promptsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  promptsTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  promptRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    gap: 10,
  },
  promptText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
  },
  promptsToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginBottom: 12,
    alignSelf: "flex-start",
  },
  promptsToggleText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  textInput: {
    minHeight: 180,
    fontSize: 16,
    fontFamily: "Inter_400Regular",
    lineHeight: 26,
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    marginBottom: 20,
  },
  section: {
    marginBottom: 24,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  sectionLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 10,
  },
  moodRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  moodChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  moodEmoji: {
    fontSize: 16,
  },
  moodLabel: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  addMediaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  addMediaText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  mediaHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
    marginBottom: 14,
  },
  mediaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  mediaItem: {
    position: "relative",
    width: MEDIA_CELL,
    height: MEDIA_CELL,
    borderRadius: 10,
    overflow: "hidden",
  },
  mediaThumb: {
    width: MEDIA_CELL,
    height: MEDIA_CELL,
  },
  mediaCategoryBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  mediaCategoryText: {
    color: "#fff",
    fontSize: 10,
    fontFamily: "Inter_600SemiBold",
  },
  mediaRemoveBtn: {
    position: "absolute",
    top: 4,
    right: 4,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  deleteBtnText: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
});
