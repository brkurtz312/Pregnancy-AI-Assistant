import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import { type Href, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import {
  KeyboardAvoidingView,
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
  useUpdateProfile,
  useCreateContact,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { formatPhone } from "@/lib/phone";

type DeliveryCenterType = "hospital" | "birthing_center";

function SectionHeader({
  icon,
  title,
}: {
  icon: React.ComponentProps<typeof Ionicons>["name"];
  title: string;
}) {
  const colors = useColors();
  return (
    <View style={styles.sectionHeader}>
      <Ionicons name={icon} size={19} color={colors.primary} />
      <Text style={[styles.sectionTitle, { color: colors.foreground }]}>
        {title}
      </Text>
    </View>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  keyboardType?: "default" | "phone-pad" | "number-pad";
}) {
  const colors = useColors();
  return (
    <View style={styles.fieldWrap}>
      <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
        {label}
      </Text>
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
          },
        ]}
      />
    </View>
  );
}

type ContactDraft = { firstName: string; role: string; phone: string };

export default function OnboardingScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isSignedIn } = useAuth();
  const updateMutation = useUpdateProfile();
  const createContactMutation = useCreateContact();

  const [contacts, setContacts] = useState<ContactDraft[]>([]);
  const [addingContact, setAddingContact] = useState(false);
  const [cFirstName, setCFirstName] = useState("");
  const [cRole, setCRole] = useState("");
  const [cPhone, setCPhone] = useState("");

  const [firstName, setFirstName] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [prePregnancyWeight, setPrePregnancyWeight] = useState("");
  const [weightUnit, setWeightUnit] = useState<"lbs" | "kg">("lbs");
  const [providerName, setProviderName] = useState("");
  const [providerAddress, setProviderAddress] = useState("");
  const [providerPhone, setProviderPhone] = useState("");
  const [deliveryCenterType, setDeliveryCenterType] =
    useState<DeliveryCenterType>("hospital");
  const [hospitalName, setHospitalName] = useState("");
  const [hospitalAddress, setHospitalAddress] = useState("");
  const [hospitalPhone, setHospitalPhone] = useState("");

  const goToApp = useCallback(() => {
    router.replace("/" as Href);
  }, [router]);

  const handleAddContact = useCallback(() => {
    if (!cFirstName.trim() || !cRole.trim() || !cPhone.trim()) return;
    setContacts((prev) => [
      ...prev,
      { firstName: cFirstName.trim(), role: cRole.trim(), phone: cPhone },
    ]);
    setCFirstName("");
    setCRole("");
    setCPhone("");
    setAddingContact(false);
  }, [cFirstName, cRole, cPhone]);

  const handleRemoveContact = useCallback((idx: number) => {
    setContacts((prev) => prev.filter((_, i) => i !== idx));
  }, []);

  const handleSave = useCallback(async () => {
    if (!isSignedIn) {
      goToApp();
      return;
    }
    try {
      await updateMutation.mutateAsync({
        data: {
          firstName: firstName.trim() || null,
          zipCode: zipCode.trim() || null,
          prePregnancyWeight: prePregnancyWeight.trim()
            ? `${prePregnancyWeight.trim()} ${weightUnit}`
            : null,
          providerName: providerName.trim() || null,
          providerAddress: providerAddress.trim() || null,
          providerPhone: providerPhone.trim() || null,
          deliveryCenterType,
          hospitalName: hospitalName.trim() || null,
          hospitalAddress: hospitalAddress.trim() || null,
          hospitalPhone: hospitalPhone.trim() || null,
        },
      });
      await Promise.all(
        contacts.map((c) =>
          createContactMutation.mutateAsync({
            data: { firstName: c.firstName, role: c.role, phone: c.phone },
          }),
        ),
      );
    } finally {
      goToApp();
    }
  }, [
    isSignedIn,
    firstName,
    zipCode,
    prePregnancyWeight,
    weightUnit,
    providerName,
    providerAddress,
    providerPhone,
    deliveryCenterType,
    hospitalName,
    hospitalAddress,
    hospitalPhone,
    contacts,
    updateMutation,
    createContactMutation,
    goToApp,
  ]);

  const topPad = Platform.OS === "web" ? 40 : insets.top + 12;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 16;

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.background }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{
          paddingTop: topPad,
          paddingBottom: bottomPad + 24,
          paddingHorizontal: 20,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerIcon}>
          <Ionicons name="heart" size={26} color="#fff" />
        </View>
        <Text style={[styles.title, { color: colors.foreground }]}>
          Let's get you set up
        </Text>
        <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>
          A few quick details help us point you to resources near you.
        </Text>

        <View
          style={[
            styles.noticeCard,
            {
              backgroundColor: colors.primary + "14",
              borderColor: colors.primary + "33",
            },
          ]}
        >
          <Ionicons
            name="shield-checkmark-outline"
            size={20}
            color={colors.primary}
          />
          <Text style={[styles.noticeText, { color: colors.foreground }]}>
            This information is not being collected or shared — it's stored for
            your use only, to help the app find local resources for you. You can
            view or edit it anytime in the My Info tab.
          </Text>
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <SectionHeader icon="person-outline" title="About You" />
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
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              PRE-PREGNANCY WEIGHT
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
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
                        weightUnit === unit ? colors.primary : colors.card,
                      borderColor:
                        weightUnit === unit ? colors.primary : colors.border,
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
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <SectionHeader icon="person-circle-outline" title="My OB Provider" />
          <Field
            label="NAME"
            value={providerName}
            onChange={setProviderName}
            placeholder="Dr. Jane Smith"
          />
          <Field
            label="ADDRESS"
            value={providerAddress}
            onChange={setProviderAddress}
            placeholder="123 Main St, City, State 00000"
          />
          <Field
            label="PHONE"
            value={providerPhone}
            onChange={(v) => setProviderPhone(formatPhone(v))}
            placeholder="(555) 000-0000"
            keyboardType="phone-pad"
          />
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <SectionHeader icon="business-outline" title="My Delivery Center" />

          <View style={styles.fieldWrap}>
            <Text
              style={[styles.fieldLabel, { color: colors.mutedForeground }]}
            >
              TYPE
            </Text>
            <View style={styles.toggleRow}>
              {(
                [
                  { key: "hospital", label: "Hospital" },
                  { key: "birthing_center", label: "Birthing Center" },
                ] as { key: DeliveryCenterType; label: string }[]
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
                        borderColor: active ? colors.primary : colors.border,
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
            label="ADDRESS"
            value={hospitalAddress}
            onChange={setHospitalAddress}
            placeholder="123 Main St, City, State 00000"
          />
          <Field
            label="PHONE"
            value={hospitalPhone}
            onChange={(v) => setHospitalPhone(formatPhone(v))}
            placeholder="(555) 000-0000"
            keyboardType="phone-pad"
          />
        </View>

        <View
          style={[
            styles.card,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <SectionHeader icon="call-outline" title="My Calling List" />
          <Text style={[styles.fieldLabel, { color: colors.mutedForeground }]}>
            Optional — add people you may want to call during labor or after.
          </Text>

          {contacts.map((c, idx) => (
            <View
              key={idx}
              style={[styles.contactRow, { borderBottomColor: colors.border }]}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={[styles.contactName, { color: colors.foreground }]}
                >
                  {c.firstName}
                </Text>
                <Text
                  style={[
                    styles.contactRole,
                    { color: colors.mutedForeground },
                  ]}
                >
                  {c.role} · {c.phone}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveContact(idx)}
                style={[
                  styles.removeBtn,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                  },
                ]}
              >
                <Text
                  style={{
                    color: colors.destructive,
                    fontSize: 13,
                    fontFamily: "Inter_500Medium",
                  }}
                >
                  Remove
                </Text>
              </TouchableOpacity>
            </View>
          ))}

          {addingContact ? (
            <View style={styles.contactForm}>
              <Field
                label="FIRST NAME"
                value={cFirstName}
                onChange={setCFirstName}
                placeholder="Jane"
              />
              <Field
                label="ROLE"
                value={cRole}
                onChange={setCRole}
                placeholder="Support Person, Sister, Friend…"
              />
              <Field
                label="PHONE"
                value={cPhone}
                onChange={(v) => setCPhone(formatPhone(v))}
                placeholder="(555) 000-0000"
                keyboardType="phone-pad"
              />
              <View style={styles.contactFormActions}>
                <TouchableOpacity
                  onPress={handleAddContact}
                  disabled={
                    !cFirstName.trim() || !cRole.trim() || !cPhone.trim()
                  }
                  style={[
                    styles.contactSaveBtn,
                    { backgroundColor: colors.primary },
                    (!cFirstName.trim() || !cRole.trim() || !cPhone.trim()) && {
                      opacity: 0.5,
                    },
                  ]}
                >
                  <Text style={styles.contactSaveBtnText}>Add</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    setAddingContact(false);
                    setCFirstName("");
                    setCRole("");
                    setCPhone("");
                  }}
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
            <TouchableOpacity
              onPress={() => setAddingContact(true)}
              style={[styles.addContactBtn, { borderColor: colors.border }]}
            >
              <Text
                style={[styles.addContactBtnText, { color: colors.primary }]}
              >
                + Add a person
              </Text>
            </TouchableOpacity>
          )}
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={updateMutation.isPending}
          style={[
            styles.saveBtn,
            {
              backgroundColor: colors.primary,
              opacity: updateMutation.isPending ? 0.7 : 1,
            },
          ]}
        >
          <Text style={styles.saveBtnText}>
            {updateMutation.isPending ? "Saving…" : "Save & Continue"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.skipBtn} onPress={goToApp}>
          <Text style={[styles.skipBtnText, { color: colors.mutedForeground }]}>
            Skip for now
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: "#d16b8f",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  title: {
    fontSize: 24,
    fontFamily: "Inter_700Bold",
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    marginBottom: 18,
  },
  noticeCard: {
    flexDirection: "row",
    gap: 10,
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    alignItems: "flex-start",
  },
  noticeText: {
    flex: 1,
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    lineHeight: 18,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
    gap: 16,
    marginBottom: 16,
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
  input: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
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
  saveBtn: {
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  saveBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  skipBtn: {
    alignItems: "center",
    paddingVertical: 14,
  },
  skipBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingBottom: 10,
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
  removeBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
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
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    alignItems: "center",
  },
  addContactBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
