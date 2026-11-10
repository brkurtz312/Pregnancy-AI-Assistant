import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import * as Sharing from "expo-sharing";
import React, { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

/**
 * Generic in-app PDF viewer, opened from the Labor & Delivery handout
 * buttons. Renders a locally-cached PDF via react-native-webview so the user
 * can read it in-app before deciding whether to share/export it via the OS
 * share sheet.
 *
 * react-native-webview has no web implementation, so on web (and if no `uri`
 * is provided) we skip rendering it entirely and fall back to a message that
 * points the user at the share icon instead.
 */
export default function PdfViewerScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    uri?: string;
    title?: string;
    shareTitle?: string;
  }>();
  const [loading, setLoading] = useState(true);
  const uri = params.uri;
  const title = params.title || "Handout";
  const canShowInAppViewer = Platform.OS !== "web" && !!uri;

  const handleShare = async () => {
    if (!uri) return;
    try {
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: params.shareTitle || title,
          UTI: "com.adobe.pdf",
        });
      } else {
        Alert.alert(
          "Can't share",
          "Sharing files isn't available on this device.",
        );
      }
    } catch {
      Alert.alert(
        "Can't share",
        "Something went wrong sharing the PDF. Please try again.",
      );
    }
  };

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
          style={styles.doneBtn}
        >
          <Text style={[styles.doneText, { color: colors.primary }]}>Done</Text>
        </TouchableOpacity>
        <Text
          style={[styles.title, { color: colors.foreground }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <TouchableOpacity
          onPress={handleShare}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.shareIconBtn}
        >
          <Ionicons name="share-outline" size={22} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {canShowInAppViewer ? (
        <InAppPdf
          uri={uri as string}
          loading={loading}
          setLoading={setLoading}
          primaryColor={colors.primary}
          backgroundColor={colors.background}
        />
      ) : (
        <View style={styles.fallback}>
          <Ionicons
            name="document-text-outline"
            size={40}
            color={colors.mutedForeground}
          />
          <Text
            style={[styles.fallbackText, { color: colors.mutedForeground }]}
          >
            In-app preview isn&apos;t available here. Use the share icon above
            to open or save the PDF.
          </Text>
        </View>
      )}
    </View>
  );
}

/**
 * Isolated in a separate component so `react-native-webview` (a native-only
 * module with no web implementation) is only ever required on native
 * platforms — this component is never mounted on web.
 */
function InAppPdf({
  uri,
  loading,
  setLoading,
  primaryColor,
  backgroundColor,
}: {
  uri: string;
  loading: boolean;
  setLoading: (v: boolean) => void;
  primaryColor: string;
  backgroundColor: string;
}) {
  const { WebView } = require("react-native-webview");
  // Derive the directory portion for allowingReadAccessToURL (iOS requires
  // this to be set to the parent directory of the file, otherwise WebKit's
  // sandbox blocks local file:// loads entirely, producing a blank spinner).
  const dirUri = uri.substring(0, uri.lastIndexOf("/") + 1);
  return (
    <View style={{ flex: 1 }}>
      <WebView
        source={{ uri }}
        style={{ flex: 1, backgroundColor: "transparent" }}
        originWhitelist={["file://*", "about:*"]}
        allowFileAccess={true}
        allowFileAccessFromFileURLs={true}
        allowUniversalAccessFromFileURLs={true}
        allowingReadAccessToURL={dirUri}
        onLoadEnd={() => setLoading(false)}
        onError={() => setLoading(false)}
      />
      {loading && (
        <View style={[styles.loadingOverlay, { backgroundColor }]}>
          <ActivityIndicator size="large" color={primaryColor} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  doneBtn: {
    minWidth: 52,
  },
  doneText: {
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
  },
  title: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    marginHorizontal: 8,
  },
  shareIconBtn: {
    minWidth: 52,
    alignItems: "flex-end",
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  fallbackText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});
