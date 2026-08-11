# Manual test: Watch data survives a phone force-quit mid-session

Verifies that contraction and kick records captured on the Watch are never
lost when the iPhone app is force-quit while a session is running, and that
they appear in the phone's history after relaunch.

Why this works: the Watch's offline paths (`sendKickSessionEnd`,
`sendContractionUpdate`, `sendContractionSessionEnd` in
`watchapp/WatchSessionManager.swift`) use `WCSession.transferUserInfo`.
Unlike `updateApplicationContext` (last-write-wins — only the newest payload
would survive), `transferUserInfo` maintains an OS-level FIFO queue in the
WatchConnectivity daemon that is designed to persist across force-quits of
**either** app and deliver every payload, in order, once the counterpart
relaunches. When the phone appears reachable but the send fails mid-flight
(force-quit racing the reachability check), the `sendMessage` errorHandler
falls back to `transferUserInfo`. The contraction path additionally keeps a
Watch-side retry queue (`wk.pendingContractionUpdates`) that is only drained
on a matching `contractionUpdateAck` UUID from the phone, so contraction
records are protected even if an OS-level transfer were dropped. Kick and
contraction _session-end summaries_ rely on the OS queue plus the failure
fallback (no app-level ack), which is why the on-device steps below should be
executed on real hardware to confirm the OS delivery semantics.

## Prerequisites

- iPhone + paired Apple Watch (physical devices; the simulator's
  WatchConnectivity queue behaves differently under process kills).
- App installed on both devices, user signed in, phone app opened at least
  once so the Watch has synced.

## Test A — kick session vs. phone force-quit

1. On the Watch, open the app → Kicks tab → start a kick session and log a
   few kicks (e.g. 5).
2. On the iPhone, force-quit the app (swipe up from the app switcher).
   Do **not** reopen it yet.
3. On the Watch, end the kick session.
   - ✅ The Watch idle screen shows the completed count immediately
     (persisted locally — no phone required).
4. Force-quit and relaunch the **Watch** app.
   - ✅ The last kick count is still shown.
5. Relaunch the iPhone app and open kick history.
   - ✅ The session ended in step 3 appears (delivered via the queued
     `transferUserInfo`, drained on relaunch; the JS layer receives it via
     `onKickSessionEnd`).

## Test B — multiple contractions vs. phone force-quit

1. On the Watch, start the contraction timer.
2. Force-quit the iPhone app.
3. On the Watch, record **two or more** contractions (start/stop each), then
   end the session.
4. Relaunch the iPhone app and open contraction history.
   - ✅ **All** recorded contractions appear — none merged or dropped
     (each was an independent `transferUserInfo` payload; the phone persists
     each to its native receipt store before acking).
5. On the Watch, verify the retry queue drained: record one more contraction
   with the phone reachable; only that new one is added (no duplicates of
   the earlier ones — phone receipts are idempotent by record UUID).

## Test C — force-quit during in-flight delivery (worst case)

1. Enable Airplane Mode on the iPhone (Watch unreachable), record 2
   contractions on the Watch.
2. Force-quit the iPhone app, then disable Airplane Mode.
3. Wait ~1 minute, relaunch the iPhone app.
   - ✅ Both contractions appear in history. If delivery raced the relaunch,
     the Watch's ack-gated retry queue re-sends on the next reachability
     window — records are only dequeued on a matching ack UUID.

## Automated coverage

- `watchapp/WatchPhoneForceQuitDeliveryTests.swift` — drives the real
  `sendKickSessionEnd` / `sendContractionUpdate` / `sendContractionSessionEnd`
  / `flushPendingContractionUpdates` paths through an injected fake transport:
  offline channel selection (transferUserInfo, never sendMessage), the
  reachable-then-failed fallback, durable pre-send enqueue, ack-gated drain,
  and persistence across Watch relaunch.
- `watchapp/WatchOfflineDeliveryTests.swift` — FIFO `transferUserInfo` vs.
  last-write-wins `updateApplicationContext` delivery semantics.
- `watchapp/WatchContractionRetryQueueTests.swift` — retry-queue/ack protocol
  including phone-crash-before-ack and phone native receipt store.

Run in Xcode: Product → Test (PregnancyWatchAppTests bundle).
