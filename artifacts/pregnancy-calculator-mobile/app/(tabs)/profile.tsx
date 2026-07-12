import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { useRouter } from "expo-router";
import React, { useState, useEffect, useCallback } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  useColorScheme,
  View,
} from "react-native";
import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetProfileQueryKey,
  useGetProfile,
  useUpdateProfile,
  useListContacts,
  getListContactsQueryKey,
  useCreateContact,
  useUpdateContact,
  useDeleteContact,
  type SupportContact,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { usePass } from "@/hooks/usePass";
import { formatPhone } from "@/lib/phone";
import { useSettings } from "@/contexts/SettingsContext";
import type { ThemeMode } from "@/contexts/SettingsContext";
import { formatDate, getGestationalAgeAtDate } from "@/lib/pregnancy-math";

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

  const queryClient = useQueryClient();
  const { data: contactsData } = useListContacts({
    query: { enabled: !!isSignedIn, queryKey: getListContactsQueryKey() },
  });
  const contacts = contactsData?.items ?? [];
  const createContactMutation = useCreateContact();
  const updateContactMutation = useUpdateContact();
  const deleteContactMutation = useDeleteContact();

  const [addingContact, setAddingContact] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [cFirstName, setCFirstName] = useState("");
  const [cRole, setCRole] = useState("");
  const [cPhone, setCPhone] = useState("");

  const handleCancelContact = useCallback(() => {
    setAddingContact(false);
    setEditingContactId(null);
    setCFirstName("");
    setCRole("");
    setCPhone("");
  }, []);

  const handleEditContact = useCallback((c: SupportContact) => {
    setEditingContactId(c.id);
    setCFirstName(c.firstName);
    setCRole(c.role);
    setCPhone(formatPhone(c.phone));
    setAddingContact(false);
  }, []);

  const handleSaveContact = useCallback(async () => {
    if (!cFirstName.trim() || !cRole.trim() || !cPhone.trim()) return;
    if (editingContactId) {
      await updateContactMutation.mutateAsync({
        contactId: editingContactId,
        data: {
          firstName: cFirstName.trim(),
          role: cRole.trim(),
          phone: cPhone,
        },
      });
    } else {
      await createContactMutation.mutateAsync({
        data: {
          firstName: cFirstName.trim(),
          role: cRole.trim(),
          phone: cPhone,
        },
      });
    }
    await queryClient.invalidateQueries({
      queryKey: getListContactsQueryKey(),
    });
    handleCancelContact();
  }, [
    editingContactId,
    cFirstName,
    cRole,
    cPhone,
    updateContactMutation,
    createContactMutation,
    queryClient,
    handleCancelContact,
  ]);

  const handleDeleteContact = useCallback(
    (c: SupportContact) => {
      Alert.alert(
        "Remove Contact",
        `Remove ${c.firstName} from your calling list?`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Remove",
            style: "destructive",
            onPress: async () => {
              await deleteContactMutation.mutateAsync({ contactId: c.id });
              await queryClient.invalidateQueries({
                queryKey: getListContactsQueryKey(),
              });
              if (editingContactId === c.id) handleCancelContact();
            },
          },
        ],
      );
    },
    [deleteContactMutation, queryClient, editingContactId, handleCancelContact],
  );

  const [firstName, setFirstName] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [prePregnancyWeight, setPrePregnancyWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"lbs" | "kg">("lbs");
  const [deliveryDate, setDeliveryDate] = useState<Date | null>(null);
  const [showDeliveryPicker, setShowDeliveryPicker] = useState(false);
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
      const raw = profile.prePregnancyWeight ?? "";
      const unitMatch = raw.match(/\b(lbs|kg)\s*$/i);
      if (unitMatch) {
        setWeightUnit(unitMatch[1]!.toLowerCase() as "lbs" | "kg");
        setPrePregnancyWeight(raw.replace(/\s*(lbs|kg)\s*$/i, "").trim());
      } else {
        setPrePregnancyWeight(raw);
      }
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
      setDeliveryDate(
        profile.deliveryDate ? new Date(profile.deliveryDate) : null,
      );
    }
  }, [profile]);

  const handleSave = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      await updateMutation.mutateAsync({
        data: {
          firstName: firstName.trim() || null,
          zipCode: zipCode.trim() || null,
          prePregnancyWeight: prePregnancyWeight.trim()
            ? `${prePregnancyWeight.trim()} ${weightUnit}`
            : null,
          deliveryDate: deliveryDate
            ? deliveryDate.toISOString().slice(0, 10)
            : null,
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
    prePregnancyWeight,
    weightUnit,
    deliveryDate,
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
              {/* Pregnancy Summary card */}
              {(() => {
                const dueDateObj = profile?.dueDate
                  ? new Date(profile.dueDate)
                  : null;
                if (!dueDateObj) return null;

                const egaAnchor = deliveryDate ?? new Date();
                const ega = getGestationalAgeAtDate(dueDateObj, egaAnchor);
                const egaLabel = `${ega.weeks}w ${ega.days}d`;
                const edcLabel = formatDate(dueDateObj);
                const isDelivered = deliveryDate !== null;

                const methodLabels: Record<string, string> = {
                  lmp: "Last Menstrual Period (LMP)",
                  due: "Known Due Date",
                  conception: "Conception Date",
                  ultrasound: "Ultrasound Dating",
                };
                const methodLabel =
                  (profile?.eddMethod
                    ? methodLabels[profile.eddMethod]
                    : null) ?? "Calculator";

                const isAndroid = Platform.OS === "android";

                return (
                  <View
                    style={[
                      styles.card,
                      styles.summaryCard,
                      {
                        backgroundColor: colors.primary + "10",
                        borderColor: colors.primary + "30",
                      },
                    ]}
                  >
                    <View style={styles.sectionHeader}>
                      <Ionicons
                        name="heart-circle-outline"
                        size={20}
                        color={colors.primary}
                      />
                      <Text
                        style={[
                          styles.sectionTitle,
                          { color: colors.foreground },
                        ]}
                      >
                        Pregnancy Summary
                      </Text>
                    </View>

                    {/* EDC row */}
                    <View style={styles.summaryRow}>
                      <View style={styles.summaryLabelWrap}>
                        <Text
                          style={[
                            styles.summaryLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          EDC (Due Date)
                        </Text>
                        <View
                          style={[
                            styles.methodBadge,
                            { backgroundColor: colors.primary + "18" },
                          ]}
                        >
                          <Ionicons
                            name="information-circle-outline"
                            size={11}
                            color={colors.primary}
                          />
                          <Text
                            style={[
                              styles.methodBadgeText,
                              { color: colors.primary },
                            ]}
                          >
                            {methodLabel}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={[
                          styles.summaryValue,
                          { color: colors.foreground },
                        ]}
                      >
                        {edcLabel}
                      </Text>
                    </View>

                    {/* EGA row */}
                    <View
                      style={[
                        styles.summaryRow,
                        styles.summaryRowTop,
                        { borderTopColor: colors.primary + "20" },
                      ]}
                    >
                      <View style={styles.summaryLabelWrap}>
                        <Text
                          style={[
                            styles.summaryLabel,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          {isDelivered
                            ? "EGA at Delivery"
                            : "Current Gestational Age"}
                        </Text>
                        {isDelivered && (
                          <View
                            style={[
                              styles.methodBadge,
                              { backgroundColor: "#4a7ab518" },
                            ]}
                          >
                            <Ionicons
                              name="lock-closed-outline"
                              size={11}
                              color="#4a7ab5"
                            />
                            <Text
                              style={[
                                styles.methodBadgeText,
                                { color: "#4a7ab5" },
                              ]}
                            >
                              Frozen at delivery
                            </Text>
                          </View>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.summaryValue,
                          { color: colors.foreground },
                        ]}
                      >
                        {egaLabel}
                      </Text>
                    </View>

                    {/* Delivery date picker */}
                    <View
                      style={[
                        styles.summaryRow,
                        styles.summaryRowTop,
                        { borderTopColor: colors.primary + "20" },
                      ]}
                    >
                      <Text
                        style={[
                          styles.summaryLabel,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Date of Delivery
                      </Text>

                      <TouchableOpacity
                        style={[
                          styles.deliveryDateBtn,
                          {
                            borderColor: isDelivered
                              ? colors.primary
                              : colors.border,
                            backgroundColor: colors.card,
                          },
                        ]}
                        onPress={() => setShowDeliveryPicker(true)}
                      >
                        <Ionicons
                          name={
                            isDelivered
                              ? "checkmark-circle"
                              : "calendar-outline"
                          }
                          size={15}
                          color={
                            isDelivered
                              ? colors.primary
                              : colors.mutedForeground
                          }
                        />
                        <Text
                          style={[
                            styles.deliveryDateBtnText,
                            {
                              color: isDelivered
                                ? colors.foreground
                                : colors.mutedForeground,
                            },
                          ]}
                        >
                          {isDelivered
                            ? formatDate(deliveryDate!)
                            : "Not yet set"}
                        </Text>
                      </TouchableOpacity>

                      {isDelivered && (
                        <TouchableOpacity
                          style={styles.clearDeliveryBtn}
                          onPress={() => setDeliveryDate(null)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <Ionicons
                            name="close-circle"
                            size={18}
                            color={colors.mutedForeground}
                          />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* DateTimePicker — Android inline */}
                    {isAndroid && showDeliveryPicker && (
                      <DateTimePicker
                        value={deliveryDate ?? new Date()}
                        mode="date"
                        display="default"
                        maximumDate={new Date()}
                        onChange={(
                          _event: DateTimePickerEvent,
                          date?: Date,
                        ) => {
                          setShowDeliveryPicker(false);
                          if (date) setDeliveryDate(date);
                        }}
                      />
                    )}

                    {/* DateTimePicker — iOS modal sheet */}
                    {!isAndroid && (
                      <Modal
                        visible={showDeliveryPicker}
                        transparent
                        animationType="slide"
                      >
                        <Pressable
                          style={styles.pickerOverlay}
                          onPress={() => setShowDeliveryPicker(false)}
                        >
                          <Pressable
                            style={[
                              styles.pickerSheet,
                              { backgroundColor: colors.card },
                            ]}
                          >
                            <View
                              style={[
                                styles.pickerHeader,
                                { borderBottomColor: colors.border },
                              ]}
                            >
                              <Text
                                style={[
                                  styles.pickerTitle,
                                  { color: colors.foreground },
                                ]}
                              >
                                Date of Delivery
                              </Text>
                              <TouchableOpacity
                                onPress={() => setShowDeliveryPicker(false)}
                              >
                                <Text
                                  style={[
                                    styles.pickerDone,
                                    { color: colors.primary },
                                  ]}
                                >
                                  Done
                                </Text>
                              </TouchableOpacity>
                            </View>
                            <DateTimePicker
                              value={deliveryDate ?? new Date()}
                              mode="date"
                              display="spinner"
                              maximumDate={new Date()}
                              onChange={(
                                _event: DateTimePickerEvent,
                                date?: Date,
                              ) => {
                                if (date) setDeliveryDate(date);
                              }}
                            />
                          </Pressable>
                        </Pressable>
                      </Modal>
                    )}

                    <Text
                      style={[
                        styles.summaryHint,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      {isDelivered
                        ? "EGA is frozen at the time of delivery. Tap × to clear."
                        : "Set a delivery date to freeze EGA. Tap Save below."}
                    </Text>
                  </View>
                );
              })()}

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
                <View style={styles.fieldWrap}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    PRE-PREGNANCY WEIGHT
                  </Text>
                  <View style={styles.fieldRow}>
                    <TextInput
                      value={prePregnancyWeight}
                      onChangeText={setPrePregnancyWeight}
                      placeholder="e.g. 140"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="decimal-pad"
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
                    {(["lbs", "kg"] as const).map((unit) => (
                      <TouchableOpacity
                        key={unit}
                        onPress={() => setWeightUnit(unit)}
                        style={[
                          styles.unitBtn,
                          {
                            backgroundColor:
                              weightUnit === unit
                                ? colors.primary
                                : colors.card,
                            borderColor:
                              weightUnit === unit
                                ? colors.primary
                                : colors.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.unitBtnText,
                            {
                              color:
                                weightUnit === unit
                                  ? colors.primaryForeground
                                  : colors.mutedForeground,
                            },
                          ]}
                        >
                          {unit}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
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

          {/* My Calling List */}
          {isSignedIn ? (
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.sectionHeader}>
                <Ionicons
                  name="call-outline"
                  size={20}
                  color={colors.primary}
                />
                <Text
                  style={[styles.sectionTitle, { color: colors.foreground }]}
                >
                  My Calling List
                </Text>
              </View>

              {contacts.length === 0 && !addingContact && (
                <Text
                  style={[styles.emptyHint, { color: colors.mutedForeground }]}
                >
                  Add people you may want to call — your support person, family,
                  or friends.
                </Text>
              )}

              {contacts.map((c) =>
                editingContactId === c.id ? (
                  <View key={c.id} style={styles.contactForm}>
                    <View style={styles.fieldWrap}>
                      <Text
                        style={[
                          styles.fieldLabel,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        FIRST NAME
                      </Text>
                      <TextInput
                        value={cFirstName}
                        onChangeText={setCFirstName}
                        placeholder="Jane"
                        placeholderTextColor={colors.mutedForeground}
                        style={[
                          styles.input,
                          {
                            color: colors.foreground,
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.fieldWrap}>
                      <Text
                        style={[
                          styles.fieldLabel,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        ROLE
                      </Text>
                      <TextInput
                        value={cRole}
                        onChangeText={setCRole}
                        placeholder="Support Person, Sister, Friend…"
                        placeholderTextColor={colors.mutedForeground}
                        style={[
                          styles.input,
                          {
                            color: colors.foreground,
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.fieldWrap}>
                      <Text
                        style={[
                          styles.fieldLabel,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        PHONE
                      </Text>
                      <TextInput
                        value={cPhone}
                        onChangeText={(v) => setCPhone(formatPhone(v))}
                        placeholder="(555) 000-0000"
                        placeholderTextColor={colors.mutedForeground}
                        keyboardType="phone-pad"
                        style={[
                          styles.input,
                          {
                            color: colors.foreground,
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                          },
                        ]}
                      />
                    </View>
                    <View style={styles.contactFormActions}>
                      <TouchableOpacity
                        onPress={handleSaveContact}
                        disabled={
                          updateContactMutation.isPending ||
                          !cFirstName.trim() ||
                          !cRole.trim() ||
                          !cPhone.trim()
                        }
                        style={[
                          styles.contactSaveBtn,
                          { backgroundColor: colors.primary },
                          (updateContactMutation.isPending ||
                            !cFirstName.trim() ||
                            !cRole.trim() ||
                            !cPhone.trim()) && { opacity: 0.5 },
                        ]}
                      >
                        <Text style={styles.contactSaveBtnText}>
                          {updateContactMutation.isPending ? "Saving…" : "Save"}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleCancelContact}
                        style={[
                          styles.contactCancelBtn,
                          { borderColor: colors.border },
                        ]}
                      >
                        <Text
                          style={[
                            styles.contactCancelBtnText,
                            { color: colors.foreground },
                          ]}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View
                    key={c.id}
                    style={[
                      styles.contactRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.contactName,
                          { color: colors.foreground },
                        ]}
                      >
                        {c.firstName}
                      </Text>
                      <Text
                        style={[
                          styles.contactRole,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {c.role}
                      </Text>
                    </View>
                    <CallButton phone={c.phone} />
                    <TouchableOpacity
                      onPress={() => handleEditContact(c)}
                      style={[
                        styles.iconBtn,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="pencil-outline"
                        size={16}
                        color={colors.mutedForeground}
                      />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => handleDeleteContact(c)}
                      style={[
                        styles.iconBtn,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={16}
                        color={colors.destructive}
                      />
                    </TouchableOpacity>
                  </View>
                ),
              )}

              {addingContact && (
                <View style={styles.contactForm}>
                  <View style={styles.fieldWrap}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      FIRST NAME
                    </Text>
                    <TextInput
                      value={cFirstName}
                      onChangeText={setCFirstName}
                      placeholder="Jane"
                      placeholderTextColor={colors.mutedForeground}
                      style={[
                        styles.input,
                        {
                          color: colors.foreground,
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      ROLE
                    </Text>
                    <TextInput
                      value={cRole}
                      onChangeText={setCRole}
                      placeholder="Support Person, Sister, Friend…"
                      placeholderTextColor={colors.mutedForeground}
                      style={[
                        styles.input,
                        {
                          color: colors.foreground,
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.fieldWrap}>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      PHONE
                    </Text>
                    <TextInput
                      value={cPhone}
                      onChangeText={(v) => setCPhone(formatPhone(v))}
                      placeholder="(555) 000-0000"
                      placeholderTextColor={colors.mutedForeground}
                      keyboardType="phone-pad"
                      style={[
                        styles.input,
                        {
                          color: colors.foreground,
                          backgroundColor: colors.background,
                          borderColor: colors.border,
                        },
                      ]}
                    />
                  </View>
                  <View style={styles.contactFormActions}>
                    <TouchableOpacity
                      onPress={handleSaveContact}
                      disabled={
                        createContactMutation.isPending ||
                        !cFirstName.trim() ||
                        !cRole.trim() ||
                        !cPhone.trim()
                      }
                      style={[
                        styles.contactSaveBtn,
                        { backgroundColor: colors.primary },
                        (createContactMutation.isPending ||
                          !cFirstName.trim() ||
                          !cRole.trim() ||
                          !cPhone.trim()) && { opacity: 0.5 },
                      ]}
                    >
                      <Text style={styles.contactSaveBtnText}>
                        {createContactMutation.isPending ? "Saving…" : "Save"}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleCancelContact}
                      style={[
                        styles.contactCancelBtn,
                        { borderColor: colors.border },
                      ]}
                    >
                      <Text
                        style={[
                          styles.contactCancelBtnText,
                          { color: colors.foreground },
                        ]}
                      >
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {!addingContact && editingContactId === null && (
                <TouchableOpacity
                  onPress={() => setAddingContact(true)}
                  style={[styles.addContactBtn, { borderColor: colors.border }]}
                >
                  <Ionicons
                    name="add-circle-outline"
                    size={18}
                    color={colors.primary}
                  />
                  <Text
                    style={[
                      styles.addContactBtnText,
                      { color: colors.primary },
                    ]}
                  >
                    Add a contact
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : null}

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
  unitBtn: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  unitBtnText: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
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
  emptyHint: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 19,
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contactName: {
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  contactRole: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  contactForm: {
    gap: 10,
  },
  contactFormActions: {
    flexDirection: "row",
    gap: 8,
  },
  contactSaveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: "center",
  },
  contactSaveBtnText: {
    color: "#fff",
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  contactCancelBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 11,
    alignItems: "center",
  },
  contactCancelBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  addContactBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 11,
    borderStyle: "dashed",
  },
  addContactBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  summaryCard: {
    borderWidth: 1,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 6,
    paddingVertical: 10,
  },
  summaryRowTop: {
    borderTopWidth: 1,
  },
  summaryLabelWrap: {
    gap: 4,
  },
  summaryLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  summaryValue: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  methodBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    alignSelf: "flex-start",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 20,
  },
  methodBadgeText: {
    fontSize: 11,
    fontFamily: "Inter_500Medium",
  },
  deliveryDateBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  deliveryDateBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  clearDeliveryBtn: {
    marginLeft: 4,
  },
  summaryHint: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    marginTop: 4,
    lineHeight: 16,
    fontStyle: "italic",
  },
  pickerOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  pickerSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 32,
  },
  pickerHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
  },
  pickerTitle: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  pickerDone: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
});
