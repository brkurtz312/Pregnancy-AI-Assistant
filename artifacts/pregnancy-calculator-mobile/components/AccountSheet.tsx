import { useAuth, useUser } from "@clerk/expo";
import { useAppAuth } from "@/hooks/useAppAuth";
import { clearDemoToken } from "@/lib/demo-session";
import { Ionicons } from "@expo/vector-icons";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, useDeleteAccount } from "@workspace/api-client-react";

import { useColors } from "@/hooks/useColors";
import { usePass } from "@/hooks/usePass";
import {
  isTestStore,
  isUserCancelledError,
  PURCHASE_IDENTITY_ERROR,
  REVENUECAT_ENTITLEMENT_IDENTIFIER,
  useSubscription,
} from "@/lib/revenuecat";
import { cancelAllAppointmentReminders } from "@/lib/appointment-reminders";
import { clearSignedOutUserData } from "@/lib/session-cleanup";
import { APP_STORE_URL } from "@/lib/app-store";
import { toErrorCode, track, type FunnelSource } from "@/lib/analytics";

// The Expo web build only, which has no in-app purchase. Every native path
// renders `subscription.passPackage?.product.priceString` — the live store
// price — and must keep doing so, or the app can advertise one number while
// StoreKit charges another.
const PASS_PRICE = "$9.99";

/**
 * Keeps the one purchase failure the generic message would mislead about.
 *
 * "Please try again" is right for a declined card or a dropped connection. It
 * is wrong when the purchase was stopped because it could not be attached to
 * the account: retrying in the same state does the same thing, and the useful
 * instruction is about the connection or the sign-in, not the tap.
 */
/** Records a billing failure; never throws, whatever the payload. */
function logBillingFailure(context: string, err: unknown): void {
  let detail: string;
  try {
    detail = JSON.stringify(err) ?? String(err);
  } catch {
    detail = String(err);
  }
  console.error(
    `${context} failed:`,
    err instanceof Error ? err.message : detail,
    detail,
  );
}

function purchaseErrorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message === PURCHASE_IDENTITY_ERROR
    ? PURCHASE_IDENTITY_ERROR
    : fallback;
}

function redeemErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401)
      return "Session expired. Please sign out and sign back in, then try again.";
    if (err.status === 429)
      return "Too many attempts. Please wait a few minutes and try again.";
    if (err.status === 503) return "Code redemption isn't available right now.";
    if (err.status === 403) return "That access code isn't valid.";
  }
  return "That access code isn't valid.";
}

export function AccountSheet({
  visible,
  onClose,
  source = "other",
}: {
  visible: boolean;
  onClose: () => void;
  /** Where the sheet was opened from, for funnel counting. */
  source?: FunnelSource;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { signOut } = useAuth();
  // A demo session is authenticated without Clerk, so the signed-in state
  // comes from the app-level hook rather than Clerk directly.
  const { isSignedIn, isDemo } = useAppAuth();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const pass = usePass();
  const subscription = useSubscription();
  const deleteAccountMutation = useDeleteAccount();

  const [showRedeem, setShowRedeem] = React.useState(false);
  const [code, setCode] = React.useState("");
  const [redeemError, setRedeemError] = React.useState<string | null>(null);
  const [confirmPurchase, setConfirmPurchase] = React.useState(false);
  const [purchaseError, setPurchaseError] = React.useState<string | null>(null);
  // A restore that finds nothing is not an error, and saying nothing at all
  // is indistinguishable from a button that did not work.
  const [restoreNotice, setRestoreNotice] = React.useState<string | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [signOutError, setSignOutError] = React.useState<string | null>(null);
  const [confirmAccountDeletion, setConfirmAccountDeletion] =
    React.useState(false);
  const [deleteAccountError, setDeleteAccountError] = React.useState<
    string | null
  >(null);

  // iOS/Android must use the in-app purchase (App Store/Play rules). The Expo
  // web build has neither an in-app purchase nor, since
  // docs/stripe-removal-plan.md, a web checkout — it points at the App Store.
  // Price is read from the live RevenueCat offering on native, never
  // hardcoded, so store-localized pricing is always correct.
  const isNative = Platform.OS !== "web";
  const nativePrice = subscription.passPackage?.product.priceString ?? null;
  const isPurchaseBusy = subscription.isPurchasing || pass.isReconciling;

  // Funnel: count each opening of the sheet once, after pass status has
  // loaded, and only for someone who could still buy — a pass holder opening
  // their account is not a paywall view.
  const signedIn = !!isSignedIn;
  const viewTrackedRef = React.useRef(false);
  React.useEffect(() => {
    if (!visible) {
      viewTrackedRef.current = false;
      return;
    }
    if (viewTrackedRef.current || pass.isLoading) return;
    viewTrackedRef.current = true;
    if (signedIn && pass.hasPass) return;
    track("paywall_viewed", { signedIn, source });
    if (!signedIn) track("signin_required_for_purchase", { signedIn });
  }, [visible, pass.isLoading, pass.hasPass, signedIn, source]);

  const handleNativePurchase = async () => {
    const pkg = subscription.passPackage;
    if (!pkg) {
      track("purchase_failed", { signedIn, errorCode: "no_package" });
      setPurchaseError("The pass isn't available right now. Please try again.");
      return;
    }
    setPurchaseError(null);
    track("purchase_started", { signedIn });
    let charged = false;
    try {
      await subscription.purchase(pkg);
      // The store has taken the payment. Count it here, before reconcile, so
      // a reconcile failure shows up as its own failure and not as a lost sale.
      charged = true;
      track("purchase_completed", { signedIn });
      await pass.reconcileRevenueCat();
      setConfirmPurchase(false);
      setPurchaseSuccess(true);
    } catch (err) {
      if (isUserCancelledError(err)) {
        track("purchase_cancelled", { signedIn });
        setConfirmPurchase(false);
        return;
      }
      track("purchase_failed", {
        signedIn,
        errorCode: charged
          ? "reconcile_failed"
          : err instanceof Error && err.message === PURCHASE_IDENTITY_ERROR
            ? "identity_failed"
            : toErrorCode(err),
      });
      logBillingFailure("Purchase", err);
      setPurchaseError(
        purchaseErrorMessage(
          err,
          "Purchase couldn't be completed. Please try again.",
        ),
      );
    }
  };

  const handleRestore = async () => {
    track("restore_tapped", { signedIn });
    setPurchaseError(null);
    setRestoreNotice(null);
    try {
      const info = await subscription.restore();
      await pass.reconcileRevenueCat();
      // Report the outcome either way. A restore that completes having found
      // no purchase changes nothing on screen, which reads exactly like a tap
      // that did nothing -- and "nothing to restore" is the expected result
      // when the purchase was made on a different account.
      const restored =
        info?.entitlements?.active?.[REVENUECAT_ENTITLEMENT_IDENTIFIER] !==
        undefined;
      setRestoreNotice(
        restored
          ? "Purchases restored."
          : "No previous purchase found for this Apple ID on this account.",
      );
    } catch (err) {
      logBillingFailure("Restore purchases", err);
      setPurchaseError(
        purchaseErrorMessage(
          err,
          "Couldn't restore purchases. Please try again.",
        ),
      );
    }
  };

  const goTo = (path: "/sign-in" | "/sign-up") => {
    onClose();
    router.push(path);
  };

  const handleRedeem = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      setRedeemError("Enter an access code.");
      return;
    }
    setRedeemError(null);
    try {
      await pass.redeemCode(trimmed);
      setShowRedeem(false);
      setCode("");
    } catch (err) {
      setRedeemError(redeemErrorMessage(err));
    }
  };

  const handleDeleteAccount = async () => {
    setDeleteAccountError(null);
    let accountDeleted = false;
    try {
      await deleteAccountMutation.mutateAsync();
      accountDeleted = true;
      await signOut();
      onClose();
    } catch {
      if (accountDeleted) {
        clearSignedOutUserData(queryClient, user?.id ?? null);
      }
      setDeleteAccountError(
        accountDeleted
          ? "Your account was deleted and this device's data was cleared, but we couldn't finish signing out. Please use Sign Out below to finish."
          : "We couldn't delete your account. Please check your connection and try again.",
      );
    }
  };

  const email =
    user?.primaryEmailAddress?.emailAddress ??
    user?.emailAddresses?.[0]?.emailAddress ??
    "Signed in";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.kav}
          pointerEvents="box-none"
        >
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
              },
            ]}
          >
            <View style={styles.handle} />

            <View style={styles.headerRow}>
              <Text style={[styles.heading, { color: colors.foreground }]}>
                {isSignedIn ? "Your Account" : "Account"}
              </Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}>
                <Ionicons
                  name="close"
                  size={24}
                  color={colors.mutedForeground}
                />
              </TouchableOpacity>
            </View>

            <ScrollView
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
            >
              {!isSignedIn ? (
                <View style={styles.section}>
                  <Text
                    style={[styles.body, { color: colors.mutedForeground }]}
                  >
                    Sign in to track your free AI questions and unlock the Full
                    Pregnancy Pass — purchases follow your account across web
                    and mobile.
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.primaryBtn,
                      { backgroundColor: colors.primary },
                    ]}
                    onPress={() => goTo("/sign-in")}
                  >
                    <Text style={styles.primaryBtnText}>Sign In</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.secondaryBtn,
                      {
                        borderColor: colors.border,
                        backgroundColor: colors.card,
                      },
                    ]}
                    onPress={() => goTo("/sign-up")}
                  >
                    <Text
                      style={[
                        styles.secondaryBtnText,
                        { color: colors.foreground },
                      ]}
                    >
                      Create Account
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.section}>
                  <View style={styles.emailRow}>
                    <Ionicons
                      name="person-circle-outline"
                      size={22}
                      color={colors.mutedForeground}
                    />
                    <Text
                      style={[styles.email, { color: colors.foreground }]}
                      numberOfLines={1}
                    >
                      {email}
                    </Text>
                  </View>

                  {pass.isLoading ? (
                    <View
                      style={[
                        styles.statusCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <ActivityIndicator color={colors.primary} />
                    </View>
                  ) : purchaseSuccess ? (
                    <View
                      style={[
                        styles.statusCard,
                        {
                          backgroundColor: "#f0fdf4",
                          borderColor: "#86efac",
                        },
                      ]}
                    >
                      <View style={styles.statusTitleRow}>
                        <Ionicons
                          name="checkmark-circle"
                          size={20}
                          color="#16a34a"
                        />
                        <Text
                          style={[styles.statusTitle, { color: "#14532d" }]}
                        >
                          You're all set!
                        </Text>
                      </View>
                      <Text style={[styles.statusBody, { color: "#166534" }]}>
                        The Full Pregnancy Pass is now active — unlimited
                        questions, on every device, forever.
                      </Text>
                      <TouchableOpacity
                        style={[
                          styles.primaryBtn,
                          { backgroundColor: "#16a34a" },
                        ]}
                        onPress={() => {
                          setPurchaseSuccess(false);
                          onClose();
                        }}
                      >
                        <Text style={styles.primaryBtnText}>
                          Start asking questions
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : pass.hasPass ? (
                    <View
                      style={[
                        styles.statusCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.primary,
                        },
                      ]}
                    >
                      <View style={styles.statusTitleRow}>
                        <Ionicons
                          name="sparkles"
                          size={18}
                          color={colors.primary}
                        />
                        <Text
                          style={[
                            styles.statusTitle,
                            { color: colors.foreground },
                          ]}
                        >
                          Full Pregnancy Pass active
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.statusBody,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Unlimited AI questions on every device.
                        {pass.freeUsed > 0
                          ? ` You've asked ${pass.freeUsed} question${pass.freeUsed === 1 ? "" : "s"} this week.`
                          : ""}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={[
                        styles.statusCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.border,
                        },
                      ]}
                    >
                      <View style={styles.statusTitleRow}>
                        <Ionicons
                          name="chatbubble-ellipses-outline"
                          size={18}
                          color={colors.primary}
                        />
                        <Text
                          style={[
                            styles.statusTitle,
                            { color: colors.foreground },
                          ]}
                        >
                          Free plan
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.statusBody,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        {pass.freeRemaining} of {pass.freeLimit} free AI
                        questions left this week.
                      </Text>
                      {isNative ? (
                        confirmPurchase ? (
                          <View style={styles.redeemBox}>
                            <Text
                              style={[
                                styles.statusTitle,
                                { color: colors.foreground },
                              ]}
                            >
                              Confirm your purchase
                            </Text>
                            <Text
                              style={[
                                styles.statusBody,
                                { color: colors.mutedForeground },
                              ]}
                            >
                              Full Pregnancy Pass
                              {nativePrice ? ` — ${nativePrice}` : ""}, one-time
                              purchase.
                              {isTestStore()
                                ? " This is a sandbox purchase — you won't be charged."
                                : ""}
                            </Text>
                            <TouchableOpacity
                              style={[
                                styles.primaryBtn,
                                { backgroundColor: colors.primary },
                              ]}
                              onPress={handleNativePurchase}
                              disabled={isPurchaseBusy}
                            >
                              {isPurchaseBusy ? (
                                <ActivityIndicator color="#fff" />
                              ) : (
                                <Text style={styles.primaryBtnText}>
                                  Confirm
                                  {nativePrice ? ` — ${nativePrice}` : ""}
                                </Text>
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => setConfirmPurchase(false)}
                              disabled={isPurchaseBusy}
                              hitSlop={8}
                            >
                              <Text
                                style={[
                                  styles.redeemLink,
                                  { color: colors.mutedForeground },
                                ]}
                              >
                                Cancel
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            style={[
                              styles.primaryBtn,
                              { backgroundColor: colors.primary },
                            ]}
                            onPress={() => {
                              track("pass_cta_tapped", { signedIn, source });
                              setPurchaseError(null);
                              setConfirmPurchase(true);
                            }}
                            disabled={
                              subscription.isLoading ||
                              !subscription.passPackage ||
                              isPurchaseBusy
                            }
                          >
                            {subscription.isLoading ? (
                              <ActivityIndicator color="#fff" />
                            ) : (
                              <Text style={styles.primaryBtnText}>
                                Get the Pass
                                {nativePrice ? ` — ${nativePrice}` : ""}
                              </Text>
                            )}
                          </TouchableOpacity>
                        )
                      ) : (
                        <TouchableOpacity
                          style={[
                            styles.primaryBtn,
                            { backgroundColor: colors.primary },
                          ]}
                          onPress={() => {
                            track("pass_cta_tapped", { signedIn, source });
                            void Linking.openURL(APP_STORE_URL);
                          }}
                        >
                          <Text style={styles.primaryBtnText}>
                            Get the Pass in the App Store — {PASS_PRICE}
                          </Text>
                        </TouchableOpacity>
                      )}

                      {purchaseError ? (
                        <Text
                          style={[
                            styles.redeemError,
                            { color: colors.destructive, textAlign: "center" },
                          ]}
                        >
                          {purchaseError}
                        </Text>
                      ) : null}

                      {restoreNotice ? (
                        <Text
                          style={[
                            styles.redeemError,
                            {
                              color: colors.mutedForeground,
                              textAlign: "center",
                            },
                          ]}
                        >
                          {restoreNotice}
                        </Text>
                      ) : null}

                      <Text
                        style={[
                          styles.fineprint,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        Unlimited AI questions, forever. One-time purchase.
                      </Text>

                      {isNative && !confirmPurchase ? (
                        <TouchableOpacity
                          onPress={handleRestore}
                          disabled={
                            subscription.isRestoring || pass.isReconciling
                          }
                          hitSlop={8}
                        >
                          <Text
                            style={[
                              styles.redeemLink,
                              { color: colors.primary },
                            ]}
                          >
                            {subscription.isRestoring
                              ? "Restoring…"
                              : "Restore purchases"}
                          </Text>
                        </TouchableOpacity>
                      ) : null}

                      {showRedeem ? (
                        <View style={styles.redeemBox}>
                          <TextInput
                            value={code}
                            onChangeText={(text) => {
                              setCode(text);
                              if (redeemError) setRedeemError(null);
                            }}
                            placeholder="Enter access code"
                            placeholderTextColor={colors.mutedForeground}
                            autoCapitalize="none"
                            autoCorrect={false}
                            style={[
                              styles.redeemInput,
                              {
                                borderColor: colors.border,
                                color: colors.foreground,
                                backgroundColor: colors.background,
                              },
                            ]}
                          />
                          {redeemError ? (
                            <Text
                              style={[
                                styles.redeemError,
                                { color: colors.destructive },
                              ]}
                            >
                              {redeemError}
                            </Text>
                          ) : null}
                          <TouchableOpacity
                            style={[
                              styles.secondaryBtn,
                              {
                                borderColor: colors.primary,
                                backgroundColor: colors.card,
                              },
                            ]}
                            onPress={handleRedeem}
                            disabled={pass.isRedeeming}
                          >
                            {pass.isRedeeming ? (
                              <ActivityIndicator color={colors.primary} />
                            ) : (
                              <Text
                                style={[
                                  styles.secondaryBtnText,
                                  { color: colors.primary },
                                ]}
                              >
                                Unlock access
                              </Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => setShowRedeem(true)}
                          hitSlop={8}
                        >
                          <Text
                            style={[
                              styles.redeemLink,
                              { color: colors.primary },
                            ]}
                          >
                            Have a developer code?
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {signOutError ? (
                    <Text
                      style={[
                        styles.redeemError,
                        { color: colors.destructive, textAlign: "center" },
                      ]}
                    >
                      {signOutError}
                    </Text>
                  ) : null}

                  <TouchableOpacity
                    style={styles.signOutBtn}
                    disabled={isSigningOut}
                    onPress={async () => {
                      setIsSigningOut(true);
                      setSignOutError(null);
                      try {
                        // Ends an App Review demo session. Harmless no-op for
                        // a normal Clerk session.
                        await clearDemoToken();
                        await signOut();
                        // Cancel appointment reminders only after sign-out
                        // succeeds so a failed sign-out (e.g. offline) does not
                        // silently wipe the still-signed-in user's reminders.
                        // AuthTokenBridge's session-transition effect also
                        // cancels these (covering the 401 auto-sign-out path),
                        // so this call is a harmless duplicate if that fires
                        // first.
                        cancelAllAppointmentReminders().catch(() => {});
                        pass.refresh();
                        onClose();
                        // Watch sign-out is handled centrally by AuthTokenBridge's
                        // session-transition effect (fires whenever Clerk session
                        // becomes null — covers both manual and 401 auto-sign-out).
                        // A second call here would send a duplicate signal to the
                        // Watch, so it has been removed.
                      } catch {
                        setIsSigningOut(false);
                        setSignOutError(
                          "Sign-out failed. Please check your connection and try again.",
                        );
                      }
                    }}
                  >
                    {isSigningOut ? (
                      <ActivityIndicator
                        size="small"
                        color={colors.destructive}
                      />
                    ) : (
                      <>
                        <Ionicons
                          name="log-out-outline"
                          size={18}
                          color={colors.destructive}
                        />
                        <Text
                          style={[
                            styles.signOutText,
                            { color: colors.destructive },
                          ]}
                        >
                          {isDemo ? "Exit Demo" : "Sign Out"}
                        </Text>
                      </>
                    )}
                  </TouchableOpacity>

                  {confirmAccountDeletion ? (
                    <View
                      style={[
                        styles.deleteAccountCard,
                        {
                          backgroundColor: colors.card,
                          borderColor: colors.destructive,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusTitle,
                          { color: colors.foreground },
                        ]}
                      >
                        Permanently delete your account?
                      </Text>
                      <Text
                        style={[
                          styles.statusBody,
                          { color: colors.mutedForeground },
                        ]}
                      >
                        This permanently deletes your profile, journal, tool
                        history, support contacts, and other app data. This
                        cannot be undone. Payment-provider purchase records may
                        be retained for legal and financial obligations.
                      </Text>
                      {deleteAccountError ? (
                        <Text
                          style={[
                            styles.redeemError,
                            { color: colors.destructive },
                          ]}
                        >
                          {deleteAccountError}
                        </Text>
                      ) : null}
                      <TouchableOpacity
                        testID="confirm-delete-account"
                        style={[
                          styles.deleteAccountConfirmBtn,
                          { backgroundColor: colors.destructive },
                        ]}
                        disabled={deleteAccountMutation.isPending}
                        onPress={handleDeleteAccount}
                      >
                        {deleteAccountMutation.isPending ? (
                          <ActivityIndicator color="#fff" />
                        ) : (
                          <Text style={styles.primaryBtnText}>
                            Permanently Delete Account
                          </Text>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        disabled={deleteAccountMutation.isPending}
                        onPress={() => {
                          setConfirmAccountDeletion(false);
                          setDeleteAccountError(null);
                        }}
                      >
                        <Text
                          style={[
                            styles.redeemLink,
                            { color: colors.mutedForeground },
                          ]}
                        >
                          Cancel
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      testID="delete-account"
                      style={styles.deleteAccountBtn}
                      onPress={() => {
                        setDeleteAccountError(null);
                        setConfirmAccountDeletion(true);
                      }}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={colors.destructive}
                      />
                      <Text
                        style={[
                          styles.deleteAccountText,
                          { color: colors.destructive },
                        ]}
                      >
                        Delete Account
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)" },
  kav: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(128,128,128,0.4)",
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  heading: { fontSize: 20, fontFamily: "Inter_700Bold" },
  section: { gap: 12 },
  body: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  emailRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  email: { flex: 1, fontSize: 15, fontFamily: "Inter_500Medium" },
  statusCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  statusTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  statusTitle: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  statusBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  primaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: {
    color: "#fff",
    fontSize: 15,
    fontFamily: "Inter_600SemiBold",
  },
  secondaryBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  fineprint: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
  },
  redeemLink: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    paddingTop: 4,
  },
  redeemBox: { gap: 8, paddingTop: 4 },
  redeemInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: "Inter_400Regular",
  },
  redeemError: { fontSize: 12, fontFamily: "Inter_400Regular" },
  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
  },
  signOutText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  deleteAccountCard: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    gap: 10,
  },
  deleteAccountConfirmBtn: {
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  deleteAccountBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 8,
  },
  deleteAccountText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
