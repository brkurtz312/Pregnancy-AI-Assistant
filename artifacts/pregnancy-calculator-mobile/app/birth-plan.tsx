import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";
import * as Haptics from "expo-haptics";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
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
import {
  BIRTH_PLAN_SECTIONS,
  buildBirthPlanHtml,
  loadBirthPlanAnswers,
  saveBirthPlanAnswers,
  markBirthPlanGenerated,
  type BirthPlanAnswers,
  type BirthPlanField,
  type BirthPlanValue,
} from "@/lib/birth-plan";
import {
  apiLoadBirthPlanAnswers,
  apiSaveBirthPlanAnswers,
} from "@/lib/sync-api";

const BLANK_PDF_ASSET = require("@/assets/docs/sample-birth-plan.pdf");

async function openBlankPdf() {
  try {
    const asset = Asset.fromModule(BLANK_PDF_ASSET);
    await asset.downloadAsync();
    const sourceUri = asset.localUri ?? asset.uri;
    if (!sourceUri) {
      throw new Error("PDF asset has no resolvable URI");
    }
    const destUri = `${FileSystem.cacheDirectory}sample-birth-plan.pdf`;
    await FileSystem.copyAsync({ from: sourceUri, to: destUri });
    if (Platform.OS === "web") {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(destUri, {
          mimeType: "application/pdf",
          dialogTitle: "Birth Plan",
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          "Can't open PDF",
          "Viewing files isn't available on this device.",
        );
      }
      return;
    }
    router.push({
      pathname: "/pdf-viewer",
      params: {
        uri: destUri,
        title: "Blank Birth Plan",
        shareTitle: "Birth Plan",
      },
    });
  } catch {
    Alert.alert(
      "Can't open PDF",
      "Something went wrong opening the blank birth plan. Please try again.",
    );
  }
}

function BooleanRow({
  field,
  value,
  onChange,
  colors,
}: {
  field: BirthPlanField;
  value: BirthPlanValue;
  onChange: (v: BirthPlanValue) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const checked = value === true;
  return (
    <TouchableOpacity
      style={styles.checkRow}
      onPress={() => onChange(!checked)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={22}
        color={checked ? colors.primary : colors.mutedForeground}
      />
      <Text style={[styles.checkLabel, { color: colors.foreground }]}>
        {field.label}
      </Text>
    </TouchableOpacity>
  );
}

function SingleChoiceField({
  field,
  value,
  onChange,
  colors,
}: {
  field: BirthPlanField;
  value: BirthPlanValue;
  onChange: (v: BirthPlanValue) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {field.label}
      </Text>
      {field.options?.map((opt) => {
        const selected = value === opt.value;
        return (
          <TouchableOpacity
            key={opt.value}
            style={styles.checkRow}
            onPress={() => onChange(opt.value)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={selected ? "radio-button-on" : "radio-button-off"}
              size={20}
              color={selected ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.checkLabel, { color: colors.foreground }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function MultiChoiceField({
  field,
  value,
  onChange,
  colors,
}: {
  field: BirthPlanField;
  value: BirthPlanValue;
  onChange: (v: BirthPlanValue) => void;
  colors: ReturnType<typeof useColors>;
}) {
  const selectedValues = Array.isArray(value) ? value : [];
  const toggle = (optValue: string) => {
    const next = selectedValues.includes(optValue)
      ? selectedValues.filter((v) => v !== optValue)
      : [...selectedValues, optValue];
    onChange(next);
  };
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {field.label}
      </Text>
      {field.options?.map((opt) => {
        const checked = selectedValues.includes(opt.value);
        return (
          <TouchableOpacity
            key={opt.value}
            style={styles.checkRow}
            onPress={() => toggle(opt.value)}
            activeOpacity={0.7}
          >
            <Ionicons
              name={checked ? "checkbox" : "square-outline"}
              size={22}
              color={checked ? colors.primary : colors.mutedForeground}
            />
            <Text style={[styles.checkLabel, { color: colors.foreground }]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function TextField({
  field,
  value,
  onChange,
  colors,
}: {
  field: BirthPlanField;
  value: BirthPlanValue;
  onChange: (v: BirthPlanValue) => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={[styles.fieldLabel, { color: colors.foreground }]}>
        {field.label}
      </Text>
      {field.helper && (
        <Text style={[styles.fieldHelper, { color: colors.mutedForeground }]}>
          {field.helper}
        </Text>
      )}
      <TextInput
        style={[
          styles.input,
          field.type === "textarea" && styles.textArea,
          {
            borderColor: colors.border,
            color: colors.foreground,
            backgroundColor: colors.card,
          },
        ]}
        value={typeof value === "string" ? value : ""}
        onChangeText={onChange}
        placeholder={field.placeholder}
        placeholderTextColor={colors.mutedForeground}
        multiline={field.type === "textarea"}
        numberOfLines={field.type === "textarea" ? 3 : 1}
      />
    </View>
  );
}

export default function BirthPlanScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string }>();
  const backLabel = params.from || "Get Ready";

  const { isSignedIn, getToken } = useAuth();
  const { user } = useUser();

  const [answers, setAnswers] = useState<BirthPlanAnswers>({});
  const [loaded, setLoaded] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(false);
  const migratedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id ?? null;
    if (isSignedIn && userId) {
      apiLoadBirthPlanAnswers(getToken)
        .then((serverAnswers) => {
          if (migratedForUserRef.current !== userId) {
            migratedForUserRef.current = userId;
            if (serverAnswers === null) {
              loadBirthPlanAnswers().then((local) => {
                const hasLocal = Object.keys(local).length > 0;
                if (hasLocal) {
                  apiSaveBirthPlanAnswers(local, getToken).catch(() => {});
                }
                setAnswers(local);
              });
            } else {
              setAnswers(serverAnswers);
            }
          } else {
            setAnswers(serverAnswers ?? {});
          }
        })
        .catch(() => {
          loadBirthPlanAnswers().then(setAnswers);
        })
        .finally(() => setLoaded(true));
    } else {
      loadBirthPlanAnswers().then((a) => {
        setAnswers(a);
        setLoaded(true);
      });
    }
  }, [isSignedIn, getToken, user]);

  const setField = useCallback(
    (id: string, value: BirthPlanValue) => {
      setAnswers((prev) => {
        const next = { ...prev, [id]: value };
        if (isSignedIn) {
          apiSaveBirthPlanAnswers(next, getToken).catch(() => {});
        } else {
          saveBirthPlanAnswers(next);
        }
        return next;
      });
    },
    [isSignedIn, getToken],
  );

  const answeredCount = useMemo(() => {
    return Object.values(answers).filter((v) => {
      if (v === undefined || v === "" || v === null) return false;
      if (Array.isArray(v)) return v.length > 0;
      return true;
    }).length;
  }, [answers]);

  const handleGenerate = useCallback(async () => {
    try {
      setGenerating(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const html = buildBirthPlanHtml(answers);
      await markBirthPlanGenerated();
      if (Platform.OS === "web") {
        setGenerated(true);
        Alert.alert(
          "Birth plan ready",
          "You can view it in-app now. Printing/saving as a PDF is available in the mobile app.",
        );
        return;
      }
      const { uri } = await Print.printToFileAsync({ html });
      setGenerated(true);
      router.push({
        pathname: "/pdf-viewer",
        params: { uri, title: "My Birth Plan", shareTitle: "My Birth Plan" },
      });
    } catch {
      Alert.alert(
        "Couldn't generate",
        "Something went wrong creating your birth plan. Please try again.",
      );
    } finally {
      setGenerating(false);
    }
  }, [answers]);

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
            Prepare Your Birth Plan
          </Text>
          <Text style={[styles.pageSub, { color: colors.mutedForeground }]}>
            Based on the ACOG Sample Birth Plan
          </Text>
        </Animated.View>

        <Animated.View
          entering={FadeInDown.delay(40).duration(400)}
          style={[styles.noteBox, { backgroundColor: colors.primary + "18" }]}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.noteText, { color: colors.foreground }]}>
            {isSignedIn
              ? "Your answers sync securely to your account so they're available on all your devices. A birth plan is a great starting point, but be prepared for changes as labor unfolds; review your plan with your ob-gyn well before your due date."
              : "Your answers are saved on this device only when you're not signed in. Sign in to sync your birth plan across devices. A birth plan is a great starting point, but be prepared for changes as labor unfolds; review your plan with your ob-gyn well before your due date."}
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
            Prefer to fill it out yourself?
          </Text>
          <Text
            style={[
              styles.body,
              { color: colors.mutedForeground, marginBottom: 14 },
            ]}
          >
            Print or save a blank copy of the ACOG birth plan worksheet and fill
            it out by hand.
          </Text>
          <TouchableOpacity
            style={[
              styles.pdfBtn,
              { borderColor: colors.primary, backgroundColor: colors.card },
            ]}
            onPress={openBlankPdf}
          >
            <Ionicons
              name="document-text-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.pdfBtnText, { color: colors.primary }]}>
              View Blank PDF
            </Text>
          </TouchableOpacity>
        </Animated.View>

        <Animated.View entering={FadeInDown.delay(120).duration(400)}>
          <Text style={[styles.formHeading, { color: colors.foreground }]}>
            Or answer these questions to auto-fill your plan
          </Text>
          <Text
            style={[styles.formHeadingSub, { color: colors.mutedForeground }]}
          >
            {answeredCount} answered so far — skip any that don't apply
          </Text>
        </Animated.View>

        {!loaded && (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 20 }} />
        )}

        {loaded &&
          BIRTH_PLAN_SECTIONS.map((section, sIndex) => (
            <Animated.View
              key={section.id}
              entering={FadeInDown.delay(160 + sIndex * 40).duration(400)}
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                {section.title}
              </Text>
              {section.intro && (
                <Text
                  style={[
                    styles.body,
                    { color: colors.mutedForeground, marginBottom: 12 },
                  ]}
                >
                  {section.intro}
                </Text>
              )}
              {section.fields.map((field) => {
                const value = answers[field.id];
                if (field.type === "boolean") {
                  return (
                    <BooleanRow
                      key={field.id}
                      field={field}
                      value={value}
                      onChange={(v) => setField(field.id, v)}
                      colors={colors}
                    />
                  );
                }
                if (field.type === "single") {
                  return (
                    <SingleChoiceField
                      key={field.id}
                      field={field}
                      value={value}
                      onChange={(v) => setField(field.id, v)}
                      colors={colors}
                    />
                  );
                }
                if (field.type === "multi") {
                  return (
                    <MultiChoiceField
                      key={field.id}
                      field={field}
                      value={value}
                      onChange={(v) => setField(field.id, v)}
                      colors={colors}
                    />
                  );
                }
                return (
                  <TextField
                    key={field.id}
                    field={field}
                    value={value}
                    onChange={(v) => setField(field.id, v)}
                    colors={colors}
                  />
                );
              })}
            </Animated.View>
          ))}

        <TouchableOpacity
          style={[styles.generateBtn, { backgroundColor: colors.primary }]}
          onPress={handleGenerate}
          disabled={generating}
        >
          {generating ? (
            <ActivityIndicator color={colors.primaryForeground} />
          ) : (
            <>
              <Ionicons
                name="sparkles-outline"
                size={18}
                color={colors.primaryForeground}
              />
              <Text
                style={[
                  styles.generateBtnText,
                  { color: colors.primaryForeground },
                ]}
              >
                Generate My Birth Plan
              </Text>
            </>
          )}
        </TouchableOpacity>

        {generated && (
          <TouchableOpacity
            style={[
              styles.viewBtn,
              { borderColor: colors.primary, backgroundColor: colors.card },
            ]}
            onPress={() =>
              router.push({
                pathname: "/birth-plan-summary",
                params: { from: "Birth Plan" },
              })
            }
          >
            <Ionicons name="reader-outline" size={18} color={colors.primary} />
            <Text style={[styles.viewBtnText, { color: colors.primary }]}>
              View My Birth Plan in App
            </Text>
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
    marginBottom: 16,
  },
  noteBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_500Medium",
    lineHeight: 19,
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
    marginBottom: 10,
  },
  body: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 21,
  },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
  },
  pdfBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  formHeading: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    marginBottom: 2,
  },
  formHeadingSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
    marginBottom: 8,
  },
  fieldHelper: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 8,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 6,
  },
  checkLabel: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  textArea: {
    height: 70,
    textAlignVertical: "top",
  },
  generateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  generateBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  viewBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
    marginBottom: 8,
  },
  viewBtnText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
});
