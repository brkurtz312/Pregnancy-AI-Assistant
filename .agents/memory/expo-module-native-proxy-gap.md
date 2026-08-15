---
name: Expo NativeModulesProxy AsyncFunction exposure gap
description: Some AsyncFunction declarations in an Expo module do not appear on NativeModulesProxy even when compiled correctly; prefer piggybacking on a known-working method.
---

## The rule
Do not rely on a *new* `AsyncFunction` appearing on `NativeModulesProxy.<ModuleName>` being discovered by the `guarded()` check. Even with the method correctly declared in Swift and included in the binary, it can silently fail to appear on the proxy object, causing `typeof native?.[method] !== "function"` to return `true` and the stub fallback to fire.

**Why:** Root cause unknown — may be a JSI/bridge initialization order issue, or a subtle difference in how Expo SDK 54 registers methods added to an existing module definition vs. the baseline set. `getActivationDiagnostic` failed on 1.0.41 despite being in the correct Swift file at the correct commit; `getSessionState` (declared earlier in the same definition block) worked fine.

**How to apply:** When you need to surface a new value from native code, fold it into an *existing, confirmed-working* method's return dictionary rather than adding a brand-new `AsyncFunction`. For session-related data, add the field to `PhoneWatchBridge.sessionState()` (returned by `getSessionState`) — that method is confirmed working across all binaries. The JS side reads it from the `WatchSessionState` object with an optional field (`activationDiagnostic?: string`).

**Fix applied:** `activationDiagnostic` folded into `sessionState()` return dict in `watchapp/PhoneWatchBridge.swift`; `WatchSessionState` interface extended with `activationDiagnostic?: string`; all `setWatchStatus` call sites in `useWatchConnectivity.ts` also call `setWatchDiagnostic(s.activationDiagnostic)` when present.
