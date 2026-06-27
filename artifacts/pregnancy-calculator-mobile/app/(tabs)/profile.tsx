import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import React, { useState, useEffect, useCallback } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
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

function CallButton({ phone }: { phone: string }) {
  const colors = useColors();
  const handleCall = useCallback(() => {
    Linking.openURL(`tel:${phone}`);
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
  keyboardType?: "default" | "phone-pad";
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
  const isWeb = Platform.OS === "web";
  const topPad = isWeb ? 67 : insets.top;
  const bottomPad = isWeb ? 34 : insets.bottom + 16;

  const { isSignedIn } = useAuth();
  const { data: profile, isLoading } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });
  const updateMutation = useUpdateProfile();
  const { hasPass, redeemCode, isRedeeming } = usePass();

  const [providerName, setProviderName] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
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
      setProviderName(profile.providerName ?? "");
      setProviderPhone(profile.providerPhone ?? "");
      setHospitalName(profile.hospitalName ?? "");
      setHospitalPhone(profile.hospitalPhone ?? "");
      setHospitalAddress(profile.hospitalAddress ?? "");
    }
  }, [profile]);

  const handleSave = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      await updateMutation.mutateAsync({
        data: {
          providerName: providerName.trim() || null,
          providerPhone: providerPhone.trim() || null,
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
    providerName,
    providerPhone,
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
          {isLoading ? (
            <Text
              style={[styles.loadingText, { color: colors.mutedForeground }]}
            >
              Loading…
            </Text>
          ) : (
            <>
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
                  onChange={setProviderPhone}
                  placeholder="(555) 000-0000"
                  keyboardType="phone-pad"
                  suffix={
                    providerPhone ? <CallButton phone={providerPhone} /> : null
                  }
                />
              </View>

              {/* Hospital section */}
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
                    My Hospital
                  </Text>
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
                  onChange={setHospitalPhone}
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
});
