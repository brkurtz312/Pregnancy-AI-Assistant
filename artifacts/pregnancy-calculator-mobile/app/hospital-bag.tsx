import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
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
import { useAuth, useUser } from "@clerk/expo";
import { useColors } from "@/hooks/useColors";
import { AskCard } from "@/components/AskCard";
import {
  buildHospitalBagHtml,
  countChecked,
  loadHospitalBagChecklist,
  saveHospitalBagChecklist,
  type HospitalBagCategory,
} from "@/lib/hospital-bag";
import { apiLoadHospitalBag, apiSaveHospitalBag } from "@/lib/sync-api";

export default function HospitalBagScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const backLabel = params.from || "Labor and Delivery";

  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const [categories, setCategories] = useState<HospitalBagCategory[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [newItemText, setNewItemText] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const migratedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (isSignedIn && userId) {
      apiLoadHospitalBag(getToken)
        .then((serverCategories) => {
          if (migratedForUserRef.current !== userId) {
            migratedForUserRef.current = userId;
            if (serverCategories === null) {
              loadHospitalBagChecklist().then((local) => {
                apiSaveHospitalBag(local, getToken).catch(() => {});
                setCategories(local);
              });
            } else {
              setCategories(serverCategories);
            }
          } else {
            loadHospitalBagChecklist().then((defaultLocal) => {
              setCategories(serverCategories ?? defaultLocal);
            });
          }
        })
        .catch(() => {
          loadHospitalBagChecklist().then(setCategories);
        })
        .finally(() => setLoaded(true));
    } else {
      loadHospitalBagChecklist()
        .then(setCategories)
        .finally(() => setLoaded(true));
    }
  }, [isSignedIn, getToken, user]);

  const persist = useCallback(
    (next: HospitalBagCategory[]) => {
      setCategories(next);
      if (isSignedIn) {
        apiSaveHospitalBag(next, getToken).catch(() => {
          saveHospitalBagChecklist(next);
        });
      } else {
        saveHospitalBagChecklist(next);
      }
    },
    [isSignedIn, getToken],
  );

  const toggleItem = useCallback(
    (categoryId: string, itemId: string) => {
      persist(
        categories.map((c) =>
          c.id !== categoryId
            ? c
            : {
                ...c,
                items: c.items.map((i) =>
                  i.id === itemId ? { ...i, checked: !i.checked } : i,
                ),
              },
        ),
      );
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [categories, persist],
  );

  const handleAddItem = useCallback(
    (categoryId: string) => {
      const text = (newItemText[categoryId] ?? "").trim();
      if (!text) return;
      persist(
        categories.map((c) =>
          c.id !== categoryId
            ? c
            : {
                ...c,
                items: [
                  ...c.items,
                  {
                    id: `custom-${Date.now()}`,
                    label: text,
                    checked: false,
                    custom: true,
                  },
                ],
              },
        ),
      );
      setNewItemText((prev) => ({ ...prev, [categoryId]: "" }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    },
    [categories, newItemText, persist],
  );

  const handleRemoveItem = useCallback(
    (categoryId: string, itemId: string) => {
      persist(
        categories.map((c) =>
          c.id !== categoryId
            ? c
            : { ...c, items: c.items.filter((i) => i.id !== itemId) },
        ),
      );
    },
    [categories, persist],
  );

  const handleReset = useCallback(() => {
    Alert.alert(
      "Reset checklist?",
      "This will uncheck every item. Custom items you added will stay.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            persist(
              categories.map((c) => ({
                ...c,
                items: c.items.map((i) => ({ ...i, checked: false })),
              })),
            );
          },
        },
      ],
    );
  }, [categories, persist]);

  const { checked, total } = useMemo(
    () => countChecked(categories),
    [categories],
  );
  const progressPct = total > 0 ? checked / total : 0;

  const handleExportPdf = useCallback(async () => {
    try {
      setGenerating(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const html = buildHospitalBagHtml(categories);
      if (Platform.OS === "web") {
        Alert.alert(
          "Checklist ready",
          "You can check items off right here in the app. Printing/saving as a PDF is available in the mobile app.",
        );
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      router.push({
        pathname: "/pdf-viewer",
        params: {
          uri,
          title: "Hospital Bag Checklist",
          shareTitle: "Hospital Bag Checklist",
        },
      });
    } catch {
      Alert.alert(
        "Couldn't generate",
        "Something went wrong creating your checklist PDF. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  }, [categories]);

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
            {backLabel}
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
            Hospital Bag Checklist
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Pack around 36 weeks so you're ready whenever labor starts
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={[
            styles.progressCard,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View style={styles.progressHeaderRow}>
            <Text style={[styles.progressLabel, { color: colors.foreground }]}>
              {checked} of {total} packed
            </Text>
            <TouchableOpacity onPress={handleReset}>
              <Text
                style={[styles.resetText, { color: colors.mutedForeground }]}
              >
                Reset
              </Text>
            </TouchableOpacity>
          </View>
          <View
            style={[styles.progressTrack, { backgroundColor: colors.border }]}
          >
            <View
              style={[
                styles.progressFill,
                {
                  backgroundColor: colors.primary,
                  width: `${Math.round(progressPct * 100)}%`,
                },
              ]}
            />
          </View>
        </Animated.View>

        {!loaded && (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        )}

        {loaded &&
          categories.map((category, cIndex) => (
            <Animated.View
              key={category.id}
              entering={FadeInDown.delay(80 + cIndex * 40).duration(400)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {category.title}
              </Text>
              {category.items.map((item) => (
                <View key={item.id} style={styles.checkRow}>
                  <TouchableOpacity
                    style={styles.checkRowMain}
                    onPress={() => toggleItem(category.id, item.id)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name={item.checked ? "checkbox" : "square-outline"}
                      size={22}
                      color={
                        item.checked ? colors.primary : colors.mutedForeground
                      }
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.checkLabel,
                          { color: colors.foreground },
                          item.checked && {
                            color: colors.mutedForeground,
                            textDecorationLine: "line-through",
                          },
                        ]}
                      >
                        {item.label}
                      </Text>
                      {item.note && (
                        <Text
                          style={[
                            styles.checkNote,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {item.note}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                  {item.custom && (
                    <TouchableOpacity
                      onPress={() => handleRemoveItem(category.id, item.id)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={colors.mutedForeground}
                      />
                    </TouchableOpacity>
                  )}
                </View>
              ))}

              <View style={styles.addRow}>
                <TextInput
                  style={[
                    styles.addInput,
                    {
                      borderColor: colors.border,
                      color: colors.foreground,
                      backgroundColor: colors.muted,
                    },
                  ]}
                  value={newItemText[category.id] ?? ""}
                  onChangeText={(text) =>
                    setNewItemText((prev) => ({ ...prev, [category.id]: text }))
                  }
                  placeholder="Add your own item..."
                  placeholderTextColor={colors.mutedForeground}
                  onSubmitEditing={() => handleAddItem(category.id)}
                  returnKeyType="done"
                />
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.primary }]}
                  onPress={() => handleAddItem(category.id)}
                  disabled={!(newItemText[category.id] ?? "").trim()}
                >
                  <Ionicons
                    name="add"
                    size={20}
                    color={colors.primaryForeground}
                  />
                </TouchableOpacity>
              </View>
            </Animated.View>
          ))}

        <TouchableOpacity
          style={[styles.exportBtn, { backgroundColor: colors.primary }]}
          onPress={handleExportPdf}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons
                name="document-text-outline"
                size={18}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.exportBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                View Checklist PDF
              </Text>
            </>
          )}
        </TouchableOpacity>
        <Text style={[styles.exportHint, { color: colors.mutedForeground }]}>
          Your checked items are saved automatically, so you can keep coming
          back to this list right up until you head to the hospital.
        </Text>
        <AskCard returnTo="/hospital-bag" />
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
    marginBottom: 16,
  },
  progressCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    marginBottom: 16,
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  progressLabel: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  resetText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  progressTrack: {
    height: 8,
    borderRadius: 4,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 4,
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
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 8,
  },
  checkRowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkLabel: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  checkNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 8,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  addBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 10,
  },
  exportBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  exportHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 17,
    marginBottom: 8,
  },
});
