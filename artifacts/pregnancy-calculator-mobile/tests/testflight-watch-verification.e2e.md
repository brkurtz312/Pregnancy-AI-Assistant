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

| Step | Action                                                           | Expected result                                                           |
| ---- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1.1  | Press the Digital Crown to open the app grid                     | The **Pregnancy AI** icon is visible in the grid                          |
| 1.2  | Inspect the icon at normal viewing distance                      | Full-color baby-in-heart illustration, no blank or distorted areas        |
| 1.3  | Open **Watch** app on iPhone → My Watch → scroll to Pregnancy AI | The Pregnancy AI icon appears correctly in the iPhone Watch settings list |
| 1.4  | Add the app to the Dock (hold Digital Crown → add)               | Icon appears correctly in the Dock                                        |

**Pass criteria:** Icon is visible and renders correctly in all four locations above on every tested hardware size.

---

## 2 — Kick counter

| Step | Action                                      | Expected result                                          |
| ---- | ------------------------------------------- | -------------------------------------------------------- |
| 2.1  | Open the Pregnancy AI Watch app → Kicks tab | Kick counter screen loads; count shows 0                 |
| 2.2  | Tap the kick button 5 times                 | Counter increments to 5 with haptic feedback on each tap |
| 2.3  | Put iPhone out of reach (airplane mode)     | Counter continues to increment normally                  |
| 2.4  | Restore iPhone connectivity                 | Kick session syncs to the iPhone app automatically       |

**Pass criteria:** Kicks are counted, persisted offline, and delivered to the iPhone after reconnect.

---

## 3 — Contraction timer

| Step | Action                                             | Expected result                                                                    |
| ---- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 3.1  | Open the Pregnancy AI Watch app → Contractions tab | Contraction timer screen loads                                                     |
| 3.2  | Tap **Start** to begin a contraction               | Timer counts up; Start button changes to **Stop**                                  |
| 3.3  | Tap **Stop**                                       | Contraction duration is recorded; interval to the next contraction begins counting |
| 3.4  | Repeat until interval < 5 minutes                  | Watch delivers a haptic alert and shows a red warning about contraction frequency  |
| 3.5  | Confirm alert dismisses correctly                  | Tapping dismiss removes the warning; timer is ready for the next contraction       |

**Pass criteria:** Timer starts/stops correctly, intervals are measured, and the < 5-minute alert fires reliably.

---

## 4 — Tips carousel

| Step | Action                                     | Expected result                                       |
| ---- | ------------------------------------------ | ----------------------------------------------------- |
| 4.1  | Open the Pregnancy AI Watch app → Tips tab | Tips carousel loads with gestational-week content     |
| 4.2  | Swipe through cards                        | Each card shows tip text and an emoji; no blank cards |

**Pass criteria:** Tips content is visible and navigable.

---

---

## 5 — Tips survive force-quit and relaunch (no phone required)

**Why:** `WatchSessionManager` persists both the tips array (`watchTips`) and the current
gestational week (`watchGestationalWeek`) to `UserDefaults` whenever the phone sends an update.
On relaunch both values are restored in `init()` before any WCSession activation, so the Tips
tab should show the correct week's content immediately — not the "Open the app on your iPhone to
sync" fallback.

### Prerequisites

- Apple Watch with the Pregnancy AI app installed and at least one prior sync from the iPhone
  (Tips tab was showing Week N content)

| Step | Action                                                                             | Expected result                                                                              |
| ---- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 5.1  | Confirm Tips tab shows Week N content                                              | Tips cards for Week N visible; "Open the app on your iPhone" message is **not** shown        |
| 5.2  | Force-quit the Watch app (swipe up from bottom to open app switcher, swipe up on the Pregnancy AI card) | Watch app is closed |
| 5.3  | Put the iPhone out of reach or into Airplane Mode                                  | Phone is unreachable — no background push can arrive                                         |
| 5.4  | Relaunch the Pregnancy AI Watch app from the app grid                              | Tips tab shows the **same Week N content** immediately — no blank screen, no sync prompt     |
| 5.5  | Swipe through the tips cards                                                       | All cards render correctly; no blank or malformed entries                                    |
| 5.6  | Restore iPhone connectivity                                                        | No crash or freeze after the WCSession reconnects                                            |

**Pass criteria:** Week N tips are visible immediately after relaunch without any iPhone interaction.

---

## 6 — App Store update from 1.0.11 (no Watch) to 1.0.12

Run this section on a device that has **1.0.11 installed from the App Store** (not a fresh
install) before updating to 1.0.12. It covers the automatic Watch-app delivery path that a
fresh install never exercises.

**Why this matters:** `useWatchConnectivity` pushes gestational-week data when it first mounts.
On a fresh install the Watch app exists from day one, so the push succeeds. On an update the
Watch app is absent at launch and arrives a few seconds later via watchOS automatic delivery.
The hook must detect the `isWatchAppInstalled: false → true` transition and re-send immediately
rather than waiting for the next due-date change.

### Prerequisites

- iPhone running **1.0.11** (the version without a Watch companion)
- Apple Watch **already paired** to that iPhone
- TestFlight build for 1.0.12 ready to install
- Note the current gestational week shown in the app before updating

---

| Step | Action                                                                                 | Expected result                                                                                                                      |
| ---- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| 5.1  | Update the phone app from 1.0.11 → 1.0.12 via TestFlight                               | Update completes; app launches normally                                                                                              |
| 5.2  | Open the updated app and navigate to the Tools tab                                     | App loads without crashes; gestational week is unchanged                                                                             |
| 5.3  | Wait up to 60 seconds without any further action                                       | The **Pregnancy AI** Watch app icon appears on the paired Apple Watch automatically — no manual re-pair or Watch app search required |
| 5.4  | Open the Watch app → Tips tab                                                          | Tips for the **current gestational week** are visible immediately — not blank, not "no data"                                         |
| 5.5  | Open the Watch app → Kicks tab                                                         | Count shows **0** (no stale session from old install); "Start Counting" button is present                                            |
| 5.6  | Open the Watch app → Contractions tab                                                  | Timer shows idle state; no phantom contraction interval or warning from a previous session                                           |
| 5.7  | Record 3 kicks on the Watch                                                            | Counter increments; after ending the session the kick count appears in the phone's Tools tab                                         |
| 5.8  | Start and stop a contraction on the Watch                                              | Contraction record appears on the phone when the Watch is reachable                                                                  |
| 5.9  | Put the phone in airplane mode, record 2 more kicks on the Watch, restore connectivity | Both kick records sync to the phone within a few seconds of reconnect                                                                |

**Pass criteria:**

- Watch app installs automatically (step 5.3) with no manual steps
- Tips reflect the current gestational week on first open (step 5.4) — confirmed by the unit test `watchAppStoreUpdate.test.tsx`
- Timers start from clean state (steps 5.5–5.6)
- Data flows phone → Watch (tips/week) and Watch → phone (kicks/contractions) correctly

---

## Sign-off

| Build | Tester | Device      | watchOS | Date | Icon ✓ | Kicks ✓ | Contractions ✓ | Tips ✓ | Update ✓ | Notes                       |
| ----- | ------ | ----------- | ------- | ---- | ------ | ------- | -------------- | ------ | -------- | --------------------------- |
| #124  |        |             |         |      |        |         |                |        | N/A      | Fresh-install only          |
| #124  |        | Ultra 49 mm |         |      |        |         |                |        | N/A      | Ultra icon — see note below |
|       |        |             |         |      |        |         |                |        |          |                             |

### Apple Watch Ultra (49 mm) — icon validation note

The Watch app icon uses the modern single-image `"idiom": "universal"` / `"platform": "watchos"` asset-catalog format
(verified by `pnpm run validate:watch-icons` — all 6 checks pass). watchOS derives every display-size slot —
including the 49 mm Ultra slot — from the single 1024 × 1024 px sRGB source at compositing time, so a correctly
formatted source file renders correctly on Ultra hardware without any size-specific entry in `Contents.json`.

**Source file properties confirmed:**

- Dimensions: 1024 × 1024 px ✓
- Color profile: 8-bit sRGB ✓
- Alpha channel: none ✓
- Asset catalog format: modern single-image universal (no `scale` / size matrix) ✓

A tester with Apple Watch Ultra (49 mm) hardware should install build #124 from TestFlight and fill in the
Tester / watchOS / Date / Icon ✓ columns above after running steps 1.1 – 1.4 on the Ultra.

Record any failures as issues against the relevant task before approving the build for wider TestFlight distribution.
