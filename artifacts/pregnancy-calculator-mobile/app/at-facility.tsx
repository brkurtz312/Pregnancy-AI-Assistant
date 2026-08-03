import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "@clerk/expo";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import React, { useState, useEffect, useCallback } from "react";
import {
  Alert,
  Linking,
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
  getListContactsQueryKey,
  useGetProfile,
  useListContacts,
} from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import {
  loadBabyNames,
  saveBabyNames,
  loadFacilityChecklist,
  saveFacilityChecklist,
  type ChecklistItem,
} from "@/lib/location-mode";
import { ResponsiveContainer } from "@/components/ResponsiveContainer";

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

export default function AtFacilityScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isSignedIn } = useAuth();

  const { data: profile } = useGetProfile({
    query: { enabled: !!isSignedIn, queryKey: getGetProfileQueryKey() },
  });
  const { data: contactsData } = useListContacts({
    query: { enabled: !!isSignedIn, queryKey: getListContactsQueryKey() },
  });
  const contacts = contactsData?.items ?? [];

  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [babyNames, setBabyNames] = useState<string[]>([]);
  const [newName, setNewName] = useState("");
  const [addingName, setAddingName] = useState(false);

  useEffect(() => {
    loadFacilityChecklist().then(setChecklist);
    loadBabyNames().then(setBabyNames);
  }, []);

  const toggleChecklist = useCallback(
    async (id: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const updated = checklist.map((c) =>
        c.id === id ? { ...c, checked: !c.checked } : c,
      );
      setChecklist(updated);
      await saveFacilityChecklist(updated);
    },
    [checklist],
  );

  const resetChecklist = useCallback(async () => {
    Alert.alert("Reset Checklist", "Uncheck all items?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        onPress: async () => {
          const updated = checklist.map((c) => ({ ...c, checked: false }));
          setChecklist(updated);
          await saveFacilityChecklist(updated);
        },
      },
    ]);
  }, [checklist]);

  const addName = useCallback(async () => {
    const name = newName.trim();
    if (!name) return;
    const updated = [...babyNames, name];
    setBabyNames(updated);
    await saveBabyNames(updated);
    setNewName("");
    setAddingName(false);
  }, [newName, babyNames]);

  const removeName = useCallback(
    async (name: string) => {
      Alert.alert("Remove Name", `Remove "${name}" from your list?`, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const updated = babyNames.filter((n) => n !== name);
            setBabyNames(updated);
            await saveBabyNames(updated);
          },
        },
      ]);
    },
    [babyNames],
  );

  const facilityName =
    profile?.hospitalName ??
    (profile?.deliveryCenterType === "birthing_center"
      ? "Your Birthing Center"
      : "Your Hospital");
  const facilityPhone = profile?.hospitalPhone ?? "";
  const facilityAddress = profile?.hospitalAddress ?? "";
  const checkedCount = checklist.filter((c) => c.checked).length;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: "#4a7ab5",
            paddingTop: (Platform.OS === "web" ? 16 : insets.top) + 16,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.backBtn}
        >
          <Ionicons name="chevron-back" size={22} color="#fff" />
        </TouchableOpacity>
        <View style={styles.headerBadge}>
          <Ionicons name="heart-outline" size={14} color="#4a7ab5" />
          <Text style={[styles.headerBadgeText, { color: "#4a7ab5" }]}>
            Labor &amp; Delivery Mode
          </Text>
        </View>
        <Text style={styles.headerTitle}>{facilityName}</Text>
        {facilityAddress ? (
          <Text style={styles.headerSub} numberOfLines={1}>
            {facilityAddress}
          </Text>
        ) : null}
        {facilityPhone ? (
          <TouchableOpacity
            style={styles.callChip}
            onPress={() =>
              Linking.openURL(`tel:${facilityPhone.replace(/\D/g, "")}`)
            }
          >
            <Ionicons name="call-outline" size={14} color="#fff" />
            <Text style={styles.callChipText}>
              {formatPhone(facilityPhone)}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + 40 },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <ResponsiveContainer style={{ paddingHorizontal: 16 }}>
          {/* Quick Actions */}
          <Animated.View
            entering={FadeInDown.delay(40).duration(350)}
            style={styles.quickRow}
          >
            <TouchableOpacity
              style={[
                styles.quickBtn,
                { backgroundColor: "#4a7ab515", borderColor: "#4a7ab530" },
              ]}
              onPress={() => router.push("/birth-plan")}
            >
              <Ionicons
                name="document-text-outline"
                size={20}
                color="#4a7ab5"
              />
              <Text style={[styles.quickLabel, { color: colors.foreground }]}>
                Birth Plan
              </Text>
              <Text
                style={[styles.quickSub, { color: colors.mutedForeground }]}
              >
                Share with staff
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.quickBtn,
                { backgroundColor: "#4a7ab515", borderColor: "#4a7ab530" },
              ]}
              onPress={() => router.push("/(tabs)/tools")}
            >
              <Ionicons name="pulse-outline" size={20} color="#4a7ab5" />
              <Text style={[styles.quickLabel, { color: colors.foreground }]}>
                Contractions
              </Text>
              <Text
                style={[styles.quickSub, { color: colors.mutedForeground }]}
              >
                Timer &amp; tracker
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.quickBtn,
                { backgroundColor: "#4a7ab515", borderColor: "#4a7ab530" },
              ]}
              onPress={() => router.push("/hospital-bag")}
            >
              <Ionicons name="briefcase-outline" size={20} color="#4a7ab5" />
              <Text style={[styles.quickLabel, { color: colors.foreground }]}>
                Hospital Bag
              </Text>
              <Text
                style={[styles.quickSub, { color: colors.mutedForeground }]}
              >
                Packing list
              </Text>
            </TouchableOpacity>
          </Animated.View>

          {/* Arrival Checklist */}
          <Animated.View entering={FadeInDown.delay(80).duration(350)}>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={18}
                    color="#4a7ab5"
                  />
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                  >
                    Arrival Checklist
                  </Text>
                </View>
                <Text style={[styles.progressText, { color: "#4a7ab5" }]}>
                  {checkedCount}/{checklist.length}
                </Text>
              </View>

              {checklist.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checkRow}
                  onPress={() => toggleChecklist(item.id)}
                >
                  <Ionicons
                    name={item.checked ? "checkbox" : "square-outline"}
                    size={22}
                    color={item.checked ? "#4a7ab5" : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.checkText,
                      {
                        color: item.checked
                          ? colors.mutedForeground
                          : colors.foreground,
                        textDecorationLine: item.checked
                          ? "line-through"
                          : "none",
                      },
                    ]}
                  >
                    {item.text}
                  </Text>
                </TouchableOpacity>
              ))}

              {checkedCount > 0 && (
                <TouchableOpacity
                  style={[styles.resetBtn, { borderColor: colors.border }]}
                  onPress={resetChecklist}
                >
                  <Text
                    style={[
                      styles.resetText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    Reset all
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Animated.View>

          {/* Emergency Contacts */}
          <Animated.View entering={FadeInDown.delay(120).duration(350)}>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={[styles.cardTitleRow, { marginBottom: 12 }]}>
                <Ionicons name="people-outline" size={18} color="#4a7ab5" />
                <Text style={[styles.cardTitle, { color: colors.foreground }]}>
                  Emergency Contacts
                </Text>
              </View>

              {contacts.length === 0 ? (
                <View>
                  <Text
                    style={[
                      styles.emptyText,
                      { color: colors.mutedForeground },
                    ]}
                  >
                    No contacts saved yet.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push("/(tabs)/profile")}
                    style={[styles.addContactBtn, { borderColor: "#4a7ab5" }]}
                  >
                    <Text style={[styles.addContactText, { color: "#4a7ab5" }]}>
                      Add contacts in My Info →
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                contacts.map((c) => (
                  <View
                    key={c.id}
                    style={[
                      styles.contactRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <View style={styles.contactAvatar}>
                      <Text style={styles.contactInitial}>
                        {c.firstName.charAt(0).toUpperCase()}
                      </Text>
                    </View>
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
                    <TouchableOpacity
                      style={[styles.callBtn, { backgroundColor: "#4a7ab515" }]}
                      onPress={() =>
                        Linking.openURL(`tel:${c.phone.replace(/\D/g, "")}`)
                      }
                    >
                      <Ionicons name="call" size={16} color="#4a7ab5" />
                      <Text style={[styles.callBtnText, { color: "#4a7ab5" }]}>
                        Call
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {/* Provider quick call */}
              {profile?.providerPhone ? (
                <View
                  style={[
                    styles.contactRow,
                    { borderBottomColor: colors.border },
                  ]}
                >
                  <View
                    style={[
                      styles.contactAvatar,
                      { backgroundColor: "#4a7ab520" },
                    ]}
                  >
                    <Ionicons name="medical" size={14} color="#4a7ab5" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.contactName, { color: colors.foreground }]}
                    >
                      {profile.providerName ?? "My Provider"}
                    </Text>
                    <Text
                      style={[
                        styles.contactRole,
                        { color: colors.mutedForeground },
                      ]}
                    >
                      OB / Midwife
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={[styles.callBtn, { backgroundColor: "#4a7ab515" }]}
                    onPress={() =>
                      Linking.openURL(
                        `tel:${profile.providerPhone!.replace(/\D/g, "")}`,
                      )
                    }
                  >
                    <Ionicons name="call" size={16} color="#4a7ab5" />
                    <Text style={[styles.callBtnText, { color: "#4a7ab5" }]}>
                      Call
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </View>
          </Animated.View>

          {/* Baby Name Shortlist */}
          <Animated.View entering={FadeInDown.delay(160).duration(350)}>
            <View
              style={[
                styles.card,
                { backgroundColor: colors.card, borderColor: colors.border },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.cardTitleRow}>
                  <Ionicons name="star-outline" size={18} color="#4a7ab5" />
                  <Text
                    style={[styles.cardTitle, { color: colors.foreground }]}
                  >
                    Baby Name Shortlist
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setAddingName(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Ionicons name="add-circle" size={22} color="#4a7ab5" />
                </TouchableOpacity>
              </View>

              {babyNames.length === 0 && !addingName ? (
                <Text
                  style={[styles.emptyText, { color: colors.mutedForeground }]}
                >
                  No names yet. Tap + to add your favorites.
                </Text>
              ) : (
                babyNames.map((name) => (
                  <View
                    key={name}
                    style={[
                      styles.nameRow,
                      { borderBottomColor: colors.border },
                    ]}
                  >
                    <Ionicons name="sparkles" size={16} color="#4a7ab5" />
                    <Text
                      style={[styles.nameText, { color: colors.foreground }]}
                    >
                      {name}
                    </Text>
                    <TouchableOpacity
                      onPress={() => removeName(name)}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons
                        name="close-circle-outline"
                        size={18}
                        color={colors.mutedForeground}
                      />
                    </TouchableOpacity>
                  </View>
                ))
              )}

              {addingName && (
                <View
                  style={[styles.addRow, { borderTopColor: colors.border }]}
                >
                  <TextInput
                    style={[
                      styles.addInput,
                      {
                        color: colors.foreground,
                        borderColor: colors.border,
                        backgroundColor: colors.background,
                      },
                    ]}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Enter a name…"
                    placeholderTextColor={colors.mutedForeground}
                    autoFocus
                    onSubmitEditing={addName}
                    returnKeyType="done"
                    autoCapitalize="words"
                  />
                  <TouchableOpacity
                    style={[styles.addSaveBtn, { backgroundColor: "#4a7ab5" }]}
                    onPress={addName}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontFamily: "Inter_600SemiBold",
                        fontSize: 13,
                      }}
                    >
                      Add
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      setAddingName(false);
                      setNewName("");
                    }}
                  >
                    <Ionicons
                      name="close-circle"
                      size={22}
                      color={colors.mutedForeground}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Animated.View>

          {/* Reassurance note */}
          <Animated.View entering={FadeInDown.delay(200).duration(350)}>
            <View
              style={[
                styles.reassureBox,
                { backgroundColor: "#4a7ab510", borderColor: "#4a7ab525" },
              ]}
            >
              <Ionicons name="heart" size={16} color="#4a7ab5" />
              <Text
                style={[styles.reassureText, { color: colors.mutedForeground }]}
              >
                You&apos;re exactly where you need to be. You&apos;ve got this.
              </Text>
            </View>
          </Animated.View>

          {/* Exit mode */}
          <Animated.View entering={FadeInDown.delay(240).duration(350)}>
            <TouchableOpacity
              style={styles.exitBtn}
              onPress={() => router.replace("/(tabs)")}
            >
              <Ionicons
                name="exit-outline"
                size={18}
                color={colors.mutedForeground}
              />
              <Text
                style={[styles.exitBtnText, { color: colors.mutedForeground }]}
              >
                Exit Labor &amp; Delivery Mode
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </ResponsiveContainer>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  headerBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#fff",
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    marginBottom: 8,
  },
  headerBadgeText: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    color: "#fff",
    marginBottom: 2,
  },
  headerSub: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    color: "rgba(255,255,255,0.75)",
    marginBottom: 10,
  },
  callChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  callChipText: {
    color: "#fff",
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  scroll: {
    paddingTop: 16,
    gap: 12,
  },
  quickRow: {
    flexDirection: "row",
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    alignItems: "center",
    gap: 3,
  },
  quickLabel: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
  },
  quickSub: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  progressText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 7,
  },
  checkText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    flex: 1,
  },
  resetBtn: {
    borderTopWidth: 1,
    marginTop: 8,
    paddingTop: 10,
    alignItems: "center",
  },
  resetText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  emptyText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    fontStyle: "italic",
    textAlign: "center",
    paddingVertical: 8,
  },
  addContactBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    marginTop: 8,
  },
  addContactText: {
    fontSize: 13,
    fontFamily: "Inter_500Medium",
  },
  contactRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  contactAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#4a7ab520",
    alignItems: "center",
    justifyContent: "center",
  },
  contactInitial: {
    fontSize: 16,
    fontFamily: "Inter_700Bold",
    color: "#4a7ab5",
  },
  contactName: {
    fontSize: 14,
    fontFamily: "Inter_600SemiBold",
  },
  contactRole: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 1,
  },
  callBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  callBtnText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  nameText: {
    flex: 1,
    fontSize: 15,
    fontFamily: "Inter_500Medium",
  },
  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  addInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
  },
  addSaveBtn: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  reassureBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  reassureText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 20,
    fontStyle: "italic",
  },
  exitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 32,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#00000015",
    backgroundColor: "#00000008",
  },
  exitBtnText: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
  },
});
