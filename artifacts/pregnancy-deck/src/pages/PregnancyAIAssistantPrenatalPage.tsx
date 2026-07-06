import React from "react";

const timeline = [
  {
    phase: "Before 8 weeks",
    heading: "Getting started",
    detail:
      "Early care often includes pregnancy confirmation and, when needed, an ultrasound to confirm viability and establish the due date.",
    tests: [
      {
        name: "Pregnancy confirmation and dating ultrasound",
        type: "Ultrasound",
        importance: "Routine",
        why: "Establishes accurate dating so later prenatal testing is timed correctly.",
        notes:
          "This early visit may also include counseling about vitamins, medications, nutrition, exercise, warning signs, and family history.",
      },
    ],
  },
  {
    phase: "8–12 weeks",
    heading: "First prenatal labs",
    detail:
      "Most routine prenatal blood and urine testing begins here, along with early discussion of genetic screening options.",
    tests: [
      {
        name: "CBC, blood type/Rh, antibody screen",
        type: "Blood test",
        importance: "Routine",
        why: "Checks for anemia, platelet concerns, blood type, Rh status, and antibodies that may affect the baby.",
        notes: "This is part of standard early pregnancy lab work.",
      },
      {
        name: "HIV, hepatitis B, hepatitis C, and syphilis screening",
        type: "Blood test",
        importance: "Routine",
        why: "Looks for infections that may affect maternal health, pregnancy management, or newborn care.",
        notes: "Early identification allows treatment or preventive planning.",
      },
      {
        name: "Rubella and varicella immunity",
        type: "Blood test",
        importance: "Routine",
        why: "Shows whether immunity is present to infections that are important in pregnancy.",
        notes: "These are usually checked once during early prenatal care.",
      },
      {
        name: "Urine culture and gonorrhea/chlamydia screening",
        type: "Urine test",
        importance: "Routine",
        why: "Checks for urinary infection and sexually transmitted infections that may affect pregnancy or the baby.",
        notes:
          "Some urine findings, such as GBS bacteriuria, may change delivery planning later.",
      },
      {
        name: "Hemoglobin A1C",
        type: "Blood test",
        importance: "Routine",
        why: "Screens for previously unrecognized diabetes when prenatal care begins before 24 weeks.",
        notes: "This is different from later gestational diabetes screening.",
      },
      {
        name: "Cervical cancer screening, thyroid testing, TB screening, or baseline preeclampsia labs",
        type: "Selected tests",
        importance: "If indicated",
        why: "Used when age, history, symptoms, or medical risk factors make additional evaluation appropriate.",
        notes: "Not every patient needs these tests during pregnancy.",
      },
    ],
  },
  {
    phase: "After 9 weeks",
    heading: "Genetic screening choices",
    detail:
      "Genetic testing options are usually discussed early so patients can decide what information they want during pregnancy.",
    tests: [
      {
        name: "Cell-free DNA screening (NIPT/cfDNA)",
        type: "Blood test",
        importance: "Optional",
        why: "Screens for common chromosomal conditions such as trisomy 21, 18, and 13.",
        notes:
          "Some pregnancies may be better served by genetic counseling or diagnostic testing.",
      },
      {
        name: "Carrier screening",
        type: "Blood test",
        importance: "Optional",
        why: "Checks whether a parent carries certain inherited genetic conditions.",
        notes:
          "Positive results may lead to partner screening or genetic counseling.",
      },
    ],
  },
  {
    phase: "20–22 weeks",
    heading: "Mid-pregnancy anatomy scan",
    detail:
      "Most patients have a detailed look at fetal growth, anatomy, and placental location during this stage.",
    tests: [
      {
        name: "Standard anatomy ultrasound",
        type: "Ultrasound",
        importance: "Routine",
        why: "Evaluates fetal anatomy, growth, and placental location.",
        notes: "This is one of the major routine milestones in prenatal care.",
      },
      {
        name: "Detailed anatomy ultrasound",
        type: "Ultrasound",
        importance: "If indicated",
        why: "Used when risk factors increase concern for fetal structural or genetic differences.",
        notes:
          "Reasons can include abnormal earlier screening, multiple gestation, maternal age 35 or older, diabetes diagnosed early, or a prior affected pregnancy.",
      },
    ],
  },
  {
    phase: "24–28 weeks",
    heading: "Gestational diabetes screening",
    detail:
      "This part of pregnancy usually includes screening for diabetes that develops during pregnancy.",
    tests: [
      {
        name: "1-hour glucose challenge test",
        type: "Blood test",
        importance: "Routine",
        why: "Helps identify gestational diabetes so treatment can begin if needed.",
        notes:
          "If the glucose drink cannot be completed, another plan such as home glucose monitoring may sometimes be used.",
      },
    ],
  },
  {
    phase: "Around 28 weeks",
    heading: "Third-trimester repeat testing",
    detail:
      "Repeat testing at the start of the third trimester helps reassess anemia, infection, and Rh-related care.",
    tests: [
      {
        name: "Repeat CBC, HIV, and syphilis screening",
        type: "Blood test",
        importance: "Routine",
        why: "Checks again for anemia and infections that can affect pregnancy or delivery planning.",
        notes:
          "Even normal early pregnancy results are often repeated later in pregnancy.",
      },
      {
        name: "Repeat type and screen with RhoGAM for Rh-negative patients",
        type: "Blood test",
        importance: "If indicated",
        why: "Helps prevent Rh sensitization in Rh-negative patients with a negative earlier antibody screen.",
        notes:
          "The repeat type and screen is generally drawn the same day RhoGAM is given.",
      },
    ],
  },
  {
    phase: "27–36 weeks",
    heading: "Vaccines that protect baby too",
    detail:
      "Vaccines in pregnancy can protect both the pregnant patient and the newborn after delivery.",
    tests: [
      {
        name: "Tdap vaccine",
        type: "Vaccine",
        importance: "Routine",
        why: "Helps protect the newborn from pertussis after birth.",
        notes:
          "Recommended during each pregnancy, ideally early in the 27 to 36 week window.",
      },
      {
        name: "RSV vaccine",
        type: "Vaccine",
        importance: "If indicated",
        why: "May reduce the baby’s risk of serious RSV illness after birth when given during the recommended seasonal window.",
        notes:
          "Typically discussed for patients expected to deliver during RSV season.",
      },
    ],
  },
  {
    phase: "36–37 weeks",
    heading: "Planning for labor",
    detail:
      "Late pregnancy testing helps guide safe care during labor and delivery.",
    tests: [
      {
        name: "Group B strep testing",
        type: "Swab test",
        importance: "Routine",
        why: "Identifies who should receive antibiotics during labor to help protect the newborn from infection.",
        notes:
          "If there is a penicillin allergy, clindamycin sensitivity may also be checked.",
      },
    ],
  },
];

const badgeClasses: Record<string, string> = {
  Routine: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  Optional: "bg-amber-50 text-amber-700 ring-amber-200",
  "If indicated": "bg-violet-50 text-violet-700 ring-violet-200",
  "Blood test": "bg-sky-50 text-sky-700 ring-sky-200",
  "Urine test": "bg-cyan-50 text-cyan-700 ring-cyan-200",
  Ultrasound: "bg-rose-50 text-rose-700 ring-rose-200",
  Vaccine: "bg-orange-50 text-orange-700 ring-orange-200",
  "Swab test": "bg-fuchsia-50 text-fuchsia-700 ring-fuchsia-200",
  "Selected tests": "bg-slate-100 text-slate-700 ring-slate-200",
};

function Chip({ children }: { children: React.ReactNode }) {
  const key = String(children);
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset ${
        badgeClasses[key] || "bg-slate-100 text-slate-700 ring-slate-200"
      }`}
    >
      {children}
    </span>
  );
}

export default function PregnancyAIAssistantPrenatalPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <section className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-start">
            <div>
              <div className="inline-flex items-center rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-rose-700">
                Pregnancy AI Assistant
              </div>
              <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
                Prenatal Testing Timeline
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-slate-600">
                A patient-friendly guide to what testing is commonly done during
                pregnancy, when it usually happens, and why it matters.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Chip>Routine</Chip>
                <Chip>Optional</Chip>
                <Chip>If indicated</Chip>
                <Chip>Blood test</Chip>
                <Chip>Urine test</Chip>
                <Chip>Ultrasound</Chip>
                <Chip>Vaccine</Chip>
              </div>
            </div>

            <aside className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm">
              <h2 className="text-xl font-semibold">
                What patients should know
              </h2>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-200">
                <li>
                  Most tests are done to give reassurance, find common problems
                  early, and guide safe pregnancy care.
                </li>
                <li>
                  Some tests are routine for most pregnancies, while others
                  depend on symptoms, history, or earlier results.
                </li>
                <li>
                  The exact schedule may change based on medical history, twins
                  or higher-order multiples, or when prenatal care begins.
                </li>
              </ul>
              <div className="mt-5 rounded-2xl bg-white/10 p-4 text-sm leading-6 text-slate-100 ring-1 ring-white/10">
                This page is educational and should support, not replace,
                individualized advice from the prenatal care team.
              </div>
            </aside>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
        <div className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
          <h2 className="text-xl font-semibold text-slate-900">
            Visit rhythm during routine prenatal care
          </h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Many pregnancies follow visits about every 6 weeks until 28 weeks,
            every 3 weeks until 36 weeks, and then weekly until delivery,
            although higher-risk pregnancies may need more frequent care.
          </p>
          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl bg-sky-50 p-4 ring-1 ring-sky-100">
              <p className="text-sm font-medium text-sky-800">Up to 28 weeks</p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                Every 6 weeks
              </p>
            </div>
            <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-100">
              <p className="text-sm font-medium text-rose-800">
                28 to 36 weeks
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                Every 3 weeks
              </p>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
              <p className="text-sm font-medium text-amber-800">
                After 36 weeks
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-900">
                Every week
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8 lg:pb-14">
        <div className="space-y-8">
          {timeline.map((block) => (
            <article
              key={block.phase}
              className="rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200"
            >
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.16em] text-rose-600">
                    {block.phase}
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    {block.heading}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    {block.detail}
                  </p>
                </div>
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                {block.tests.map((test) => (
                  <div
                    key={test.name}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-5"
                  >
                    <div className="flex flex-wrap gap-2">
                      <Chip>{test.importance}</Chip>
                      <Chip>{test.type}</Chip>
                    </div>
                    <h3 className="mt-4 text-lg font-semibold text-slate-900">
                      {test.name}
                    </h3>
                    <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                      <div>
                        <p className="font-semibold text-slate-900">
                          Why it is done
                        </p>
                        <p>{test.why}</p>
                      </div>
                      <div>
                        <p className="font-semibold text-slate-900">
                          What patients should know
                        </p>
                        <p>{test.notes}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 pb-14 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-3xl bg-slate-900 p-6 text-white shadow-sm">
            <h2 className="text-xl font-semibold">
              When extra testing may be needed
            </h2>
            <p className="mt-3 text-sm leading-6 text-slate-200">
              Some pregnancies need added monitoring because of high blood
              pressure, diabetes, twins, fetal growth concerns, abnormal earlier
              testing, decreased fetal movement, or other maternal or fetal
              concerns.
            </p>
            <ul className="mt-4 space-y-2 text-sm text-slate-100">
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-rose-300" />
                <span>Repeat ultrasounds.</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-rose-300" />
                <span>Nonstress testing (NST).</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-rose-300" />
                <span>Biophysical profile (BPP).</span>
              </li>
              <li className="flex gap-2">
                <span className="mt-1 h-2 w-2 rounded-full bg-rose-300" />
                <span>
                  Additional visits or lab testing based on symptoms or prior
                  results.
                </span>
              </li>
            </ul>
          </div>

          <div className="rounded-3xl bg-rose-50 p-6 shadow-sm ring-1 ring-rose-100">
            <h2 className="text-xl font-semibold text-slate-900">
              Questions to ask at your next visit
            </h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
              {[
                "Which tests are routine for my pregnancy?",
                "Are any optional genetic tests right for me?",
                "Will I need extra monitoring later in pregnancy?",
                "What should I expect during my next lab visit or ultrasound?",
                "Are there vaccines I should receive during this pregnancy?",
              ].map((item) => (
                <li
                  key={item}
                  className="rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200"
                >
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </main>
  );
}
