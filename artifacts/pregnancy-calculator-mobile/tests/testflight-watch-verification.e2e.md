# TestFlight — Apple Watch Verification Checklist

Manual verification steps to run after installing a new TestFlight build on a paired Apple Watch.  
Repeat for each hardware size available (38 mm, 40 mm, 44 mm, 45 mm, 49 mm Ultra).

---

## Prerequisites

- iPhone running the TestFlight build under test
- Apple Watch paired and synced to that iPhone
- TestFlight installed on the iPhone; Watch app sideloaded automatically by watchOS

---

## 1 — Watch app icon

**Why:** App Store Connect validates that `CFBundleIconFiles` is present (ITMS-90391), but it
does not verify that the icon renders correctly at all Watch display sizes. Transparent regions,
an incorrect color profile, or sub-optimal compositing can produce a blank or distorted icon on
specific hardware even when the build passes Apple's validator.

**Icon source:** `watchapp/Assets.xcassets/AppIcon.appiconset/AppIcon.png`  
**Expected format:** 1024 × 1024 px, 8-bit sRGB, no alpha channel (verified by `pnpm run validate:watch-icons`)

| Step | Action | Expected result |
|------|--------|-----------------|
| 1.1 | Press the Digital Crown to open the app grid | The **Pregnancy AI** icon is visible in the grid |
| 1.2 | Inspect the icon at normal viewing distance | Full-color baby-in-heart illustration, no blank or distorted areas |
| 1.3 | Open **Watch** app on iPhone → My Watch → scroll to Pregnancy AI | The Pregnancy AI icon appears correctly in the iPhone Watch settings list |
| 1.4 | Add the app to the Dock (hold Digital Crown → add) | Icon appears correctly in the Dock |

**Pass criteria:** Icon is visible and renders correctly in all four locations above on every tested hardware size.

---

## 2 — Kick counter

| Step | Action | Expected result |
|------|--------|-----------------|
| 2.1 | Open the Pregnancy AI Watch app → Kicks tab | Kick counter screen loads; count shows 0 |
| 2.2 | Tap the kick button 5 times | Counter increments to 5 with haptic feedback on each tap |
| 2.3 | Put iPhone out of reach (airplane mode) | Counter continues to increment normally |
| 2.4 | Restore iPhone connectivity | Kick session syncs to the iPhone app automatically |

**Pass criteria:** Kicks are counted, persisted offline, and delivered to the iPhone after reconnect.

---

## 3 — Contraction timer

| Step | Action | Expected result |
|------|--------|-----------------|
| 3.1 | Open the Pregnancy AI Watch app → Contractions tab | Contraction timer screen loads |
| 3.2 | Tap **Start** to begin a contraction | Timer counts up; Start button changes to **Stop** |
| 3.3 | Tap **Stop** | Contraction duration is recorded; interval to the next contraction begins counting |
| 3.4 | Repeat until interval < 5 minutes | Watch delivers a haptic alert and shows a red warning about contraction frequency |
| 3.5 | Confirm alert dismisses correctly | Tapping dismiss removes the warning; timer is ready for the next contraction |

**Pass criteria:** Timer starts/stops correctly, intervals are measured, and the < 5-minute alert fires reliably.

---

## 4 — Tips carousel

| Step | Action | Expected result |
|------|--------|-----------------|
| 4.1 | Open the Pregnancy AI Watch app → Tips tab | Tips carousel loads with gestational-week content |
| 4.2 | Swipe through cards | Each card shows tip text and an emoji; no blank cards |

**Pass criteria:** Tips content is visible and navigable.

---

## Sign-off

| Build | Tester | Device | watchOS | Date | Icon ✓ | Kicks ✓ | Contractions ✓ | Tips ✓ | Notes |
|-------|--------|--------|---------|------|--------|---------|----------------|--------|-------|
| #124  |        |        |         |      |        |         |                |        |       |

Record any failures as issues against the relevant task before approving the build for wider TestFlight distribution.
