import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import {
  Keyboard,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type TextInputInstance,
} from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";
import { VIDEO_VAULT_TOPICS } from "@/lib/video-vault";
import {
  SUPPORT_PERSON_VOLUMES,
  SUPPORT_PERSON_ROUTE_MAP,
  type SupportPersonVolumeNumber,
} from "@/lib/support-person-survival";
import { HEALTHY_PREGNANCY_TOPICS } from "@/lib/healthy-pregnancy-topics";
import {
  LEARN_TAB_SECTION_IDS,
  type LearnTabSectionId,
} from "@workspace/learn-content-ids";

const ACOG_URL = "https://www.acog.org/womens-health/resources-for-you";

interface SearchResult {
  section: LearnTabSectionId;
  label: string;
  sublabel: string;
  icon: string;
  color: string;
  route: string;
}

function buildSearchIndex(): SearchResult[] {
  const results: SearchResult[] = [];

  for (const topic of VIDEO_VAULT_TOPICS) {
    results.push({
      section: "videovault",
      label: topic.title,
      sublabel: `${topic.videos.length} video${topic.videos.length !== 1 ? "s" : ""}`,
      icon: topic.icon,
      color: "#8b5cf6",
      route: `/video-vault?topic=${topic.id}`,
    });
  }

  const VOL_ICONS: Record<SupportPersonVolumeNumber, string> = {
    1: "📖",
    2: "📋",
    3: "🎉",
  };
  for (const vol of SUPPORT_PERSON_VOLUMES) {
    results.push({
      section: "supportperson",
      label: vol.handoutTitle,
      sublabel: vol.pageSubtitle,
      icon: VOL_ICONS[vol.volumeNumber],
      color: "#7c3aed",
      route: SUPPORT_PERSON_ROUTE_MAP[vol.volumeNumber],
    });
  }

  for (const topic of HEALTHY_PREGNANCY_TOPICS) {
    results.push({
      section: "healthypregnancy",
      label: topic.title,
      sublabel: topic.description,
      icon: "💊",
      color: "#f43f5e",
      route: topic.route,
    });
  }

  return results;
}

function matchesQuery(result: SearchResult, q: string): boolean {
  if (
    result.label.toLowerCase().includes(q) ||
    result.sublabel.toLowerCase().includes(q)
  ) {
    return true;
  }

  if (result.section === "videovault") {
    const topic = VIDEO_VAULT_TOPICS.find((t) => t.title === result.label);
    if (
      topic?.videos.some(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.source.toLowerCase().includes(q),
      )
    ) {
      return true;
    }
  }

  if (result.section === "supportperson") {
    const vol = SUPPORT_PERSON_VOLUMES.find(
      (v) => v.handoutTitle === result.label,
    );
    if (
      vol?.highlights.some((h) => h.toLowerCase().includes(q)) ||
      vol?.summary.toLowerCase().includes(q) ||
      vol?.seriesLabel.toLowerCase().includes(q)
    ) {
      return true;
    }
  }

  return false;
}

const SECTION_META: Record<LearnTabSectionId, { label: string }> = {
  videovault: { label: "Video Vault" },
  supportperson: { label: "Support Person Series" },
  healthypregnancy: { label: "Healthy Pregnancy" },
};

// Compile-time exhaustiveness guard: breaks the build if any LearnTabSectionId
// is not represented in SECTION_META. Record<LearnTabSectionId, ...> above
// already enforces this, but the Exclude check below makes the contract
// explicit and mirrors the pattern used in video-vault.ts and
// healthy-pregnancy-topics.ts so that a rename in learn-content-ids fails here
// too.
type _LearnTabSectionMissing = Exclude<
  LearnTabSectionId,
  keyof typeof SECTION_META
>;
type _AssertNoMissingLearnTabSections = _LearnTabSectionMissing extends never
  ? true
  : never;
const _learnTabSectionExhaustive: _AssertNoMissingLearnTabSections = true;
void _learnTabSectionExhaustive;

// ALL_RESULTS is intentionally built once at module load time.
//
// This is safe as long as the three source arrays —
//   VIDEO_VAULT_TOPICS, SUPPORT_PERSON_VOLUMES, HEALTHY_PREGNANCY_TOPICS —
// remain compile-time constants (plain TypeScript arrays imported at the top of
// this file).  The test file learnDeepLinks.test.ts section "Static search
// index architectural guard" explicitly verifies that a freshly-built index
// produces the same entries as the source arrays, which would fail at CI time if
// the sources were ever made dynamic or lazy-loaded without updating this site.
//
// If content ever becomes dynamic (e.g. fetched from an API), replace this
// module-level constant with a `useMemo(() => buildSearchIndex(), [data])`
// inside the LearnScreen component, and update the test accordingly.
const ALL_RESULTS = buildSearchIndex();

function ResourceCard({
  icon,
  title,
  description,
  onPress,
  delay,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  onPress: () => void;
  delay: number;
}) {
  const colors = useColors();

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(400)}>
      <TouchableOpacity
        style={[
          styles.card,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
        onPress={onPress}
        activeOpacity={0.8}
      >
        <View
          style={[styles.cardIcon, { backgroundColor: colors.primary + "18" }]}
        >
          <Ionicons name={icon} size={20} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardTitle, { color: colors.foreground }]}>
            {title}
          </Text>
          <Text style={[styles.cardDesc, { color: colors.mutedForeground }]}>
            {description}
          </Text>
        </View>
        <Ionicons
          name="chevron-forward"
          size={18}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function LearnScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");
  const inputRef = useRef<TextInputInstance>(null);

  const trimmed = query.trim().toLowerCase();

  const searchResults = useMemo(() => {
    if (!trimmed) return null;
    return ALL_RESULTS.filter((r) => matchesQuery(r, trimmed));
  }, [trimmed]);

  const grouped = useMemo(() => {
    if (!searchResults) return null;
    return LEARN_TAB_SECTION_IDS.map((section) => ({
      section,
      items: searchResults.filter((r) => r.section === section),
    })).filter((g) => g.items.length > 0);
  }, [searchResults]);

  function handleResultPress(route: string) {
    Keyboard.dismiss();
    setQuery("");
    // Append a unique nonce to every /video-vault?topic=… route so the
    // deepLinkVersion counter in VideoVaultScreen always increments — even when
    // the user taps the same search result twice in a row without navigating
    // elsewhere first.  Without the nonce the URL param value never changes,
    // the useEffect dependency does not re-fire, and a manually-closed card
    // stays closed.
    const finalRoute = route.startsWith("/video-vault?topic=")
      ? `${route}&t=${Date.now()}`
      : route;
    router.push(finalRoute as Parameters<typeof router.push>[0]);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ResponsiveContainer>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeInDown.duration(400)}>
            <Text style={[styles.pageTitle, { color: colors.foreground }]}>
              Learn
            </Text>
            <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
              Educational resources to help you understand your pregnancy
              journey.
            </Text>
          </Animated.View>

          <Animated.View
            entering={FadeInDown.delay(40).duration(400)}
            style={[
              styles.searchContainer,
              {
                backgroundColor: colors.card,
                borderColor: colors.border,
              },
            ]}
          >
            <Ionicons
              name="search-outline"
              size={17}
              color={colors.mutedForeground}
              style={styles.searchIcon}
            />
            <TextInput
              ref={inputRef}
              style={[styles.searchInput, { color: colors.foreground }]}
              placeholder="Search videos, articles, guides…"
              placeholderTextColor={colors.mutedForeground}
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              clearButtonMode="never"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {query.length > 0 && (
              <TouchableOpacity
                onPress={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Ionicons
                  name="close-circle"
                  size={17}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            )}
          </Animated.View>

          {trimmed ? (
            <>
              {searchResults!.length === 0 ? (
                <Animated.View
                  entering={FadeInDown.duration(300)}
                  style={styles.emptyState}
                >
                  <Text style={styles.emptyEmoji}>🔍</Text>
                  <Text
                    style={[styles.emptyTitle, { color: colors.foreground }]}
                  >
                    No results found
                  </Text>
                  <Text
                    style={[
                      styles.emptySubtitle,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Try a different keyword — e.g. "nutrition", "warning signs",
                    or "labor".
                  </Text>
                </Animated.View>
              ) : (
                <Animated.View entering={FadeInDown.duration(300)}>
                  <Text
                    style={[
                      styles.resultCount,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    {searchResults!.length} result
                    {searchResults!.length !== 1 ? "s" : ""} for "
                    <Text style={{ color: colors.foreground }}>
                      {query.trim()}
                    </Text>
                    "
                  </Text>
                  {grouped!.map(({ section, items }) => (
                    <View key={section} style={styles.resultGroup}>
                      <Text
                        style={[
                          styles.groupLabel,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {SECTION_META[section].label.toUpperCase()}
                      </Text>
                      {items.map((item) => (
                        <TouchableOpacity
                          key={`${item.section}-${item.label}`}
                          style={[
                            styles.resultCard,
                            {
                              backgroundColor: colors.card,
                              borderColor: colors.border,
                            },
                          ]}
                          onPress={() => handleResultPress(item.route)}
                          activeOpacity={0.8}
                        >
                          <View
                            style={[
                              styles.resultIcon,
                              { backgroundColor: item.color + "18" },
                            ]}
                          >
                            <Text style={styles.resultEmoji}>{item.icon}</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[
                                styles.resultLabel,
                                { color: colors.foreground },
                              ]}
                            >
                              {item.label}
                            </Text>
                            <Text
                              style={[
                                styles.resultSublabel,
                                { color: colors.mutedForeground },
                              ]}
                              numberOfLines={1}
                            >
                              {item.sublabel}
                            </Text>
                          </View>
                          <Ionicons
                            name="chevron-forward"
                            size={16}
                            color={colors.mutedForeground}
                          />
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </Animated.View>
              )}
            </>
          ) : (
            <>
              <ResourceCard
                icon="leaf-outline"
                title="Fetal & Maternal Development"
                description="Explore week-by-week changes for your baby and your body, from conception to birth."
                onPress={() => router.push("/development")}
                delay={80}
              />

              <ResourceCard
                icon="heart-circle-outline"
                title="Healthy Pregnancy"
                description="Travel, work, nutrition, intimacy, medications, and exercise — evidence-based guidance for everyday pregnancy questions."
                onPress={() => router.push("/healthy-pregnancy")}
                delay={140}
              />

              <ResourceCard
                icon="play-circle-outline"
                title="Video Vault"
                description="100+ trusted videos from ACOG, CDC, AAP, NICHD, and more — organized by topic, from fetal development to newborn safe sleep."
                onPress={() => router.push("/video-vault")}
                delay={200}
              />

              <Animated.View
                entering={FadeInDown.delay(260).duration(400)}
                style={[
                  styles.card,
                  styles.externalCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View
                  style={[
                    styles.cardIcon,
                    { backgroundColor: colors.primary + "18" },
                  ]}
                >
                  <Ionicons
                    name="medkit-outline"
                    size={20}
                    color={colors.primary}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                  >
                    ACOG Women&apos;s Health Resources
                  </Text>
                  <Text
                    style={[
                      styles.cardDesc,
                      { color: colors.mutedForeground, marginBottom: 10 },
                    ]}
                  >
                    The American College of Obstetricians and Gynecologists
                    (ACOG) is the leading professional organization for OB-GYNs
                    in the United States. Their women&apos;s health resource hub
                    offers free, evidence-based guides on pregnancy, labor and
                    delivery, postpartum care, and general women&apos;s health
                    topics — written and reviewed by practicing physicians.
                  </Text>
                  <TouchableOpacity
                    style={[styles.linkBtn, { borderColor: colors.primary }]}
                    onPress={() => Linking.openURL(ACOG_URL)}
                    activeOpacity={0.8}
                  >
                    <Ionicons
                      name="open-outline"
                      size={16}
                      color={colors.primary}
                    />
                    <Text
                      style={[styles.linkBtnText, { color: colors.primary }]}
                    >
                      Visit acog.org
                    </Text>
                  </TouchableOpacity>
                </View>
              </Animated.View>

              <Animated.View entering={FadeInDown.delay(320).duration(400)}>
                <Text
                  style={[styles.footerNote, { color: colors.mutedForeground }]}
                >
                  More educational links and resources are on the way.
                </Text>
              </Animated.View>
            </>
          )}
        </ScrollView>
      </ResponsiveContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: 16,
  },
  pageTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    marginBottom: 4,
  },
  pageSub: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 20,
  },
  searchIcon: {
    flexShrink: 0,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
    padding: 0,
    margin: 0,
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 48,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 32,
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  emptySubtitle: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 19,
    maxWidth: 260,
  },
  resultCount: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 16,
  },
  resultGroup: {
    marginBottom: 20,
  },
  groupLabel: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  resultCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
  },
  resultIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  resultEmoji: {
    fontSize: 18,
  },
  resultLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  resultSublabel: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 18,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
  },
  externalCard: {
    alignItems: "flex-start",
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 2,
  },
  cardDesc: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  linkBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  linkBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  footerNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginTop: 4,
    marginBottom: 8,
  },
});
