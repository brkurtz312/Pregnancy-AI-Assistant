---
name: WCSession main-thread activation
description: WCSession.activate() must be called on the main thread; calling it from a background queue silently fails, leaving activationState stuck at notActivated.
---

# WCSession main-thread activation

**Rule:** Always dispatch `WCSession.activate()` onto the main thread. Expo's `AsyncFunction` and `OnCreate` lifecycle hooks run on background queues, so any activation call inside them is silently ignored.

**Why:** WatchConnectivity's `WCSession` is a UIKit-level object that requires main-thread access. Off-main activation does not throw — it simply does nothing, leaving `activationState` permanently at `notActivated` and causing the Watch to appear as disconnected even when it is reachable.

**How to apply:** In the native Expo module, wrap `WCSession.default.activate()` in `DispatchQueue.main.async { ... }`. The `OnCreate` hook should schedule activation there rather than calling it directly.
