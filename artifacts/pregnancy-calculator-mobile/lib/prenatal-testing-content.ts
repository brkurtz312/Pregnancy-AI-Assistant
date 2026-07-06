export type Test = {
  time: string;
  tests: string;
  why: string;
};

export type TestDetail = {
  id: string;
  name: string;
  why: string;
  when: string;
  whatIfAbnormal: string;
};

export type HepBTest = TestDetail & {
  subParts: TestDetail[];
};

export type TestCategory = {
  id: string;
  title: string;
  tests: (TestDetail | HepBTest)[];
};

export const PDF_SOURCE_NOTE =
  "Based on ACOG and CDC guidance, from the Routine Prenatal Tests & Procedures reference.";

export const TEST_CATEGORIES: TestCategory[] = [
  {
    id: "first-visit",
    title: "First Prenatal Visit — Standard Panel (typically 6–13 weeks)",
    tests: [
      {
        id: "blood-type-rh",
        name: "Blood Type & Rh Factor",
        why: "Identifies your blood group (A, B, AB, O) and whether you are Rh-positive or Rh-negative. Important for detecting risk of blood incompatibility between you and the baby.",
        when: "First prenatal visit.",
        whatIfAbnormal:
          "If Rh-negative, an antibody screen is repeated at 28 weeks and Rh immune globulin (RhoGAM) is given at 28 weeks and again after delivery if the baby is Rh-positive.",
      },
      {
        id: "antibody-screen",
        name: "Antibody Screen (Indirect Coombs)",
        why: "Detects antibodies in your blood that could attack the baby's red blood cells (hemolytic disease of the newborn).",
        when: "First prenatal visit; repeated at 28 weeks if Rh-negative.",
        whatIfAbnormal:
          "If antibodies are present, further titers, paternal blood typing, and specialist (maternal-fetal medicine) referral for monitoring of fetal anemia.",
      },
      {
        id: "cbc",
        name: "Complete Blood Count (CBC)",
        why: "Screens for anemia (low hemoglobin), infection (white cell count), and low platelets.",
        when: "First prenatal visit; repeated at 24–28 weeks and in the third trimester.",
        whatIfAbnormal:
          "Anemia is treated with iron supplementation and dietary counseling; further workup for iron deficiency, thalassemia, or other causes if severe.",
      },
      {
        id: "hemoglobinopathy-screen",
        name: "Hemoglobin Electrophoresis / Hemoglobinopathy Screen",
        why: "Screens for sickle cell trait/disease and thalassemia based on ancestry or abnormal CBC indices.",
        when: "First prenatal visit (based on ancestry or MCV).",
        whatIfAbnormal:
          "If positive, the partner is also tested; genetic counseling is offered and prenatal diagnosis discussed.",
      },
      {
        id: "rubella-immunity",
        name: "Rubella (German Measles) Immunity",
        why: "Confirms immunity to rubella, which can cause severe birth defects if contracted during pregnancy.",
        when: "First prenatal visit.",
        whatIfAbnormal:
          "If non-immune, avoid exposure during pregnancy and receive MMR vaccination postpartum before discharge.",
      },
      {
        id: "varicella-immunity",
        name: "Varicella (Chickenpox) Immunity",
        why: "Confirms immunity to varicella, which can cause fetal varicella syndrome or severe maternal infection.",
        when: "First prenatal visit (if no reliable history of infection or vaccination).",
        whatIfAbnormal:
          "If non-immune, avoid exposure; VZIG may be given after significant exposure; varicella vaccine given postpartum.",
      },
      {
        id: "hiv-antibody",
        name: "HIV Antibody Test",
        why: "Screens for human immunodeficiency virus. Early treatment dramatically reduces mother-to-child transmission.",
        when: "First prenatal visit; repeat in third trimester if high-risk.",
        whatIfAbnormal:
          "If positive, referral to HIV specialist; antiretroviral therapy is started to reduce vertical transmission (from ~25% to <1%); scheduled cesarean and formula feeding may be advised.",
      },
      {
        id: "syphilis",
        name: "Syphilis (RPR or VDRL)",
        why: "Screens for syphilis, which can cross the placenta and cause miscarriage, stillbirth, or congenital syphilis.",
        when: "First prenatal visit; repeat at 28 weeks and at delivery (universal in many states).",
        whatIfAbnormal:
          "If reactive, confirm with treponemal test; treat with penicillin (only proven cure in pregnancy); partner treatment, monthly titers, and detailed fetal ultrasound.",
      },
      {
        id: "gc-naat",
        name: "Gonorrhea & Chlamydia (NAAT)",
        why: "Screens for common sexually transmitted infections that can cause preterm labor, neonatal conjunctivitis, or pneumonia.",
        when: "First prenatal visit for all patients <25 years and any age with risk factors; repeat in third trimester if high-risk.",
        whatIfAbnormal:
          "Treated with pregnancy-safe antibiotics; partner treatment; retest of cure at 3–4 weeks; retest in third trimester.",
      },
      {
        id: "urinalysis",
        name: "Urinalysis & Urine Culture",
        why: "Screens for asymptomatic bacteriuria (a hidden bladder infection) that can progress to kidney infection and preterm labor; also checks urine protein and glucose.",
        when: "First prenatal visit (culture); dipstick at every subsequent visit.",
        whatIfAbnormal:
          "If bacteriuria is positive, treat with a pregnancy-safe antibiotic and re-culture after treatment; persistent protein may signal kidney disease or preeclampsia.",
      },
      {
        id: "pap-smear",
        name: "Cervical Cancer Screening (Pap smear ± HPV)",
        why: "Screens for cervical dysplasia or cancer, per age-based guidelines.",
        when: "First prenatal visit if due per screening interval.",
        whatIfAbnormal:
          "Colposcopy in pregnancy is safe for evaluation of abnormal results; treatment of dysplasia is usually deferred until postpartum.",
      },
      {
        id: "tb-screening",
        name: "Tuberculosis Screening (risk-based)",
        why: "Screens for latent TB in patients with risk factors (travel, exposure, immunocompromise).",
        when: "First prenatal visit when indicated by risk assessment.",
        whatIfAbnormal:
          "Positive test prompts chest X-ray with abdominal shielding and evaluation for active vs. latent disease; treatment may begin in pregnancy or postpartum depending on activity.",
      },
    ],
  },
  {
    id: "hepatitis",
    title: "Hepatitis Screening — Including Full Hepatitis B Triple Panel",
    tests: [
      {
        id: "hep-b-triple-panel",
        name: "Hepatitis B Triple Panel",
        why: "A complete check of your hepatitis B status using three separate blood markers, so your care team knows whether you have an active infection, are immune, or need vaccination.",
        when: "First prenatal visit in every pregnancy, as part of the CDC-recommended triple panel.",
        whatIfAbnormal:
          "Depends on which of the three markers is abnormal — see each part below for what it means and the next steps.",
        subParts: [
          {
            id: "hbsag",
            name: "Hepatitis B Surface Antigen (HBsAg)",
            why: "Detects current active hepatitis B infection. If positive, the newborn is at high risk of chronic infection unless immediately protected.",
            when: "First prenatal visit in EVERY pregnancy, regardless of prior vaccination or prior negative results. Rescreen at admission for delivery if clinical hepatitis or new exposures.",
            whatIfAbnormal:
              "Confirm with a licensed neutralizing test. Check HBV DNA; if >200,000 IU/mL, start antiviral therapy at 28–32 weeks until birth. Report to Perinatal Hepatitis B Coordinator. Newborn receives HepB immune globulin (HBIG) and HepB vaccine within 12 hours of birth.",
          },
          {
            id: "anti-hbs",
            name: "Hepatitis B Surface Antibody (anti-HBs)",
            why: "Shows whether you are immune to hepatitis B — either from prior vaccination or from resolved past infection.",
            when: "First prenatal visit, as part of the CDC-recommended triple panel, for all pregnant patients ≥18 who have not previously had a triple panel.",
            whatIfAbnormal:
              "If anti-HBs ≥10 mIU/mL alone (and HBsAg/anti-HBc negative): immune from vaccination; no further action. If negative and HBsAg negative: not immune — begin HepB vaccine series (Engerix-B, Recombivax-HB, or Twinrix) during pregnancy.",
          },
          {
            id: "anti-hbc",
            name: "Hepatitis B Core Antibody, Total (anti-HBc)",
            why: "Detects past or current hepatitis B infection. Positive anti-HBc means you have been exposed to the virus at some point (a vaccine alone does not produce this antibody).",
            when: "First prenatal visit as part of the triple panel (with HBsAg and anti-HBs).",
            whatIfAbnormal:
              "If anti-HBc positive with HBsAg positive: active infection — manage as above (HBV DNA, antiviral if high, neonatal prophylaxis). If anti-HBc positive with HBsAg negative and anti-HBs positive: resolved past infection. If anti-HBc positive alone (isolated): further evaluation for occult HBV infection with HBV DNA testing.",
          },
        ],
      },
      {
        id: "hep-c",
        name: "Hepatitis C Antibody",
        why: "Screens for chronic hepatitis C, which can be transmitted to the baby (~6% vertical transmission).",
        when: "First prenatal visit in every pregnancy (universal screening, CDC/ACOG 2021).",
        whatIfAbnormal:
          "If reactive, confirm with HCV RNA (viral load). If active infection: refer for treatment planning (usually postpartum), avoid invasive fetal procedures when possible, and arrange infant follow-up testing at 18 months (or HCV RNA at 2 months).",
      },
    ],
  },
  {
    id: "genetic",
    title: "Genetic & Aneuploidy Screening (offered to all patients)",
    tests: [
      {
        id: "carrier-screening",
        name: "Carrier Screening (Cystic Fibrosis, SMA, Fragile X panel)",
        why: "Determines whether you (and your partner) carry genes for inherited conditions that could affect the baby.",
        when: "Ideally preconception or first prenatal visit; may be expanded (pan-ethnic) or ancestry-based.",
        whatIfAbnormal:
          "If both partners are carriers of the same condition, genetic counseling is offered, along with diagnostic testing (CVS or amniocentesis) and reproductive options.",
      },
      {
        id: "cfdna-nipt",
        name: "Cell-free DNA (cfDNA / NIPT)",
        why: "Highly sensitive blood screen for trisomies 21 (Down syndrome), 18, and 13, and optionally sex chromosome aneuploidies. ACOG/SMFM recommend making cfDNA routinely available to all patients.",
        when: "From 10 weeks through the rest of pregnancy; ideally 10–13 weeks.",
        whatIfAbnormal:
          "Screen-positive results require confirmation with diagnostic testing (CVS at 10–13 weeks or amniocentesis at 15+ weeks) before any irreversible decisions. Genetic counseling is offered.",
      },
      {
        id: "first-trimester-combined",
        name: "First-Trimester Combined Screen (NT + PAPP-A + hCG)",
        why: "Alternative aneuploidy screen using nuchal translucency ultrasound plus two blood markers.",
        when: "11 weeks 0 days – 13 weeks 6 days.",
        whatIfAbnormal:
          "High-risk result prompts diagnostic testing (CVS or amniocentesis) and detailed anatomy ultrasound; increased NT with normal karyotype prompts fetal echocardiogram.",
      },
      {
        id: "quad-screen",
        name: "Quad Screen (AFP, hCG, estriol, inhibin-A)",
        why: "Second-trimester blood screen for Down syndrome, trisomy 18, and open neural tube defects (like spina bifida).",
        when: "15–22 weeks (ideally 16–18 weeks).",
        whatIfAbnormal:
          "Elevated MSAFP → detailed ultrasound for neural tube or abdominal wall defects. Abnormal aneuploidy markers → offer diagnostic amniocentesis and genetic counseling.",
      },
      {
        id: "cvs",
        name: "Chorionic Villus Sampling (CVS) — diagnostic, optional",
        why: "Diagnostic test that samples placental tissue for chromosomal analysis when screening is abnormal or risk is high.",
        when: "10–13 weeks.",
        whatIfAbnormal:
          "Provides a definitive karyotype/microarray result; counseling regarding continuation, further evaluation, or pregnancy options based on findings.",
      },
      {
        id: "amniocentesis",
        name: "Amniocentesis — diagnostic, optional",
        why: "Diagnostic test sampling amniotic fluid for chromosomal, genetic, and (rarely) infectious analysis.",
        when: "15+ weeks (typically 15–20 weeks).",
        whatIfAbnormal:
          "Definitive genetic diagnosis; ~1 in 900 procedure-related loss risk. Guides pregnancy management and delivery planning.",
      },
    ],
  },
  {
    id: "second-trimester",
    title: "Second Trimester (14–27 weeks)",
    tests: [
      {
        id: "anatomy-ultrasound",
        name: "Detailed Anatomy Ultrasound",
        why: "Comprehensive scan of fetal anatomy, growth, placental location, cervical length, and amniotic fluid.",
        when: "18–22 weeks.",
        whatIfAbnormal:
          "If abnormalities are found: referral to maternal-fetal medicine, fetal echocardiogram if cardiac concern, possible diagnostic testing, and delivery planning at a facility equipped for the finding.",
      },
      {
        id: "maternal-serum-afp",
        name: "Maternal Serum AFP (if not done as part of quad)",
        why: "Screens for open neural tube defects and abdominal wall defects.",
        when: "15–20 weeks (ideally 16–18 weeks).",
        whatIfAbnormal:
          "Elevated levels prompt detailed anatomy scan; unexplained elevation is associated with later pregnancy complications and warrants closer surveillance.",
      },
      {
        id: "glucose-challenge-1h",
        name: "1-Hour Glucose Challenge Test (50 g)",
        why: "Screens for gestational diabetes, which increases risks of macrosomia, birth trauma, and neonatal hypoglycemia.",
        when: "24–28 weeks (earlier at first visit if high-risk: obesity, prior GDM, family history).",
        whatIfAbnormal:
          "If ≥130–140 mg/dL (institutional cutoff), proceed to 3-hour 100 g glucose tolerance test to confirm gestational diabetes.",
      },
      {
        id: "glucose-tolerance-3h",
        name: "3-Hour Glucose Tolerance Test (100 g)",
        why: "Confirmatory diagnostic test for gestational diabetes after a positive 1-hour screen.",
        when: "24–28 weeks (after abnormal 1-hour screen).",
        whatIfAbnormal:
          "Two or more abnormal values = gestational diabetes: nutrition counseling, blood glucose monitoring, possible metformin or insulin, growth ultrasounds, and antenatal testing.",
      },
      {
        id: "cbc-recheck",
        name: "CBC Recheck",
        why: "Rechecks for anemia as blood volume expansion peaks.",
        when: "24–28 weeks.",
        whatIfAbnormal:
          "If anemic, oral iron therapy; IV iron if severe or intolerant of oral iron.",
      },
      {
        id: "repeat-antibody-screen",
        name: "Repeat Antibody Screen (Rh-negative patients)",
        why: "Confirms no new red-cell antibodies have developed before RhoGAM.",
        when: "28 weeks (Rh-negative patients only).",
        whatIfAbnormal:
          "If new antibodies: MFM referral for fetal anemia surveillance (middle cerebral artery Doppler). If none: administer anti-D immune globulin (RhoGAM).",
      },
    ],
  },
  {
    id: "third-trimester",
    title: "Third Trimester (28–40+ weeks)",
    tests: [
      {
        id: "tdap",
        name: "Tdap Vaccination",
        why: "Not a test, but a routine prenatal intervention: booster protects the newborn from pertussis (whooping cough) via passive maternal antibodies.",
        when: "27–36 weeks of every pregnancy.",
        whatIfAbnormal:
          "No 'abnormal' result — universally recommended. Deferred only for documented anaphylaxis to a component.",
      },
      {
        id: "gbs-culture",
        name: "Group B Streptococcus (GBS) Culture",
        why: "Screens for vaginal/rectal colonization with GBS, which can cause serious newborn infection if not treated in labor.",
        when: "36 0/7 – 37 6/7 weeks (updated ACOG timing).",
        whatIfAbnormal:
          "If positive, receive intravenous antibiotics (penicillin preferred) during labor. Unknown status at labor onset with risk factors → treat presumptively.",
      },
      {
        id: "repeat-hiv-syphilis-gc",
        name: "Repeat HIV / Syphilis / Gonorrhea-Chlamydia (risk-based)",
        why: "Detects late-pregnancy acquisition of infection to prevent perinatal transmission.",
        when: "Third trimester (28–36 weeks) for high-risk patients and universally in many states for HIV and syphilis.",
        whatIfAbnormal:
          "New positives are managed as at initial screen — with pregnancy-safe antibiotics or antiretrovirals and infant prophylaxis planning.",
      },
      {
        id: "rescreen-hbsag",
        name: "Rescreen HBsAg (risk-based)",
        why: "Detects late-pregnancy hepatitis B acquisition or ongoing risk in previously negative patients.",
        when: "At admission for delivery if clinical hepatitis, high-risk behaviors, or previously untested.",
        whatIfAbnormal:
          "Positive results trigger immediate neonatal HBIG + HepB vaccine within 12 hours of birth.",
      },
      {
        id: "fetal-growth-ultrasound",
        name: "Fetal Growth Ultrasound (indicated)",
        why: "Assesses fetal size, growth, and amniotic fluid when there is a medical or obstetric concern.",
        when: "Third trimester as indicated (diabetes, hypertension, prior IUGR, size-dates discrepancy).",
        whatIfAbnormal:
          "Growth restriction or macrosomia prompts antenatal testing, changes in delivery timing, and possible mode-of-delivery counseling.",
      },
      {
        id: "nst",
        name: "Non-Stress Test (NST)",
        why: "Monitors the baby's heart rate pattern over time to check for signs of good oxygenation and well-being, especially in higher-risk pregnancies.",
        when: "Typically starting 32–36 weeks in higher-risk pregnancies, often weekly or twice weekly.",
        whatIfAbnormal:
          "A non-reactive (non-reassuring) result prompts further evaluation, often with a biophysical profile or vibroacoustic stimulation, and may lead to closer monitoring or delivery depending on gestational age.",
      },
      {
        id: "bpp",
        name: "Biophysical Profile (BPP)",
        why: "Combines a non-stress test with an ultrasound assessment of amniotic fluid, fetal breathing, movement, and muscle tone to give a fuller picture of fetal well-being.",
        when: "Typically starting 32–36 weeks in higher-risk pregnancies, often when an NST is non-reactive or as part of routine antenatal testing.",
        whatIfAbnormal:
          "A low BPP score prompts closer monitoring, Doppler studies, or delivery planning, depending on gestational age and how low the score is.",
      },
      {
        id: "betamethasone",
        name: "Betamethasone Injection (Antenatal Corticosteroids)",
        why: "Not a test — an injected medication given to help the baby's lungs mature faster, reducing the risk of respiratory distress, bleeding in the brain, and bowel complications if the baby is born preterm.",
        when: "Typically given between 24 0/7 and 34 0/7 weeks when preterm birth is anticipated within 7 days; a single course may also be considered in select patients at 34 0/7–36 6/7 weeks who have not previously received it.",
        whatIfAbnormal:
          "There is no 'abnormal' result — but a single rescue course may be given if delivery risk returns at least 14 days after the first course and the pregnancy is still under 34 weeks. Blood glucose is monitored afterward, since it can rise temporarily, especially in patients with diabetes.",
      },
    ],
  },
];

export const TIMELINE: Test[] = [
  {
    time: "Before 8 weeks",
    tests: "Pregnancy confirmation, dating ultrasound when needed",
    why: "Confirms viability and helps establish the due date so later testing can be timed correctly.",
  },
  {
    time: "8–12 weeks",
    tests:
      "CBC, blood type/Rh, antibody screen, HIV, hepatitis B, hepatitis C, syphilis, rubella, varicella, urine culture, gonorrhea/chlamydia",
    why: "Looks for anemia, infection, immunity, and blood factors that may affect the pregnancy or baby.",
  },
  {
    time: "9+ weeks",
    tests: "Cell-free DNA screening, if desired and appropriate",
    why: "Screens for common chromosomal conditions such as trisomy 21, 18, and 13.",
  },
  {
    time: "Early pregnancy",
    tests: "Carrier screening, if not previously done",
    why: "Checks whether a parent carries certain inherited conditions.",
  },
  {
    time: "20–22 weeks",
    tests: "Anatomy ultrasound",
    why: "Evaluates fetal anatomy, growth, and placental location.",
  },
  {
    time: "24–28 weeks",
    tests: "Gestational diabetes screening",
    why: "Looks for diabetes that develops during pregnancy.",
  },
  {
    time: "Around 28 weeks",
    tests:
      "Repeat CBC, HIV, syphilis; repeat type and screen with RhoGAM if Rh negative",
    why: "Rechecks for anemia and infection and helps prevent Rh sensitization in Rh-negative patients.",
  },
  {
    time: "27–36 weeks",
    tests: "Tdap vaccine",
    why: "Helps protect the newborn from pertussis after birth.",
  },
  {
    time: "32–36 weeks",
    tests: "RSV vaccine in appropriate seasonal circumstances",
    why: "Helps reduce the baby's risk of serious RSV illness after birth.",
  },
  {
    time: "36–37 weeks",
    tests: "Group B strep testing",
    why: "Identifies who should receive antibiotics during labor to help protect the newborn.",
  },
];

export const FAQS: { q: string; a: string }[] = [
  {
    q: "Why are so many blood tests done early?",
    a: "Many important conditions in pregnancy do not cause symptoms at first. Early testing helps identify problems while there is time to treat them or plan care safely.",
  },
  {
    q: "Are all genetic tests required?",
    a: "No. Some genetic tests are optional, and patients can decide how much information they want. Screening and diagnostic testing each have benefits, limits, and different purposes.",
  },
  {
    q: "Will I need more testing than this?",
    a: "Possibly. Some pregnancies need extra monitoring, while others follow the routine schedule. Your care team can explain which tests apply to your pregnancy and why.",
  },
];

export const VISIT_QUESTIONS = [
  "Which tests are routine for my pregnancy?",
  "Are any optional genetic tests right for me?",
  "Will I need any extra monitoring later in pregnancy?",
  "What should I expect during my next ultrasound or lab visit?",
  "Are there vaccines I should receive during this pregnancy?",
];

/**
 * Parses the loose, human-written week-range strings used in `TIMELINE`
 * (e.g. "8–12 weeks", "Before 8 weeks", "9+ weeks", "Around 28 weeks") into a
 * numeric [start, end] week range. Falls back to an open range when nothing
 * can be parsed, so unusual entries are never silently dropped.
 */
function parseWeekRange(time: string): [number, number] {
  const nums = (time.match(/\d+/g) ?? []).map(Number);
  if (/before/i.test(time)) return [0, nums[0] ?? 0];
  if (/\+/.test(time)) return [nums[0] ?? 0, 999];
  if (/around/i.test(time)) {
    const n = nums[0] ?? 0;
    return [Math.max(0, n - 2), n + 2];
  }
  if (nums.length >= 2) return [nums[0], nums[1]];
  if (nums.length === 1) return [nums[0], nums[0]];
  return [0, 999];
}

/**
 * Returns timeline entries relevant to a given gestational week: anything
 * already in range, plus items coming up within the next ~3 weeks, so a
 * patient can see both "what's happening now" and "what's coming next".
 */
export function getTimelineForWeeks(weeks: number): Test[] {
  return TIMELINE.filter((t) => {
    const [lo, hi] = parseWeekRange(t.time);
    return weeks >= lo - 1 && weeks <= hi + 3;
  });
}
