import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import React, { useCallback } from "react";
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
  // The video player lives in <JournalVideo>, which only mounts while the
  // modal is visible; unmounting it releases the player and stops playback.
  const handleClose = useCallback(() => {
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
        {visible && media?.type === "video" && (
          <View style={styles.videoContainer}>
            <JournalVideo uri={media.uri} width={width} height={height} />
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

/**
 * expo-video replaces expo-av's <Video> (expo-av was removed in Expo SDK 55).
 * useVideoPlayer must run unconditionally, so it lives in its own component.
 */
function JournalVideo({
  uri,
  width,
  height,
}: {
  uri: string;
  width: number;
  height: number;
}) {
  const player = useVideoPlayer({ uri }, (p) => {
    p.play();
  });
  return (
    <VideoView
      player={player}
      style={{ width, height }}
      contentFit="contain"
      nativeControls
    />
  );
}
