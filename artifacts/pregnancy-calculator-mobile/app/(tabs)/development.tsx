import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Dimensions,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { FETAL_STAGES } from "@/constants/fetalStages";
import { MATERNAL_STAGES } from "@/constants/maternalStages";
import { ClinicalDrawer } from "@/components/ClinicalDrawer";

const ACCENT = "#4ecdc4";
const BG = "#07090f";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMG_SIZE = Math.min(SCREEN_WIDTH * 0.55, 220);

type ViewMode = "fetal" | "maternal";

export default function DevelopmentScreen() {
  const [view, setView] = useState<ViewMode>("fetal");
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const currentRef = useRef(0);
  currentRef.current = current;

  const stages = view === "fetal" ? FETAL_STAGES : MATERNAL_STAGES;

  const goTo = useCallback(
    (idx: number) => {
      if (idx === currentRef.current) return;
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 12,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrent(idx);
        slideAnim.setValue(-12);
        Animated.parallel([
          Animated.timing(fadeAnim, {
            toValue: 1,
            duration: 280,
            useNativeDriver: true,
          }),
          Animated.timing(slideAnim, {
            toValue: 0,
            duration: 280,
            useNativeDriver: true,
          }),
        ]).start();
      });
    },
    [fadeAnim, slideAnim],
  );

  function switchView(next: ViewMode) {
    if (next === view) return;
    setPlaying(false);
    setView(next);
    setCurrent(0);
    fadeAnim.setValue(1);
    slideAnim.setValue(0);
  }

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const idx = currentRef.current;
      if (idx >= stages.length - 1) {
        setPlaying(false);
        return;
      }
      goTo(idx + 1);
    }, 7000);
    return () => clearInterval(t);
  }, [playing, goTo, stages.length]);

  const s = stages[current];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: BG }]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>
            {view === "fetal" ? "The Beginning of Life" : "The Maternal Body"}
          </Text>
          <Text style={styles.headerSub}>
            {view === "fetal"
              ? "Human Fetal Development · Conception to Birth"
              : "Anatomical Cross-Section · Conception to Birth"}
          </Text>

          {/* Fetal / Maternal toggle */}
          <View style={styles.viewToggle}>
            <TouchableOpacity
              onPress={() => switchView("fetal")}
              style={[
                styles.viewToggleBtn,
                view === "fetal" && styles.viewToggleBtnActive,
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.viewToggleText,
                  view === "fetal" && styles.viewToggleTextActive,
                ]}
              >
                Fetal
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => switchView("maternal")}
              style={[
                styles.viewToggleBtn,
                view === "maternal" && styles.viewToggleBtnActive,
              ]}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.viewToggleText,
                  view === "maternal" && styles.viewToggleTextActive,
                ]}
              >
                Maternal
              </Text>
            </TouchableOpacity>
          </View>

          {/* Progress dots */}
          <View style={styles.dots}>
            {stages.map((_, i) => (
              <TouchableOpacity
                key={i}
                onPress={() => goTo(i)}
                activeOpacity={0.7}
              >
                <View
                  style={[
                    styles.dot,
                    {
                      width: i === current ? 36 : 20,
                      backgroundColor:
                        i === current
                          ? ACCENT
                          : i < current
                            ? "rgba(78,205,196,0.50)"
                            : "rgba(78,205,196,0.16)",
                    },
                  ]}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Stage content */}
        <Animated.View
          style={[
            styles.content,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
          ]}
        >
          {/* Circular image */}
          <View
            style={[
              styles.imageRing,
              { width: IMG_SIZE, height: IMG_SIZE, borderRadius: IMG_SIZE / 2 },
            ]}
          >
            <Image
              source={s.image}
              style={{
                width: IMG_SIZE,
                height: IMG_SIZE,
                borderRadius: IMG_SIZE / 2,
              }}
              resizeMode="cover"
            />
          </View>

          {/* Week label */}
          <Text style={styles.weekLabel}>{s.weekLabel}</Text>

          {/* Title */}
          <Text style={styles.stageTitle}>{s.title}</Text>

          {/* Description */}
          <Text style={styles.desc}>{s.desc}</Text>

          {view === "fetal" ? (
            <>
              {/* Milestones */}
              <View style={styles.milestones}>
                {FETAL_STAGES[current].milestones.map((m, i) => (
                  <View key={i} style={styles.milestone}>
                    <View style={styles.bullet} />
                    <Text style={styles.milestoneText}>{m}</Text>
                  </View>
                ))}
              </View>

              {/* Size */}
              <Text style={styles.sizeLabel}>
                Size:{" "}
                <Text style={styles.sizeValue}>
                  {FETAL_STAGES[current].size}
                </Text>
              </Text>

              <ClinicalDrawer data={FETAL_STAGES[current].clinical} />
            </>
          ) : (
            <>
              {/* Maternal changes */}
              <View style={styles.milestones}>
                {MATERNAL_STAGES[current].maternal.map((m, i) => (
                  <View key={i} style={styles.milestone}>
                    <View style={styles.bullet} />
                    <Text style={styles.milestoneText}>{m}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.maternalFooter}>
                <Text style={styles.maternalFooterLine}>
                  Fundal height:{" "}
                  <Text style={styles.maternalFooterValue}>
                    {MATERNAL_STAGES[current].uterusFundus}
                  </Text>
                </Text>
                <Text style={styles.maternalFooterLine}>
                  Organ displacement:{" "}
                  <Text style={styles.maternalFooterValue}>
                    {MATERNAL_STAGES[current].organChanges}
                  </Text>
                </Text>
              </View>
            </>
          )}
        </Animated.View>

        {/* Footer nav */}
        <View style={styles.footer}>
          <TouchableOpacity
            onPress={() => goTo(current - 1)}
            disabled={current === 0}
            style={[styles.navBtn, { opacity: current === 0 ? 0.22 : 1 }]}
          >
            <Text style={styles.navBtnText}>← Previous</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setPlaying((p) => !p)}
            style={styles.autoplayBtn}
          >
            <View
              style={[
                styles.autoplayDot,
                { backgroundColor: playing ? ACCENT : "#7a9e98" },
              ]}
            />
            <Text
              style={[
                styles.autoplayText,
                { color: playing ? ACCENT : "#7a9e98" },
              ]}
            >
              {playing ? "Pause" : "Autoplay"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => goTo(current + 1)}
            disabled={current === stages.length - 1}
            style={[
              styles.navBtn,
              { opacity: current === stages.length - 1 ? 0.22 : 1 },
            ]}
          >
            <Text style={styles.navBtnText}>Next →</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 32 },
  header: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(78,205,196,0.15)",
    alignItems: "center",
  },
  headerTitle: {
    fontFamily: "Playfair_400Regular",
    fontWeight: "300",
    fontSize: 22,
    letterSpacing: 1,
    color: "#eef4f2",
    textAlign: "center",
  },
  headerSub: {
    fontSize: 10,
    letterSpacing: 3,
    textTransform: "uppercase",
    color: "#7abcb4",
    marginTop: 6,
    textAlign: "center",
  },
  viewToggle: {
    flexDirection: "row",
    marginTop: 16,
    borderWidth: 1,
    borderColor: "rgba(78,205,196,0.28)",
    borderRadius: 8,
    overflow: "hidden",
  },
  viewToggleBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  viewToggleBtnActive: {
    backgroundColor: "rgba(78,205,196,0.18)",
  },
  viewToggleText: {
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
    color: "#7a9e98",
  },
  viewToggleTextActive: {
    color: ACCENT,
  },
  dots: {
    flexDirection: "row",
    gap: 5,
    marginTop: 14,
    alignItems: "center",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  dot: {
    height: 4,
    borderRadius: 2,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 28,
    alignItems: "center",
  },
  imageRing: {
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(78,205,196,0.28)",
    backgroundColor: "#0d1117",
    shadowColor: ACCENT,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.25,
    shadowRadius: 28,
    elevation: 8,
    marginBottom: 24,
  },
  weekLabel: {
    fontSize: 10,
    letterSpacing: 3.5,
    textTransform: "uppercase",
    color: ACCENT,
    marginBottom: 8,
    textAlign: "center",
  },
  stageTitle: {
    fontFamily: "Playfair_400Regular",
    fontWeight: "400",
    fontSize: 22,
    lineHeight: 30,
    color: "#f2f7f5",
    textAlign: "center",
    marginBottom: 14,
  },
  desc: {
    fontSize: 14,
    lineHeight: 24,
    color: "#ccddd8",
    textAlign: "center",
    marginBottom: 20,
  },
  milestones: {
    alignSelf: "stretch",
    gap: 10,
    marginBottom: 16,
  },
  milestone: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: ACCENT,
    marginTop: 7,
    flexShrink: 0,
  },
  milestoneText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 20,
    color: "#b8d4ce",
  },
  sizeLabel: {
    fontSize: 12,
    color: "#5db0a6",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  sizeValue: { color: "#7eccc4" },
  maternalFooter: {
    alignSelf: "stretch",
    borderTopWidth: 1,
    borderTopColor: "rgba(78,205,196,0.12)",
    paddingTop: 12,
    gap: 5,
  },
  maternalFooterLine: {
    fontSize: 12,
    color: "#5db0a6",
  },
  maternalFooterValue: { color: "#7eccc4" },
  footer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 20,
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(78,205,196,0.12)",
  },
  navBtn: {
    borderWidth: 1,
    borderColor: "rgba(78,205,196,0.28)",
    borderRadius: 3,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  navBtnText: {
    color: "#7ed9c8",
    fontSize: 13,
    letterSpacing: 1.5,
  },
  autoplayBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  autoplayDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  autoplayText: {
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
