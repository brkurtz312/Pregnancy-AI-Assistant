export interface SupportPersonVolume {
  volumeNumber: 1 | 2 | 3;
  seriesLabel: string;
  handoutTitle: string;
  pageSubtitle: string;
  summary: string;
  highlights: string[];
}

export const SUPPORT_PERSON_VOL_1: SupportPersonVolume = {
  volumeNumber: 1,
  seriesLabel: "Support Person Survival Series · Vol 1",
  handoutTitle: "We Can Do This.",
  pageSubtitle: "A field guide for the pregnancy support person",
  summary:
    "Written for whoever is supporting her through pregnancy — partner, family member, or friend. It walks through each trimester (what she may be feeling and what you can do), the warning signs that mean she should call the office, and a pre-labor to-do list, all with the reminder to take care of yourself too.",
  highlights: [
    "Your job in three parts: keep her comfortable, keep her safe (know the warning signs), and keep her feeling seen.",
    "First trimester: exhaustion and nausea are real — take over strong smells, stock nausea-friendly snacks, and do the driving.",
    "Second trimester: the 'honeymoon' phase — come to the anatomy scan, feel the kicks, and watch how you talk about her changing body.",
    "Third trimester: pack the hospital bag (yours too), install the car seat by 36 weeks, and take on more of the household work.",
    "Warning signs that mean she should call the ob-gyn office — bleeding, leaking fluid, severe headache, vision changes, decreased fetal movement, and more.",
  ],
};

export const SUPPORT_PERSON_VOL_2: SupportPersonVolume = {
  volumeNumber: 2,
  seriesLabel: "Support Person Survival Series · Vol 2",
  handoutTitle: "Can We Do This?",
  pageSubtitle: "The labor and delivery handbook for the support person",
  summary:
    "Covers the day itself: how to tell when it's really time to head to the hospital, what happens in each stage of labor, the pain relief options she may choose from, what a cesarean birth looks like, and the small things support people wish they'd known not to do in the delivery room.",
  highlights: [
    "Your job in labor: be present, be practical, be her voice, and be flexible when the plan changes.",
    "When to head in — clear signs like your water breaking, the 5-1-1 contraction rule, or heavy bleeding.",
    "The three stages of labor explained, with what she needs from you at each one.",
    "Pain relief options, from breathing and movement to an epidural or nitrous oxide — no medical background needed.",
    "What to expect if it becomes a cesarean, and a list of things not to do in the delivery room.",
  ],
};

export const SUPPORT_PERSON_VOL_3: SupportPersonVolume = {
  volumeNumber: 3,
  seriesLabel: "Support Person Survival Series · Vol 3",
  handoutTitle: "We Did It! Now What?",
  pageSubtitle: "The postpartum handbook for the support person",
  summary:
    "The baby is here — now what? This handout covers the first 24 hours and first week home, what's physically normal for her recovery, warning signs that mean you should call the office or go to the ER, how to recognize postpartum depression and anxiety, feeding support, newborn basics, and how to be the gatekeeper for visitors.",
  highlights: [
    "Your three missions in the first week home: feed the baby, feed the mother, and keep the house running.",
    "The one-at-a-time sleep rule — only one adult wakes up fully at a time, so trade shifts.",
    "What's physically normal for her recovery (bleeding, cramping, engorgement) and how long each should last.",
    "Warning signs to call the office or go to the ER, plus how to tell baby blues apart from postpartum depression or anxiety.",
    "Visitor rules to protect her recovery, and newborn basics like safe sleep and feeding cues.",
  ],
};

export const SUPPORT_PERSON_VOLUMES: SupportPersonVolume[] = [
  SUPPORT_PERSON_VOL_1,
  SUPPORT_PERSON_VOL_2,
  SUPPORT_PERSON_VOL_3,
];
