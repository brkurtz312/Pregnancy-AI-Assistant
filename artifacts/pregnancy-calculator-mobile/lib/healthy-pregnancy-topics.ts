export const HEALTHY_PREGNANCY_ROUTE_IDS = [
  "/hp-travel",
  "/hp-work-bedrest",
  "/hp-nutrition",
  "/hp-intimacy",
  "/hp-medications",
  "/hp-exercise",
  "/hp-body-mechanics",
  "/hp-warning-signs",
] as const;

export type HealthyPregnancyRouteId =
  (typeof HEALTHY_PREGNANCY_ROUTE_IDS)[number];

export interface HealthyPregnancyTopic {
  icon: string;
  title: string;
  description: string;
  route: HealthyPregnancyRouteId;
}

export const HEALTHY_PREGNANCY_TOPICS = [
  {
    icon: "airplane-outline",
    title: "Travel in Pregnancy",
    description:
      "Safety tips for air, car, and international travel at every stage.",
    route: "/hp-travel",
  },
  {
    icon: "briefcase-outline",
    title: "Work & Bedrest",
    description:
      "Working safely during pregnancy and what to know about bedrest.",
    route: "/hp-work-bedrest",
  },
  {
    icon: "nutrition-outline",
    title: "Nutrition & Weight Gain",
    description: "Recommended weight gain, key nutrients, and foods to avoid.",
    route: "/hp-nutrition",
  },
  {
    icon: "heart-outline",
    title: "Intimacy During Pregnancy",
    description:
      "What's safe, what changes, and when to check with your provider.",
    route: "/hp-intimacy",
  },
  {
    icon: "flask-outline",
    title: "Medications & Substances",
    description:
      "Safe medications, substances to avoid, and talking to your provider.",
    route: "/hp-medications",
  },
  {
    icon: "walk-outline",
    title: "Exercise in Pregnancy",
    description:
      "Benefits of staying active, recommended activities, and warning signs.",
    route: "/hp-exercise",
  },
  {
    icon: "body-outline",
    title: "Body Mechanics",
    description:
      "How to lift, sit, sleep, and move safely to prevent back and pelvic pain.",
    route: "/hp-body-mechanics",
  },
  {
    icon: "alert-circle-outline",
    title: "Warning Signs",
    description:
      "Symptoms that always mean you should call your provider or go to the ER.",
    route: "/hp-warning-signs",
  },
] satisfies HealthyPregnancyTopic[];

// Compile-time exhaustiveness guard: breaks the build if any HealthyPregnancyRouteId
// is not represented in HEALTHY_PREGNANCY_TOPICS. Using `satisfies` above preserves
// the literal route types so that the Exclude check below is meaningful.
type _HealthyPregnancyMissingIds = Exclude<
  HealthyPregnancyRouteId,
  (typeof HEALTHY_PREGNANCY_TOPICS)[number]["route"]
>;
type _AssertNoMissingHealthyPregnancyTopics =
  _HealthyPregnancyMissingIds extends never ? true : never;
const _healthyPregnancyTopicExhaustive: _AssertNoMissingHealthyPregnancyTopics = true;
void _healthyPregnancyTopicExhaustive;
