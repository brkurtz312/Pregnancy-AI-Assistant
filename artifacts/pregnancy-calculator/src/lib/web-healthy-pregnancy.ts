export interface HealthyPregnancyArticle {
  id: string;
  title: string;
  description: string;
  emoji: string;
  color: string;
  sections: ArticleSection[];
}

export interface ArticleSection {
  heading: string;
  bullets: string[];
}

export const HEALTHY_PREGNANCY_ARTICLES: HealthyPregnancyArticle[] = [
  {
    id: "travel",
    title: "Travel in Pregnancy",
    description:
      "Safety tips for air, car, and international travel at every stage.",
    emoji: "✈️",
    color: "#8b5cf6",
    sections: [
      {
        heading: "When is travel safest?",
        bullets: [
          "The second trimester (weeks 14–28) is generally the most comfortable and lowest-risk time to travel.",
          "Most airlines allow travel up to 36 weeks; some require a letter from your provider after 28 weeks.",
          "Always check with your provider before any trip, especially if you have a high-risk pregnancy.",
        ],
      },
      {
        heading: "Air travel tips",
        bullets: [
          "Choose an aisle seat to get up easily and walk every 1–2 hours to reduce blood clot risk.",
          "Stay well hydrated — cabin air is very dry.",
          "Wear compression stockings (15–20 mmHg) on flights longer than 4 hours.",
          "Security scanners are safe; inform agents you are pregnant if you prefer a pat-down.",
        ],
      },
      {
        heading: "Car travel tips",
        bullets: [
          "Wear your seat belt correctly: lap belt below your belly across your hip bones, shoulder strap between your breasts.",
          "Take a 10-minute break every 1–2 hours to stretch and walk.",
          "Keep the airbag on — it is safer than turning it off; just keep the steering wheel or dashboard at least 10 inches away from your belly.",
        ],
      },
      {
        heading: "International travel",
        bullets: [
          "Avoid destinations with active Zika virus transmission.",
          "Check required vaccinations — some live vaccines are not safe in pregnancy.",
          "Carry your prenatal records and provider contact information.",
          "Know where the nearest hospital or clinic is at your destination.",
        ],
      },
    ],
  },
  {
    id: "work",
    title: "Work & Bedrest",
    description:
      "Working safely during pregnancy and what to know about bedrest.",
    emoji: "💼",
    color: "#f97316",
    sections: [
      {
        heading: "Working during pregnancy",
        bullets: [
          "Most pregnancies allow working up to your due date if your job is not physically demanding.",
          "Talk to your employer early about schedule adjustments, remote options, or reduced lifting requirements.",
          "You are entitled to reasonable workplace accommodations under the Pregnant Workers Fairness Act (PWFA) in the US.",
          "If your job involves heavy lifting, long standing shifts, or hazardous exposures, discuss modification with your provider and employer.",
        ],
      },
      {
        heading: "Ergonomics and comfort at work",
        bullets: [
          "Take short breaks every hour to stand, stretch, or walk.",
          "Use a supportive chair with lumbar support and keep your feet slightly elevated.",
          "Avoid sitting or standing in one position for more than 30 minutes at a time.",
          "Keep your workstation at a height that allows relaxed shoulders and a neutral wrist position.",
        ],
      },
      {
        heading: "Bedrest — what it means",
        bullets: [
          "Bedrest may be recommended for conditions like preeclampsia, preterm labor risk, or placenta previa.",
          "It ranges from limiting certain activities to full hospital-level rest — your provider will specify what is allowed.",
          "Ask specifically: Can I shower? Climb stairs? Work from a recliner?",
          "If prescribed, arrange help at home early and discuss whether short-term disability or FMLA applies.",
        ],
      },
    ],
  },
  {
    id: "nutrition",
    title: "Nutrition & Weight Gain",
    description: "Recommended weight gain, key nutrients, and foods to avoid.",
    emoji: "🥦",
    color: "#22c55e",
    sections: [
      {
        heading: "Recommended weight gain",
        bullets: [
          "Underweight (BMI < 18.5): gain 28–40 lbs (13–18 kg).",
          "Normal weight (BMI 18.5–24.9): gain 25–35 lbs (11–16 kg).",
          "Overweight (BMI 25–29.9): gain 15–25 lbs (7–11 kg).",
          "Obese (BMI ≥ 30): gain 11–20 lbs (5–9 kg).",
          "Carrying twins? Add approximately 10 lbs to each range.",
        ],
      },
      {
        heading: "Key nutrients",
        bullets: [
          "Folic acid: 600 mcg/day — reduces neural tube defects. Found in leafy greens, fortified cereals, and prenatal vitamins.",
          "Iron: 27 mg/day — supports increased blood volume. Found in lean red meat, beans, and fortified grains.",
          "Calcium: 1,000 mg/day — for baby's bones and teeth. Found in dairy, fortified plant milks, and tofu.",
          "DHA omega-3: 200–300 mg/day — supports brain and eye development. Found in low-mercury fish (salmon, sardines) and prenatal vitamins.",
          "Iodine: 220 mcg/day — critical for thyroid and brain development. Found in dairy and iodized salt.",
        ],
      },
      {
        heading: "Foods to avoid",
        bullets: [
          "Raw or undercooked meat, poultry, and seafood (listeria, salmonella risk).",
          "High-mercury fish: shark, swordfish, king mackerel, and tilefish.",
          "Unpasteurized dairy products and soft cheeses (brie, feta, queso fresco).",
          "Raw sprouts, unwashed produce.",
          "Alcohol — no amount is proven safe in pregnancy.",
          "Limit caffeine to under 200 mg/day (about one 12-oz cup of coffee).",
        ],
      },
    ],
  },
  {
    id: "exercise",
    title: "Exercise in Pregnancy",
    description:
      "Benefits of staying active, recommended activities, and warning signs to stop.",
    emoji: "🏃‍♀️",
    color: "#14b8a6",
    sections: [
      {
        heading: "Benefits of exercise",
        bullets: [
          "Reduces risk of gestational diabetes, preeclampsia, and cesarean birth.",
          "Improves mood, sleep, and back pain.",
          "Helps control recommended weight gain.",
          "May shorten active labor.",
        ],
      },
      {
        heading: "How much and what kind",
        bullets: [
          "Aim for 150 minutes of moderate-intensity aerobic activity per week (e.g., 30 minutes, 5 days).",
          "Walking, swimming, stationary cycling, prenatal yoga, and low-impact aerobics are excellent choices.",
          "Strength training with light-to-moderate weights is safe; avoid breath-holding (Valsalva maneuver).",
          "After 20 weeks, avoid lying flat on your back for extended periods — this can reduce blood flow to the baby.",
        ],
      },
      {
        heading: "Activities to avoid",
        bullets: [
          "Contact sports (soccer, basketball, hockey) with risk of abdominal trauma.",
          "Activities with a high fall risk: downhill skiing, horseback riding, gymnastics.",
          "Scuba diving (decompression risk to baby).",
          "Hot yoga or exercising in extreme heat — overheating is harmful in the first trimester especially.",
          "Exercising at altitudes above 6,000 feet if you are not already acclimatized.",
        ],
      },
      {
        heading: "Stop and call your provider if you experience",
        bullets: [
          "Vaginal bleeding or fluid leaking.",
          "Chest pain or shortness of breath before exertion.",
          "Dizziness, faintness, or headache.",
          "Calf pain or swelling (possible blood clot sign).",
          "Regular uterine contractions.",
        ],
      },
    ],
  },
  {
    id: "intimacy",
    title: "Intimacy During Pregnancy",
    description:
      "What's safe, what changes, and when to check with your provider.",
    emoji: "💛",
    color: "#ec4899",
    sections: [
      {
        heading: "Is sex safe in pregnancy?",
        bullets: [
          "For most uncomplicated pregnancies, sexual activity is safe throughout all three trimesters.",
          "The baby is protected by the amniotic fluid and the uterus — penetration does not reach the baby.",
          "Desire and comfort naturally change across trimesters; open communication with your partner is key.",
        ],
      },
      {
        heading: "What may feel different",
        bullets: [
          "Increased blood flow to the pelvic area can heighten sensation or cause more intense orgasms.",
          "Breast tenderness, especially in the first trimester, may make some touch uncomfortable.",
          "As the belly grows, certain positions become awkward — side-lying, rear-entry, or woman-on-top positions often remain comfortable longer.",
          "Light spotting after intercourse (from the sensitive cervix) is common but should be reported to your provider.",
        ],
      },
      {
        heading: "When to avoid sex or ask your provider",
        bullets: [
          "Placenta previa (low-lying placenta) — penetration is typically restricted.",
          "Preterm labor risk or cervical incompetence — your provider may advise pelvic rest.",
          "Unexplained vaginal bleeding or discharge.",
          "Your water has broken — risk of infection.",
          "If you have any concern at all, simply ask your provider — there is no judgment in the question.",
        ],
      },
    ],
  },
  {
    id: "medications",
    title: "Medications & Substances",
    description:
      "Safe medications, substances to avoid, and talking to your provider.",
    emoji: "💊",
    color: "#3b82f6",
    sections: [
      {
        heading: "Over-the-counter medications",
        bullets: [
          "Acetaminophen (Tylenol) is generally the safest OTC pain reliever during pregnancy at recommended doses.",
          "Avoid ibuprofen (Advil, Motrin), naproxen (Aleve), and aspirin unless specifically directed by your provider.",
          "For heartburn: calcium-based antacids (Tums) and famotidine (Pepcid) are generally considered safe.",
          "For constipation: fiber, fluids, and docusate sodium (Colace) are safe first steps.",
          "Always check with your provider or pharmacist before starting any OTC medication.",
        ],
      },
      {
        heading: "Prescription medications",
        bullets: [
          "Never stop a prescribed medication without speaking to your provider — stopping may carry more risk than continuing.",
          "Many chronic condition medications (thyroid, blood pressure, antidepressants) can be safely used or switched to pregnancy-safe alternatives.",
          "MotherToBaby (mothertobaby.org) offers free, evidence-based information on specific drug exposures.",
        ],
      },
      {
        heading: "Substances to avoid entirely",
        bullets: [
          "Alcohol — no amount is proven safe. Fetal alcohol spectrum disorder is entirely preventable.",
          "Tobacco — increases risk of preterm birth, low birth weight, placental abruption, and SIDS.",
          "Marijuana — associated with lower birth weight and potential developmental effects; no safe level established.",
          "Illicit drugs — opioids, cocaine, methamphetamine, and others carry serious risks to fetal development.",
          "If you are struggling with substance use, talk honestly with your provider — support is available without judgment.",
        ],
      },
      {
        heading: "Herbal supplements and vitamins",
        bullets: [
          "Many herbal teas and supplements have not been tested in pregnancy — use caution.",
          "Avoid high-dose vitamin A (retinol) — it can cause birth defects; beta-carotene forms are safe.",
          "Black cohosh, pennyroyal, and blue cohosh have been linked to uterine contractions — avoid.",
          "Ginger in food amounts and ginger tea are generally considered safe for nausea.",
        ],
      },
    ],
  },
  {
    id: "warning-signs",
    title: "Warning Signs",
    description:
      "Symptoms that always mean you should call your provider or go to the ER.",
    emoji: "🚨",
    color: "#ef4444",
    sections: [
      {
        heading: "Call your provider or go to the ER immediately for",
        bullets: [
          "Heavy vaginal bleeding (soaking a pad in an hour or passing clots).",
          "Severe abdominal pain or cramping that doesn't ease.",
          "Sudden severe headache, especially with vision changes, swelling, or upper abdominal pain (preeclampsia signs).",
          "Vision changes: blurring, seeing spots, or sudden vision loss.",
          "Significant facial, hand, or leg swelling — especially sudden swelling.",
          "Signs of preterm labor before 37 weeks: regular contractions, low back pressure, or pelvic pressure.",
          "Your water breaking (a gush or a slow trickle of clear fluid).",
          "Decreased fetal movement after 28 weeks (fewer than 10 movements in 2 hours).",
          "Fever over 100.4 °F (38 °C) — not from a common cold.",
          "Difficulty breathing, chest pain, or rapid heart rate.",
          "Severe vomiting that prevents you from keeping any fluid down.",
          "Signs of a blood clot: calf pain, redness, warmth, or swelling in one leg.",
        ],
      },
      {
        heading: "When in doubt",
        bullets: [
          "If something feels wrong, trust your instincts and call — your care team would rather reassure you than have you wait.",
          "Your provider's after-hours line exists for exactly these concerns.",
          "Go directly to the nearest emergency department if you cannot reach anyone and feel seriously unwell.",
        ],
      },
    ],
  },
];
