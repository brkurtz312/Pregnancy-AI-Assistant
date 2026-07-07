import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useState, useEffect, useCallback } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getGetProfileQueryKey,
  useGetProfile,
  useUpdateProfile,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePass } from "@/hooks/usePass";
import { formatPhone } from "@/lib/phone";
import { useSettings } from "@/contexts/SettingsContext";
import type { ThemeMode } from "@/contexts/SettingsContext";

function CallButton({ phone }: { phone: string }) {
  const colors = useColors();
  const handleCall = useCallback(() => {
    Linking.openURL(`tel:${phone.replace(/\D/g, "")}`);
  }, [phone]);
  return (
    <TouchableOpacity
      onPress={handleCall}
      style={[
        styles.iconBtn,
        {
          backgroundColor: colors.primary + "1A",
          borderColor: colors.primary + "33",
        },
      ]}
    >
      <Ionicons name="call-outline" size={18} color={colors.primary} />
    </TouchableOpacity>
  );
}

function DirectionsButtons({ address }: { address: string }) {
  const colors = useColors();
  const encoded = encodeURIComponent(address);

  const openAppleMaps = useCallback(() => {
    const url =
      Platform.OS === "ios"
        ? `maps://maps.apple.com/?q=${encoded}`
        : `https://maps.apple.com/?q=${encoded}`;
    Linking.openURL(url);
  }, [encoded]);

  const openGoogleMaps = useCallback(() => {
    Linking.openURL(
      `https://www.google.com/maps/search/?api=1&query=${encoded}`,
    );
  }, [encoded]);

  return (
    <View style={styles.dirRow}>
      <TouchableOpacity
        onPress={openAppleMaps}
        style={[
          styles.dirBtn,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Ionicons name="map-outline" size={15} color={colors.foreground} />
        <Text style={[styles.dirBtnText, { color: colors.foreground }]}>
          Apple Maps
        </Text>
        <Ionicons
          name="open-outline"
          size={12}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>
      <TouchableOpacity
        onPress={openGoogleMaps}
        style={[
          styles.dirBtn,
          { backgroundColor: colors.card, borderColor: colors.border },
        ]}
      >
        <Ionicons name="map-outline" size={15} color={colors.foreground} />
        <Text style={[styles.dirBtnText, { color: colors.foreground }]}>
          Google Maps
        </Text>
        <Ionicons
          name="open-outline"
          size={12}
          color={colors.mutedForeground}
        />
      </TouchableOpacity>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad" | "number-pad";
  suffix?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
      <View style={styles.fieldRow}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={colors.mutedForeground}
          keyboardType={keyboardType}
          style={[
            styles.input,
            {
              color: colors.foreground,
              backgroundColor: colors.card,
              borderColor: colors.border,
              flex: 1,
            },
          ]}
        />
        {suffix}
      </View>
    </View>
  );
}

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom + 16;

  const { isSignedIn } = useAuth();
  const { data: profile, isLoading } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });
  const updateMutation = useUpdateProfile();
  const { hasPass, redeemCode, isRedeeming } = usePass();
  const settings = useSettings();
  const systemScheme = (useColorScheme() ?? "light") as ThemeMode;
  const effectiveMode: ThemeMode = settings.themeAuto
    ? systemScheme
    : settings.themeMode;

  const handleThemeAutoChange = useCallback(
    (v: boolean) => {
      settings.setThemeAuto(v);
      if (!v) settings.setThemeMode(systemScheme);
    },
    [settings, systemScheme],
  );

  const [firstName, setFirstName] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [providerName, setProviderName] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [providerAddress, setProviderAddress] = useState("");
  const [deliveryCenterType, setDeliveryCenterType] = useState<
    "hospital" | "birthing_center"
  >("hospital");
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalPhone, setHospitalPhone] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [saved, setSaved] = useState(false);
  const [accessCode, setAccessCode] = useState("");
  const [codeError, setCodeError] = useState("");
  const [codeSuccess, setCodeSuccess] = useState(false);

  const handleRedeemCode = useCallback(async () => {
    const trimmed = accessCode.trim();
    if (!trimmed) {
      setCodeError("Enter an access code.");
      return;
    }
    setCodeError("");
    try {
      await redeemCode(trimmed);
      setCodeSuccess(true);
      setAccessCode("");
    } catch {
      setCodeError("That access code isn't valid.");
    }
  }, [accessCode, redeemCode]);

  useEffect(() => {
    if (profile) {
      setFirstName(profile.firstName ?? "");
      setZipCode(profile.zipCode ?? "");
      setProviderName(profile.providerName ?? "");
      setProviderPhone(formatPhone(profile.providerPhone ?? ""));
      setProviderAddress(profile.providerAddress ?? "");
      setDeliveryCenterType(
        profile.deliveryCenterType === "birthing_center"
          ? "birthing_center"
          : "hospital",
      );
      setHospitalName(profile.hospitalName ?? "");
      setHospitalPhone(formatPhone(profile.hospitalPhone ?? ""));
      setHospitalAddress(profile.hospitalAddress ?? "");
    }
  }, [profile]);

  const handleSave = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      await updateMutation.mutateAsync({
        data: {
          firstName: firstName.trim() || null,
          zipCode: zipCode.trim() || null,
          providerName: providerName.trim() || null,
          providerPhone: providerPhone.trim() || null,
          providerAddress: providerAddress.trim() || null,
          deliveryCenterType,
          hospitalName: hospitalName.trim() || null,
          hospitalPhone: hospitalPhone.trim() || null,
          hospitalAddress: hospitalAddress.trim() || null,
        },
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch {
      Alert.alert("Error", "Could not save. Please try again.");
    }
  }, [
    isSignedIn,
    firstName,
    zipCode,
    providerName,
    providerPhone,
    providerAddress,
    deliveryCenterType,
    hospitalName,
    hospitalPhone,
    hospitalAddress,
    updateMutation,
  ]);

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ paddingBottom: bottomPad + 24 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* Header */}
        <View
          style={[
            styles.header,
            { backgroundColor: colors.primary, paddingTop: topPad + 16 },
          ]}
        >
          <View style={styles.headerIcon}>
            <Ionicons name="heart" size={28} color={colors.primary} />
          </View>
          <Text style={styles.headerTitle}>My Info</Text>
          <Text style={styles.headerSubtitle}>
            Your provider and hospital at a glance
          </Text>
        </View>

        <View style={styles.content}>
          {!isSignedIn ? (
            <View
              style={[
                styles.card,
                styles.signInCard,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.signInIconWrap}>
                <Ionicons
                  name="person-circle-outline"
                  size={52}
                  color={colors.primary}
                />
              </View>
              <Text style={[styles.signInTitle, { color: colors.foreground }]}>
                Sign in to view your info
              </Text>
              <Text
                style={[styles.signInBody, { color: colors.mutedForeground }]}
              >
                Save your provider and hospital details so they're always at
                your fingertips.
              </Text>
              <TouchableOpacity
                onPress={() => router.push("/(auth)/sign-in")}
                style={[styles.signInBtn, { backgroundColor: colors.primary }]}
              >
                <Ionicons name="log-in-outline" size={18} color="#fff" />
                <Text style={styles.signInBtnText}>Sign In</Text>
              </TouchableOpacity>
            </View>
          ) : isLoading ? (
            <Text
              style={[styles.loadingText, { color: colors.mutedForeground }]}
            >
              Loading…
            </Text>
          ) : (
            <>
              {/* About you section */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.sectionTitle, { color: colors.foreground }]}
                  >
                    About You
                  </Text>
                </View>

                <Field
                  label="FIRST NAME"
                  value={firstName}
                  onChange={setFirstName}
                  placeholder="Jane"
                />
                <Field
                  label="ZIP CODE"
                  value={zipCode}
                  onChange={setZipCode}
                  placeholder="90210"
                  keyboardType="number-pad"
                />
                <Text
                  style={[
                    styles.privacyNote,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Used only to find local resources for you — not shared or
                  collected.
                </Text>
              </View>

              {/* Provider section */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="person-circle-outline"
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.sectionTitle, { color: colors.foreground }]}
                  >
                    My Provider
                  </Text>
                </View>

                <Field
                  label="NAME"
                  value={providerName}
                  onChange={setProviderName}
                  placeholder="Dr. Jane Smith"
                />
                <Field
                  label="PHONE"
                  value={providerPhone}
                  onChange={(v) => setProviderPhone(formatPhone(v))}
                  placeholder="(555) 000-0000"
                  keyboardType="phone-pad"
                  suffix={
                    providerPhone ? <CallButton phone={providerPhone} /> : null
                  }
                />
                <Field
                  label="ADDRESS"
                  value={providerAddress}
                  onChange={setProviderAddress}
                  placeholder="123 Main St, City, State 00000"
                />
                {providerAddress ? (
                  <DirectionsButtons address={providerAddress} />
                ) : null}
              </View>

              {/* Delivery center section */}
              <View
                style={[
                  styles.card,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="business-outline"
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.sectionTitle, { color: colors.foreground }]}
                  >
                    My Delivery Center
                  </Text>
                </View>

                <View style={styles.fieldWrap}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    TYPE
                  </Text>
                  <View style={styles.toggleRow}>
                    {(
                      [
                        { key: "hospital", label: "Hospital" },
                        { key: "birthing_center", label: "Birthing Center" },
                      ] as {
                        key: "hospital" | "birthing_center";
                        label: string;
                      }[]
                    ).map((opt) => {
                      const active = deliveryCenterType === opt.key;
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={() => setDeliveryCenterType(opt.key)}
                          style={[
                            styles.toggleBtn,
                            {
                              backgroundColor: active
                                ? colors.primary
                                : colors.background,
                              borderColor: active
                                ? colors.primary
                                : colors.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.toggleBtnText,
                              { color: active ? "#fff" : colors.foreground },
                            ]}
                          >
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <Field
                  label="NAME"
                  value={hospitalName}
                  onChange={setHospitalName}
                  placeholder="City Medical Center"
                />
                <Field
                  label="PHONE"
                  value={hospitalPhone}
                  onChange={(v) => setHospitalPhone(formatPhone(v))}
                  placeholder="(555) 000-0000"
                  keyboardType="phone-pad"
                  suffix={
                    hospitalPhone ? <CallButton phone={hospitalPhone} /> : null
                  }
                />
                <Field
                  label="ADDRESS"
                  value={hospitalAddress}
                  onChange={setHospitalAddress}
                  placeholder="123 Main St, City, State 00000"
                />
                {hospitalAddress ? (
                  <DirectionsButtons address={hospitalAddress} />
                ) : null}
              </View>

              {/* Save button */}
              <TouchableOpacity
                onPress={handleSave}
                disabled={!isSignedIn || updateMutation.isPending}
                style={[
                  styles.saveBtn,
                  {
                    backgroundColor: saved
                      ? colors.primary + "CC"
                      : colors.primary,
                    opacity: !isSignedIn || updateMutation.isPending ? 0.6 : 1,
                  },
                ]}
              >
                <Ionicons
                  name={saved ? "checkmark" : "save-outline"}
                  size={18}
                  color="#fff"
                />
                <Text style={styles.saveBtnText}>
                  {saved
                    ? "Saved"
                    : updateMutation.isPending
                      ? "Saving…"
                      : "Save"}
                </Text>
              </TouchableOpacity>

              {/* Access code redemption */}
              {!hasPass && (
                <View
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.card,
                      borderColor: colors.border,
                    },
                  ]}
                >
                  <View style={styles.sectionHeader}>
                    <Ionicons
                      name="key-outline"
                      size={20}
                      color={colors.primary}
                    />
                    <Text
                      style={[
                        styles.sectionTitle,
                        { color: colors.foreground },
                      ]}
                    >
                      Access Code
                    </Text>
                  </View>
                  {codeSuccess ? (
                    <View style={styles.codeSuccessRow}>
                      <Ionicons
                        name="checkmark-circle"
                        size={20}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.codeSuccessText,
                          { color: colors.primary },
                        ]}
                      >
                        Full Pregnancy Pass unlocked!
                      </Text>
                    </View>
                  ) : (
                    <>
                      <View style={styles.fieldRow}>
                        <TextInput
                          value={accessCode}
                          onChangeText={(v) => {
                            setAccessCode(v);
                            setCodeError("");
                          }}
                          placeholder="Enter access code"
                          placeholderTextColor={colors.mutedForeground}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={[
                            styles.input,
                            {
                              color: colors.foreground,
                              backgroundColor: colors.background,
                              borderColor: codeError
                                ? "#ef4444"
                                : colors.border,
                              flex: 1,
                            },
                          ]}
                        />
                        <TouchableOpacity
                          onPress={handleRedeemCode}
                          disabled={isRedeeming}
                          style={[
                            styles.redeemBtn,
                            {
                              backgroundColor: colors.primary,
                              opacity: isRedeeming ? 0.6 : 1,
                            },
                          ]}
                        >
                          <Text style={styles.redeemBtnText}>
                            {isRedeeming ? "…" : "Redeem"}
                          </Text>
                        </TouchableOpacity>
                      </View>
                      {codeError ? (
                        <Text style={styles.codeError}>{codeError}</Text>
                      ) : null}
                    </>
                  )}
                </View>
              )}
            </>
          )}

          {/* My Settings */}
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Ionicons
                name="settings-outline"
                size={20}
                color={colors.primary}
              />
              <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
                My Settings
              </Text>
            </View>

            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              APPEARANCE
            </Text>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.settingLabel, { color: colors.foreground }]}
                >
                  Auto Light/Dark Mode
                </Text>
                <Text
                  style={[
                    styles.settingHint,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Follows your device setting
                </Text>
              </View>
              <Switch
                value={settings.themeAuto}
                onValueChange={handleThemeAutoChange}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>

            <View
              style={[
                styles.fieldWrap,
                { opacity: settings.themeAuto ? 0.4 : 1 },
              ]}
            >
              <Text
                style={[styles.fieldLabel, { color: colors.mutedForeground }]}
              >
                CURRENT MODE
              </Text>
              <View style={styles.toggleRow}>
                {[
                  {
                    key: "light" as ThemeMode,
                    label: "Light",
                    icon: "sunny-outline" as const,
                  },
                  {
                    key: "dark" as ThemeMode,
                    label: "Dark",
                    icon: "moon-outline" as const,
                  },
                ].map((opt) => {
                  const active = effectiveMode === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => {
                        if (!settings.themeAuto) settings.setThemeMode(opt.key);
                      }}
                      disabled={settings.themeAuto}
                      style={[
                        styles.toggleBtn,
                        {
                          flexDirection: "row",
                          gap: 6,
                          backgroundColor: active
                            ? colors.primary
                            : colors.background,
                          borderColor: active ? colors.primary : colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={opt.icon}
                        size={14}
                        color={active ? "#fff" : colors.mutedForeground}
                      />
                      <Text
                        style={[
                          styles.toggleBtnText,
                          { color: active ? "#fff" : colors.foreground },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            <Text
              style={[
                styles.fieldLabel,
                { color: colors.mutedForeground, marginTop: 4 },
              ]}
            >
              HAPTIC FEEDBACK
            </Text>

            <View style={styles.settingRow}>
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.settingLabel, { color: colors.foreground }]}
                >
                  Vibration on Interactions
                </Text>
                <Text
                  style={[
                    styles.settingHint,
                    { color: colors.mutedForeground },
                  ]}
                >
                  Contraction timer, kick counter & more
                </Text>
              </View>
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={settings.setHapticsEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 28,
  },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.25)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontFamily: "Playfair_700Bold",
    color: "#fff",
    marginBottom: 6,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    textAlign: "center",
  },
  content: { padding: 16, gap: 16 },
  loadingText: {
    textAlign: "center",
    paddingVertical: 40,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  fieldWrap: { gap: 6 },
  fieldLabel: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.8,
  },
  fieldRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  privacyNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    lineHeight: 17,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
  },
  toggleBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  toggleBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  dirRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  dirBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  dirBtnText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    marginTop: 4,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  redeemBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  redeemBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  codeError: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "#ef4444",
    marginTop: 4,
  },
  codeSuccessRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  codeSuccessText: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  signInCard: {
    alignItems: "center",
    paddingVertical: 36,
    gap: 12,
    marginTop: 8,
  },
  signInIconWrap: {
    marginBottom: 4,
  },
  signInTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  signInBody: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  signInBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    paddingHorizontal: 32,
    borderRadius: 16,
    marginTop: 8,
  },
  signInBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  settingLabel: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  settingHint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
});
