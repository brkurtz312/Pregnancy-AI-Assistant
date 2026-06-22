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

const STAGES = [
  {
    weekLabel: "Weeks 1–2",
    title: "Fertilization & Implantation",
    desc: "A single sperm penetrates the egg, uniting 23 chromosomes from each parent into one unique human genome. The zygote begins dividing as it travels down the fallopian tube, becoming a blastocyst that burrows into the uterine lining by day 9–10.",
    milestones: [
      "Complete genetic blueprint established at fertilization",
      "Rapid cell division: 2 → 4 → 8 → 16 cells",
      "Blastocyst implants in the endometrium",
      "Placental development begins immediately",
    ],
    size: "~0.1 mm",
    image: require("@/assets/fetal/stage1-zygote.webp"),
  },
  {
    weekLabel: "Weeks 3–4",
    title: "Embryonic Disc",
    desc: "Three primary germ layers — ectoderm, mesoderm, and endoderm — organize and establish the head-to-tail axis. The neural plate begins folding to form the brain and spinal cord. A primitive heart tube appears and starts beating around day 22.",
    milestones: [
      "Gastrulation establishes all three germ layers",
      "Neural tube begins folding closed",
      "First heartbeat detectable (~day 22)",
      "Yolk sac provides early nourishment",
    ],
    size: "~2 mm",
    image: require("@/assets/fetal/stage2-blastocyst.webp"),
  },
  {
    weekLabel: "Weeks 5–8",
    title: "Organogenesis",
    desc: "All major organ systems begin forming during this critical window. Limb buds emerge and develop into paddle-shaped hands with distinct finger rays. Facial features coalesce — eyes migrate forward, nose and lips take shape. By week 8 the embryo is recognizably human.",
    milestones: [
      "Heart chambers form; rate reaches ~150 bpm",
      "Brain divides into forebrain, midbrain, hindbrain",
      "Limb buds elongate into arms and legs",
      "Liver, kidneys, and lungs begin forming",
    ],
    size: "~8 mm · ~1g",
    image: require("@/assets/fetal/stage3-week6.webp"),
  },
  {
    weekLabel: "Weeks 9–12",
    title: "Early Fetal Period",
    desc: "Now called a fetus, external genitalia begin differentiating. The fetus can flex its fingers, make breathing movements, and swallow amniotic fluid. Facial muscles allow primitive expressions. The placenta assumes full hormonal control of the pregnancy.",
    milestones: [
      "All organs present — growth and refinement begin",
      "Sex differentiation begins around week 9",
      "Fingerprints forming by week 12",
      "First trimester screening window",
    ],
    size: "~6 cm · ~14g",
    image: require("@/assets/fetal/stage4-week10.webp"),
  },
  {
    weekLabel: "Weeks 13–16",
    title: "Quickening Approaches",
    desc: "The fetus grows rapidly and movements become coordinated. Lanugo — fine downy hair — covers the body. The skeleton transitions from cartilage to bone. The auditory ossicles harden, allowing the fetus to begin detecting sounds from the outside world.",
    milestones: [
      "Meconium begins forming in the intestines",
      "Eyes can detect light through closed lids",
      "Coordinated sucking and swallowing movements",
      "Bone ossification accelerates throughout skeleton",
    ],
    size: "~16 cm · ~100g",
    image: require("@/assets/fetal/stage5-week14.webp"),
  },
  {
    weekLabel: "Weeks 17–24",
    title: "Viability Threshold",
    desc: "Lung alveoli and surfactant production begin — the key milestone for survival outside the womb. The brain undergoes explosive growth, developing gyri and sulci. Vernix caseosa coats the skin for protection. Mothers feel distinct kicks and rolls.",
    milestones: [
      "Surfactant production begins — critical for breathing",
      "Rapid cerebral cortex development",
      "Sleep-wake cycles become detectable",
      "Viability threshold reached at ~24 weeks",
    ],
    size: "~30 cm · ~600g",
    image: require("@/assets/fetal/stage6-week20.webp"),
  },
  {
    weekLabel: "Weeks 25–32",
    title: "Brain & Lung Maturation",
    desc: "The brain more than doubles in weight during this period. Eyes open and close; the fetus responds to light and sound with purposeful movements. Fat deposits build under the skin, rounding the body's contours. Most organ systems reach functional maturity.",
    milestones: [
      "Eyes open for the first time (around week 26)",
      "REM sleep observed — early dream activity",
      "Maternal immune antibodies begin transferring",
      "Brown fat deposits develop for thermoregulation",
    ],
    size: "~38 cm · ~1.5 kg",
    image: require("@/assets/fetal/stage7-week28.webp"),
  },
  {
    weekLabel: "Weeks 33–40",
    title: "Ready for the World",
    desc: "The fetus turns head-down (vertex presentation) and descends into the pelvis. Lung surfactant reaches full maturity. The final weeks add approximately 200g per week in fat and muscle. At 40 weeks, a full-term newborn weighs ~3.4 kg and is ready for independent life.",
    milestones: [
      "Head engages in the maternal pelvis",
      "Lanugo mostly shed; vernix becomes thin",
      "Full neurological and respiratory maturity",
      "Birth: ~3.4 kg, ~50 cm length",
    ],
    size: "~50 cm · ~3.4 kg",
    image: require("@/assets/fetal/stage8-week40.webp"),
  },
];

const ACCENT = "#4ecdc4";
const BG = "#07090f";
const { width: SCREEN_WIDTH } = Dimensions.get("window");
const IMG_SIZE = Math.min(SCREEN_WIDTH * 0.55, 220);

export default function DevelopmentScreen() {
  const [current, setCurrent] = useState(0);
  const [playing, setPlaying] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const slideAnim = useRef(new Animated.Value(0)).current;
  const currentRef = useRef(0);
  currentRef.current = current;

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

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      const idx = currentRef.current;
      if (idx >= STAGES.length - 1) {
        setPlaying(false);
        return;
      }
      goTo(idx + 1);
    }, 7000);
    return () => clearInterval(t);
  }, [playing, goTo]);

  const s = STAGES[current];

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: BG }]}>
      <ScrollView
        style={{ flex: 1, backgroundColor: BG }}
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>The Beginning of Life</Text>
          <Text style={styles.headerSub}>
            Human Fetal Development · Conception to Birth
          </Text>

          {/* Progress dots */}
          <View style={styles.dots}>
            {STAGES.map((_, i) => (
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

          {/* Milestones */}
          <View style={styles.milestones}>
            {s.milestones.map((m, i) => (
              <View key={i} style={styles.milestone}>
                <View style={styles.bullet} />
                <Text style={styles.milestoneText}>{m}</Text>
              </View>
            ))}
          </View>

          {/* Size */}
          <Text style={styles.sizeLabel}>
            Size: <Text style={styles.sizeValue}>{s.size}</Text>
          </Text>
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
            disabled={current === STAGES.length - 1}
            style={[
              styles.navBtn,
              { opacity: current === STAGES.length - 1 ? 0.22 : 1 },
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
