export interface WeeklyDevelopment {
  week: number;
  size: string;
  sizeComparison: string;
  development: string[];
  motherChanges: string[];
  comingUp: string;
}

export const fetalDevelopmentData: Record<number, WeeklyDevelopment> = {
  1: {
    week: 1,
    size: "< 1 mm",
    sizeComparison: "a poppy seed",
    development: [
      "Fertilization occurs as sperm meets egg",
      "A single cell (zygote) begins rapid division",
      "The fertilized egg travels toward the uterus",
    ],
    motherChanges: [
      "No physical symptoms yet",
      "Hormone levels begin to shift",
    ],
    comingUp:
      "The fertilized egg will implant into the uterine wall in the coming days.",
  },
  2: {
    week: 2,
    size: "< 1 mm",
    sizeComparison: "a sesame seed",
    development: [
      "Implantation into the uterine lining occurs",
      "The placenta begins to form",
      "hCG is produced",
    ],
    motherChanges: [
      "Mild cramping or spotting may occur",
      "A home pregnancy test may now turn positive",
    ],
    comingUp:
      "The embryo will begin forming its most basic structures next week.",
  },
  3: {
    week: 3,
    size: "~1 mm",
    sizeComparison: "a grain of rice",
    development: [
      "The neural tube begins forming",
      "The heart starts developing",
      "Three layers form: ectoderm, mesoderm, and endoderm",
    ],
    motherChanges: [
      "Fatigue may begin",
      "Breast tenderness is common",
      "hCG levels are rising rapidly",
    ],
    comingUp:
      "The heartbeat may be detectable by ultrasound as early as next week.",
  },
  4: {
    week: 4,
    size: "~2 mm",
    sizeComparison: "a poppy seed",
    development: [
      "The embryo has a head and tail",
      "Primitive heart begins beating",
      "Eyes and ears begin forming",
      "Arm and leg buds appear",
    ],
    motherChanges: [
      "A missed period is the key sign",
      "Nausea may begin",
      "Frequent urination may start",
    ],
    comingUp:
      "All major organ systems will begin developing over the next several weeks.",
  },
  5: {
    week: 5,
    size: "~4 mm",
    sizeComparison: "an apple seed",
    development: [
      "The neural tube closes completely",
      "Brain divides into five distinct areas",
      "Tiny fingers and toes begin budding",
    ],
    motherChanges: [
      "Morning sickness often peaks",
      "Heightened sense of smell",
      "Mood swings due to hormone changes",
    ],
    comingUp:
      "The embryo will be visible on ultrasound and may show a flickering heartbeat.",
  },
  6: {
    week: 6,
    size: "~6 mm",
    sizeComparison: "a sweet pea",
    development: [
      "Heartbeat detectable by ultrasound",
      "Hands and feet are forming",
      "Eyelids begin to form",
      "The digestive tract is developing",
    ],
    motherChanges: [
      "Fatigue is often intense",
      "Food aversions and cravings",
      "Breasts continue to grow and feel tender",
    ],
    comingUp:
      "The embryo will more than double in size over the next two weeks.",
  },
  7: {
    week: 7,
    size: "~13 mm",
    sizeComparison: "a blueberry",
    development: [
      "Limbs are more defined",
      "Brain is growing rapidly",
      "Mouth and tongue are forming",
      "Kidneys begin producing urine",
    ],
    motherChanges: [
      "Waistline may begin to feel tighter",
      "Vaginal discharge may increase",
      "Headaches may occur",
    ],
    comingUp: "Webbed fingers and toes will separate into distinct digits.",
  },
  8: {
    week: 8,
    size: "~16 mm",
    sizeComparison: "a raspberry",
    development: [
      "Fingers and toes are distinct",
      "The embryo begins to make small movements",
      "Taste buds are forming",
      "All major organs are present in early form",
    ],
    motherChanges: [
      "Uterus is now the size of a grapefruit",
      "Small baby bump may show",
      "Constipation and bloating are common",
    ],
    comingUp: "The embryo will officially become a fetus at 10 weeks.",
  },
  9: {
    week: 9,
    size: "~23 mm",
    sizeComparison: "a cherry",
    development: [
      "External genitalia begin to differentiate",
      "Eyelids fuse shut",
      "Muscles allow the fetus to move",
      "Teeth and hair follicles begin forming",
    ],
    motherChanges: [
      "Morning sickness may begin to ease",
      "Linea nigra may appear",
      "Blood volume continues increasing",
    ],
    comingUp: "Cartilage and bones are beginning to form throughout the body.",
  },
  10: {
    week: 10,
    size: "~31 mm",
    sizeComparison: "a strawberry",
    development: [
      "Now officially a fetus",
      "All vital organs are formed",
      "Fingernails and toenails begin forming",
      "The fetus can swallow and make facial expressions",
    ],
    motherChanges: [
      "Visible veins may appear on breasts",
      "Energy levels may begin improving",
      "First prenatal blood tests are often done",
    ],
    comingUp: "The fetus will triple in size over the next month.",
  },
  11: {
    week: 11,
    size: "~41 mm",
    sizeComparison: "a fig",
    development: [
      "Hands open and close into fists",
      "Tooth buds appear",
      "Diaphragm is forming",
      "The head is nearly half the body length",
    ],
    motherChanges: [
      "The uterus has moved above the pubic bone",
      "Nausea often begins to subside",
      "Round ligament pain may begin",
    ],
    comingUp: "First trimester screening tests are typically offered now.",
  },
  12: {
    week: 12,
    size: "~54 mm",
    sizeComparison: "a lime",
    development: [
      "Reflexes are developing",
      "Brain is developing rapidly",
      "Kidneys are producing urine",
      "Intestines have moved into the abdomen",
    ],
    motherChanges: [
      "Miscarriage risk drops significantly",
      "A bump may become visible",
      "Many women share their news after this week",
    ],
    comingUp:
      "You are approaching the end of the first trimester — a major milestone.",
  },
  13: {
    week: 13,
    size: "~74 mm",
    sizeComparison: "a peach",
    development: [
      "Fingerprints are forming",
      "Vocal cords are developing",
      "The fetus can suck and swallow",
      "Bones are hardening from cartilage",
    ],
    motherChanges: [
      "End of the first trimester",
      "Energy typically begins to return",
      "Libido may increase as symptoms ease",
    ],
    comingUp:
      "The second trimester begins — often considered the most comfortable phase.",
  },
  14: {
    week: 14,
    size: "~87 mm",
    sizeComparison: "a lemon",
    development: [
      "Second trimester begins",
      "Fine hair (lanugo) covers the body",
      "The fetus can make facial expressions",
      "Kidneys are fully functional",
    ],
    motherChanges: [
      "Nausea usually subsides entirely",
      "Energy returns for many women",
      "Appetite increases significantly",
    ],
    comingUp:
      "Movement may soon be felt — often described as fluttering or bubbles.",
  },
  15: {
    week: 15,
    size: "~10 cm",
    sizeComparison: "an apple",
    development: [
      "Ears are positioned correctly",
      "Eyes are sensitive to light",
      "Joints and limbs can flex and move",
      "Hair is growing on the head",
    ],
    motherChanges: [
      "Baby bump is visible for most women",
      "Skin may glow or break out",
      "Nosebleeds or congestion may occur",
    ],
    comingUp:
      "An anatomy ultrasound is typically scheduled around 18–20 weeks.",
  },
  16: {
    week: 16,
    size: "~11.6 cm",
    sizeComparison: "an avocado",
    development: [
      "Eyes can make small movements",
      "Toenails are growing",
      "Circulatory and urinary systems fully functioning",
      "The fetus holds its head more upright",
    ],
    motherChanges: [
      "First movements (quickening) may be felt",
      "Maternity clothes may be needed",
      "Backache may begin",
    ],
    comingUp:
      "Around week 18–20, you'll likely feel stronger, more definitive kicks.",
  },
  17: {
    week: 17,
    size: "~13 cm",
    sizeComparison: "a pear",
    development: [
      "Fat begins accumulating under the skin",
      "Sweat glands are forming",
      "Skeleton is changing from cartilage to bone",
      "The umbilical cord is growing stronger",
    ],
    motherChanges: [
      "Weight gain is accelerating",
      "Stretch marks may begin",
      "Vivid dreams are common",
    ],
    comingUp:
      "The anatomy scan will give a detailed view of all organs and structures.",
  },
  18: {
    week: 18,
    size: "~14 cm",
    sizeComparison: "a bell pepper",
    development: [
      "The fetus can yawn, hiccup, and roll",
      "Ears are fully formed",
      "Myelin begins forming on the spinal cord",
      "Unique fingerprints are set",
    ],
    motherChanges: [
      "Kicks and movement felt more regularly",
      "Round ligament pain may be noticeable",
      "Blood pressure may drop causing dizziness",
    ],
    comingUp:
      "The anatomy scan (18–20 weeks) is one of the most detailed ultrasounds of pregnancy.",
  },
  19: {
    week: 19,
    size: "~15 cm",
    sizeComparison: "a mango",
    development: [
      "Vernix caseosa forms to protect skin",
      "Sensory areas of the brain are developing",
      "The fetus moves in response to sounds",
      "Hair on the scalp is growing",
    ],
    motherChanges: [
      "The uterus reaches the belly button",
      "Skin darkening may intensify",
      "Hip and pelvic pain may occur",
    ],
    comingUp: "Halfway point! The anatomy scan may reveal the sex of the baby.",
  },
  20: {
    week: 20,
    size: "~16.5 cm",
    sizeComparison: "a banana",
    development: [
      "Halfway through pregnancy",
      "Practicing digestion by swallowing amniotic fluid",
      "Taste buds are fully developed",
      "Sleep cycles are becoming more regular",
    ],
    motherChanges: [
      "Anatomy scan typically performed",
      "Sex of baby can be determined",
      "Heartburn and indigestion become more common",
    ],
    comingUp: "The fetus will gain most of its weight over the coming weeks.",
  },
  21: {
    week: 21,
    size: "~27 cm",
    sizeComparison: "a carrot",
    development: [
      "The fetus can feel pain",
      "Bone marrow has taken over blood cell production",
      "Eyelids and eyebrows are fully formed",
      "The fetus kicks strongly",
    ],
    motherChanges: [
      "Kicks strong enough for others to feel",
      "Linea nigra may darken",
      "Feet may begin to swell",
    ],
    comingUp:
      "The fetus will respond to music and familiar voices over the next few weeks.",
  },
  22: {
    week: 22,
    size: "~28 cm",
    sizeComparison: "a spaghetti squash",
    development: [
      "Lanugo covers the entire body",
      "Lips are more defined",
      "The pancreas is developing",
      "Eyes are fully formed",
    ],
    motherChanges: [
      "Increased appetite is common",
      "Varicose veins may appear",
      "Braxton Hicks contractions may begin",
    ],
    comingUp:
      "Viability milestone approaches — at 24 weeks, survival outside the womb becomes possible.",
  },
  23: {
    week: 23,
    size: "~29 cm",
    sizeComparison: "a grapefruit",
    development: [
      "Lungs are developing rapidly",
      "The fetus can hear conversations and music",
      "Sense of movement is fully developed",
      "Bones in the middle ear are hardening",
    ],
    motherChanges: [
      "Ankle swelling is common",
      "Sleep becomes more difficult",
      "Belly button may pop outward",
    ],
    comingUp:
      "The viability milestone at week 24 is a significant moment in pregnancy.",
  },
  24: {
    week: 24,
    size: "~30 cm",
    sizeComparison: "an ear of corn",
    development: [
      "Viability milestone — survival outside the womb is possible",
      "Lungs produce surfactant",
      "The brain is developing complex connections",
      "Taste buds are mature",
    ],
    motherChanges: [
      "Gestational diabetes screening offered",
      "Carpal tunnel syndrome may develop",
      "Back pain may intensify",
    ],
    comingUp:
      "Growth accelerates significantly — the fetus will gain roughly half a pound per week.",
  },
  25: {
    week: 25,
    size: "~34 cm",
    sizeComparison: "a rutabaga",
    development: [
      "Fat layers are filling in",
      "Hair is now a visible color",
      "The nostrils begin to open",
      "Hand grip strength is increasing",
    ],
    motherChanges: [
      "Heartburn and indigestion intensify",
      "Sciatica may occur",
      "Stretch marks may become more prominent",
    ],
    comingUp: "You are entering the third trimester in just a few weeks.",
  },
  26: {
    week: 26,
    size: "~36 cm",
    sizeComparison: "a head of lettuce",
    development: [
      "Eyes begin to open for the first time",
      "The fetus responds to touch",
      "Brain wave activity is similar to a newborn",
      "Immune system is maturing",
    ],
    motherChanges: [
      "Third trimester is approaching",
      "Braxton Hicks may increase",
      "Colostrum may leak from nipples",
    ],
    comingUp: "The third trimester begins at week 28 — a major milestone.",
  },
  27: {
    week: 27,
    size: "~37 cm",
    sizeComparison: "a head of cauliflower",
    development: [
      "Lungs continue maturing",
      "The fetus sleeps and wakes on a regular cycle",
      "Brain tissue is rapidly growing",
      "The sucking reflex is developing",
    ],
    motherChanges: [
      "Leg cramps are common at night",
      "Shortness of breath",
      "Frequent urination returns",
    ],
    comingUp: "The third trimester begins next week — the final stretch!",
  },
  28: {
    week: 28,
    size: "~38 cm",
    sizeComparison: "an eggplant",
    development: [
      "Third trimester begins",
      "Eyes are open and can blink",
      "The fetus can dream (REM sleep)",
      "Bone marrow fully in charge of red blood cells",
    ],
    motherChanges: [
      "Prenatal visits increase to every two weeks",
      "Rh factor blood test may be administered",
      "Weight gain is about a pound per week",
    ],
    comingUp:
      "The baby will gain significant weight and size in these final weeks.",
  },
  29: {
    week: 29,
    size: "~39 cm",
    sizeComparison: "a butternut squash",
    development: [
      "Muscles and lungs continue maturing",
      "The head is growing to accommodate the brain",
      "The fetus is storing iron, calcium, and phosphorus",
      "Kicks and movements are strong and regular",
    ],
    motherChanges: [
      "Hemorrhoids may develop",
      "Pelvic pressure may make walking uncomfortable",
      "Sleep disruption is very common",
    ],
    comingUp: "Some babies begin turning head-down over the next few weeks.",
  },
  30: {
    week: 30,
    size: "~40 cm",
    sizeComparison: "a large cabbage",
    development: [
      "Lanugo hair begins to disappear",
      "More fat is accumulating",
      "Bone marrow fully producing blood cells",
      "The fetus can grasp objects",
    ],
    motherChanges: [
      "Braxton Hicks may be more noticeable",
      "Colostrum production increases",
      "Heartburn and reflux are at their peak",
    ],
    comingUp: "Just 10 weeks to go! The baby will double in weight by birth.",
  },
  31: {
    week: 31,
    size: "~41 cm",
    sizeComparison: "a coconut",
    development: [
      "All five senses are functioning",
      "Rapid brain development continues",
      "The fetus may recognize voices",
      "Toenails reach the tips of the toes",
    ],
    motherChanges: [
      "Shortness of breath is common",
      "Ankle and foot swelling may worsen",
      "Colostrum may be expressed",
    ],
    comingUp:
      "Birthing classes and hospital tours are recommended around this time.",
  },
  32: {
    week: 32,
    size: "~42 cm",
    sizeComparison: "a jicama",
    development: [
      "Skin is becoming smooth",
      "Toenails are fully grown",
      "The fetus practices breathing about 40% of the time",
      "Immune system continues building with maternal antibodies",
    ],
    motherChanges: [
      "The baby may drop lower into the pelvis soon",
      "Backache and pressure are common",
      "Group B Strep testing is typically scheduled",
    ],
    comingUp: "Most babies are in a head-down position by week 36.",
  },
  33: {
    week: 33,
    size: "~43 cm",
    sizeComparison: "a pineapple",
    development: [
      "The skull is firm but plates are not yet fused",
      "Sleep-wake cycle similar to a newborn's",
      "Bones are fully developed but still soft",
      "Fingernails may need trimming after birth",
    ],
    motherChanges: [
      "Difficulty sleeping is nearly universal",
      "Frequent urination may return",
      "Weight gain should slow slightly",
    ],
    comingUp:
      "The lungs and brain are the last organs to fully mature before birth.",
  },
  34: {
    week: 34,
    size: "~45 cm",
    sizeComparison: "a cantaloupe",
    development: [
      "Lungs are nearly fully mature",
      "The central nervous system is maturing",
      "Fat stores are almost complete",
      "Vernix caseosa coating is thickening",
    ],
    motherChanges: [
      "Pelvic pressure intensifies",
      "Swelling in hands and face should be reported",
      "Nesting instinct often kicks in",
    ],
    comingUp:
      "If born now, most babies thrive with minimal medical intervention.",
  },
  35: {
    week: 35,
    size: "~46 cm",
    sizeComparison: "a honeydew melon",
    development: [
      "Kidneys are fully developed",
      "Liver can process some waste products",
      "The fetus is running out of room",
      "Most body systems are ready for the outside world",
    ],
    motherChanges: [
      "GBS test typically performed",
      "Cervical checks may begin",
      "Braxton Hicks are more frequent and noticeable",
    ],
    comingUp:
      "Your provider will begin checking for signs of labor at each visit.",
  },
  36: {
    week: 36,
    size: "~47 cm",
    sizeComparison: "a head of romaine lettuce",
    development: [
      "Lanugo and vernix are mostly gone",
      "Gums are firm",
      "Digestive system is ready but immature",
      "Most babies are in a head-down position",
    ],
    motherChanges: [
      "Prenatal visits are now weekly",
      "Lightning crotch (sharp shooting pains) is common",
      "The cervix may begin to dilate and efface",
    ],
    comingUp: "Early term begins at 37 weeks — the baby is almost fully ready.",
  },
  37: {
    week: 37,
    size: "~48 cm",
    sizeComparison: "a bunch of swiss chard",
    development: [
      "Early term — considered full-term in most guidelines",
      "Lungs are fully mature in most cases",
      "The brain and liver are still developing slightly",
      "The fetus practices breathing, sucking, and gripping",
    ],
    motherChanges: [
      "Mucus plug may be lost (bloody show)",
      "Braxton Hicks may be difficult to distinguish from real labor",
      "Pelvic pressure may feel intense",
    ],
    comingUp: "Full term is 39 weeks — labor can begin at any time from now.",
  },
  38: {
    week: 38,
    size: "~49 cm",
    sizeComparison: "a leek",
    development: [
      "The fetus is considered full term",
      "All organs are ready to function independently",
      "Meconium (first stool) has accumulated in the intestines",
      "Fat pads are complete on the cheeks and knees",
    ],
    motherChanges: [
      "Cervical dilation may progress",
      "Watch for regular contractions, water breaking, bloody show",
      "The baby may have dropped lower",
    ],
    comingUp:
      "The baby could arrive at any time — your body and baby are ready.",
  },
  39: {
    week: 39,
    size: "~50 cm",
    sizeComparison: "a mini watermelon",
    development: [
      "Full term — the optimal time for birth",
      "The brain is still actively developing",
      "Antibodies continue transferring from mother to baby",
      "The fetus is plump, well-padded, and fully ready",
    ],
    motherChanges: [
      "Most providers offer induction discussions",
      "Watch for signs of labor: contractions every 5 minutes, water breaking",
      "Fatigue and nesting urge are common",
    ],
    comingUp:
      "Every day now prepares the baby for a healthy start outside the womb.",
  },
  40: {
    week: 40,
    size: "~51 cm",
    sizeComparison: "a small pumpkin",
    development: [
      "Due date week — the expected time of birth",
      "All systems are fully ready for life outside the womb",
      "The placenta is beginning to age",
      "The baby is approximately 3.4 kg (7.5 lbs)",
    ],
    motherChanges: [
      "Contractions may begin at any time",
      "Your provider will monitor you closely",
      "Cervical ripening and dilation are expected",
    ],
    comingUp: "Your baby is ready to meet you — labor could begin any day.",
  },
  41: {
    week: 41,
    size: "~51.5 cm",
    sizeComparison: "a small pumpkin",
    development: [
      "Post-term — still developing neurologically",
      "The vernix has been mostly reabsorbed",
      "The baby may have longer nails and more hair",
      "Amniotic fluid begins to decrease",
    ],
    motherChanges: [
      "Your provider may discuss induction options",
      "Monitoring increases to check baby's well-being",
      "Patience is key — many healthy babies arrive this week",
    ],
    comingUp: "Induction is typically recommended around 41–42 weeks.",
  },
  42: {
    week: 42,
    size: "~52 cm",
    sizeComparison: "a small pumpkin",
    development: [
      "Post-term — induction is typically recommended",
      "The placenta may no longer function optimally",
      "The baby continues to be monitored closely",
      "Skin may show signs of post-maturity (peeling or dry)",
    ],
    motherChanges: [
      "Induction or c-section is typically recommended",
      "Close monitoring continues",
      "Your provider will guide you on next steps",
    ],
    comingUp:
      "Your medical team will support you through the final stage of your pregnancy.",
  },
};

export function getWeeklyDevelopment(week: number): WeeklyDevelopment {
  const clampedWeek = Math.min(42, Math.max(1, week));
  return fetalDevelopmentData[clampedWeek] ?? fetalDevelopmentData[1]!;
}
