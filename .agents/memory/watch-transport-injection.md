---
name: Watch transport injection for real send-path tests
description: WatchSessionManager sends go through an injected WatchConnectivityTransport; every reachable sendMessage needs a transferUserInfo fallback errorHandler
---
WatchSessionManager (watchapp/) routes all outbound WatchConnectivity calls through an injected `WatchConnectivityTransport` protocol (`WCSessionTransport` in prod). Tests inject a recording fake to drive the REAL send paths and assert channel selection/fallbacks.

**Why:** completion review rejects mirror-only tests AND flagged that reachable `sendMessage` calls without an errorHandler lose payloads when the phone is force-quit racing the reachability check.

**How to apply:** any new outbound Watch send must (1) go through `transport`, not `WCSession.default`, and (2) provide an errorHandler that falls back to `transport.transferUserInfo(payload)`. Capture `[transport]` in closures, not WCSession.
