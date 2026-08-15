import { Ionicons } from "@expo/vector-icons";
import { Video, ResizeMode } from "expo-av";
import { Image } from "expo-image";
import React, { useCallback, useRef } from "react";
import {
  Modal,
  ScrollView,
  StatusBar,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { JournalMedia } from "@/lib/journal";

interface MediaViewerModalProps {
  visible: boolean;
  media: JournalMedia | null;
  onClose: () => void;
}

export function MediaViewerModal({
  visible,
  media,
  onClose,
}: MediaViewerModalProps) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // Keep a ref to the Video so we can pause on close.
  const videoRef = useRef<Video>(null);

  const handleClose = useCallback(() => {
    videoRef.current?.pauseAsync().catch(() => {});
    onClose();
  }, [onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar hidden={visible} />
      <View style={styles.backdrop}>
        {media?.type === "photo" && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.photoContainer}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            bouncesZoom
          >
            <Image
              source={{ uri: media.uri }}
              style={{ width, height }}
              contentFit="contain"
            />
          </ScrollView>
        )}
        {media?.type === "video" && (
          <View style={styles.videoContainer}>
            <Video
              ref={videoRef}
              source={{ uri: media.uri }}
              style={{ width, height }}
              resizeMode={ResizeMode.CONTAIN}
              useNativeControls
              shouldPlay
            />
          </View>
        )}

        {/* Close button — top-right, safe-area aware */}
        <TouchableOpacity
          style={[styles.closeBtn, { top: insets.top + 10 }]}
          onPress={handleClose}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <View style={styles.closeBtnInner}>
            <Ionicons name="close" size={20} color="#fff" />
          </View>
        </TouchableOpacity>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "#000",
  },
  photoContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  videoContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    zIndex: 10,
  },
  closeBtnInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
});
