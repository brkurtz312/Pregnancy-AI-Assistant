# Changelog

All notable changes to the Fetal Development Viewer / Pregnancy AI Assistant are documented here.  
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).  
Versioning follows [Semantic Versioning](https://semver.org/).

---

## [Unreleased] — v1.1.0

### Added
- **Clinical Info Drawer** — Each of the 8 fetal development stages now includes a "Clinical Reference" toggle button exposing stage-specific sonographic benchmarks:
  - MSD values and gestational sac failure criteria (Stages 1–2)
  - CRL reference table 6–13 weeks; yolk sac norms; cardiac activity thresholds; small sac sign (Stage 3)
  - NT screening window (CRL 45–84 mm, 11w3d–13w6d); combined first-trimester screen parameters (Stage 4)
  - Biometry onset (BPD, HC, AC, FL); nuchal fold thresholds; cervical length screening (Stage 5)
  - ACOG anatomy scan checklist 18–22 wks; anomaly thresholds; viability reference (Stage 6)
  - UA Doppler S/D ratios by gestational window; SGA/IUGR cutoffs; AEDF/REDF significance (Stage 7)
  - Term assessment: AFI, EFW (Hadlock ±15%), UA Doppler, macrosomia and oligohydramnios thresholds (Stage 8)
- **ClinicalDrawer React component** — Animated expand/collapse panel with parameter grid and flagged action notes; auto-closes on stage navigation
- **TypeScript interfaces** — `ClinicalParam`, `ClinicalData`, `Stage` added to `FetalDevelopmentViewer.tsx` for full type safety
- **OB/GYN Ultrasound Clinical Reference Guide** — Standalone markdown reference document (`OBGYN_Ultrasound_Clinical_Reference.md`) mapping all 8 stages to ultrasound benchmarks, screening windows, biometry nomograms, and pathological cutoffs

### Changed
- `FetalDevelopmentViewer.tsx` — `alignItems` updated from `center` to `flex-start` on content row so image stays top-aligned when clinical drawer expands
- `STAGES` array extended with `clinical` field for all 8 stages

### Environments
- Web: deployed to [fetal-development.pplx.app](https://fetal-development.pplx.app) ✓
- iOS: pending — target next App Store submission post v1.0.0 review clearance

---

## [1.0.0] — 2026-06-22 — Initial Release

### Added
- **Fetal Development Viewer** — 8-stage interactive viewer with 3D AI-generated realistic images (GPT Image 2); womb environment renders; circular-cropped WebP format
- **Maternal Body Cross-Section Viewer** — 8-stage anatomical sagittal cross-section viewer with portrait-ratio AI-generated images
- **Cross-viewer navigation** — Shared nav bar (Fetal View / Maternal View toggle) with URL hash sync (`#stage=N`) preserving stage context on switch
- **Autoplay mode** — 7-second interval slideshow through all 8 stages
- **Stage progress indicator** — Tappable dot-bar showing current position and completion
- **Replit main app integration** — `FetalDevelopmentViewer.tsx` and `MaternalDevelopmentViewer.tsx` embedded in Development tab of pregnancy calculator; Fetal/Maternal sub-toggle added to `calculator.tsx`
- **GitHub repository** — Source pushed to `brkurtz312/Pregnancy-AI-Assistant`

### Environments
- Web (standalone): [fetal-development.pplx.app](https://fetal-development.pplx.app) · [maternal-development.pplx.app](https://maternal-development.pplx.app)
- Web (main app): Replit deployment via `artifacts/pregnancy-calculator`
- iOS: submitted to App Store Connect — currently in review

### Tech Stack
- React 18 · TypeScript · Vite · pnpm
- shadcn/ui · Wouter routing · Clerk auth · React Query
- WebP image format (~360 KB total for 8 fetal + 8 maternal images)

---

## Versioning Reference

| Bump | Trigger | iOS Submission Required |
|---|---|---|
| PATCH (x.x.N) | Clinical data corrections, typo fixes, UI micro-adjustments | No — web deploy only |
| MINOR (x.N.0) | New features (clinical drawer, new viewer modes, additional stages) | Yes |
| MAJOR (N.0.0) | Architecture changes, auth system updates, new app sections | Yes — full regression |

---

*Maintained by Dr. B.R. Kurtz, MD · OB/GYN · MIGS · Franklin, TN*  
*Sources: ACOG Practice Bulletins · ISUOG Guidelines · Hadlock biometry nomograms · FMF NT measurement standards*
