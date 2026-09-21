/**
 * WatchConnectivity native module shim.
 *
 * On iOS builds that include the WatchConnectivityModule native target,
 * this re-exports it via expo-modules-core's NativeModulesProxy.
 * On Android / simulator builds without the module it exports a no-op stub
 * so imports never throw at runtime.
 *
 * NOTE: expo-modules-core is resolved at runtime by Metro — it is always
 * present in the binary. The try/catch guards against the native module
 * itself being absent (e.g. Android).
 */

import { countWatchBridge } from "@/lib/watch-bridge-log";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Listener = (...args: any[]) => void;
type Subscription = { remove: () => void };

export interface WatchSessionState {
  /** "activated" | "inactive" | "notActivated" | "unknown" */
  activationState: string;
  /** true if the Watch companion app is installed */
  isWatchAppInstalled: boolean;
  /** true if the Watch is currently reachable */
  isReachable: boolean;
  /** true if WCSession.isSupported() — false means Watch Connectivity is unavailable on this device */
  isSupported?: boolean;
  /** Last result from activationDidCompleteWith, e.g. "OK state=2" or "ERROR state=0 err=..." */
  activationDiagnostic?: string;
}

interface WatchConnectivityInterface {
  sendTips: (tips: object[]) => Promise<void>;
  sendGestationalWeek: (week: number) => Promise<void>;
  /**
   * Atomically sends gestational week and tips in a single WCSession
   * payload.  Prefer this over calling sendGestationalWeek + sendTips
   * individually to guarantee both values arrive as one coherent snapshot.
   */
  sendWeekAndTips: (week: number, tips: object[]) => Promise<void>;
  getSessionState: () => Promise<WatchSessionState>;
  /**
   * Returns the last result from WCSession activationDidCompleteWith as a
   * human-readable string (e.g. "OK state=2" or "ERROR state=0 err=...").
   * Falls back to the UserDefaults value from a previous launch.
   * Returns "activationDidCompleteWith not yet called" if it has never fired.
   */
  getActivationDiagnostic: () => Promise<string>;
  addListener: (event: string, cb: Listener) => Subscription;
  /**
   * Sends a sign-out notification to the Watch so it clears its persisted
   * session data (kick counter, contraction timer) for the signed-out user.
   * Safe to call even when the Watch app is not installed or not reachable;
   * the native module is a no-op in those cases.
   */
  signOut: () => Promise<void>;
  /**
   * Returns contraction records that the phone persisted natively (before
   * replying to the Watch with the ack UUID) but whose JS/API persistence did
   * not complete (e.g. the phone was force-quit after the ack).
   * Call at app launch to drain any stranded records.
   */
  getPendingContractionReceipts: () => Promise<Record<string, unknown>[]>;
  /**
   * Removes the record with the given UUID string from the native pending
   * store.  Call after the record has been durably saved to the API (or an
   * offline queue that guarantees eventual delivery).
   */
  acknowledgeContractionReceipt: (id: string) => Promise<void>;
  /**
   * Registers the signed-in user's ID with the native receipt store so that
   * incoming Watch payloads are scoped to that user's partition.
   * Call immediately on sign-in (before `getPendingContractionReceipts`)
   * so the startup drain reads the correct user's receipts.
   * Pass `null` on sign-out (though `signOut()` sets this internally).
   * Without a registered user, `persistContractionReceipt` is a no-op and
   * late Watch `transferUserInfo` deliveries are silently dropped instead of
   * being attributed to the next signed-in account.
   */
  setActiveWatchUser: (userId: string | null) => Promise<void>;
}

const stub: WatchConnectivityInterface = {
  sendTips: async () => {},
  sendGestationalWeek: async () => {},
  sendWeekAndTips: async () => {},
  getSessionState: async () => ({
    activationState: "notActivated",
    isWatchAppInstalled: false,
    isReachable: false,
    isSupported: false,
  }),
  getActivationDiagnostic: async () => "not supported on this platform",
  addListener: () => ({ remove: () => {} }),
  signOut: async () => {},
  getPendingContractionReceipts: async () => [],
  acknowledgeContractionReceipt: async () => {},
  setActiveWatchUser: async () => {},
};

/**
 * RULE — feature-detect every native method.
 *
 * OTA (JS-only) updates run on ALL installed binaries that share the runtime
 * version, including binaries built BEFORE a native method existed. Calling a
 * missing method on the proxy throws SYNCHRONOUSLY, which bypasses callers'
 * `.catch()` and crashes the app at the call site (this happened at startup
 * with `signOut()` on binaries < 1.0.29).
 *
 * Therefore every method exposed here — including any new native method you
 * add in the future — MUST go through `guarded()` (or otherwise check
 * `typeof native.<method> === "function"`) so that on an older binary the
 * call degrades to an async no-op / stub value instead of throwing.
 */
function guarded<Args extends unknown[], R>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  native: any,
  method: string,
  fallback: (...args: Args) => R,
): (...args: Args) => Promise<Awaited<R>> {
  return async (...args: Args) => {
    if (typeof native?.[method] !== "function") return await fallback(...args);
    return await native[method](...args);
  };
}

/**
 * Attaches an event listener, coping with both Expo module event APIs.
 *
 * SDK 52 made a module defined with `Module { Events(...) }` an event emitter
 * in its own right: `nativeModule.addListener(name, cb)` returns a
 * subscription. The older route — `new EventEmitter(nativeModuleFromProxy)` —
 * is deprecated, and on a module reached through `NativeModulesProxy` the
 * `addListener` that exists is React Native's bridge stub, which takes only an
 * event name, ignores the callback and returns nothing.
 *
 * Both shapes are therefore possible and only one delivers events. Function
 * calls bridge fine either way, which is how this app reached the state where
 * `setActiveWatchUser` worked, contraction receipts were acknowledged, and not
 * one `onContractionUpdate` or `onWatchStateChange` event ever arrived.
 *
 * So: try the module's own `addListener` and accept it only if it hands back a
 * real subscription. Otherwise fall back to the legacy emitter.
 */
function attachListener(
  native: { addListener?: (e: string, cb: Listener) => unknown },
  legacy: { addListener: (e: string, cb: Listener) => Subscription } | null,
  event: string,
  cb: Listener,
): { subscription: Subscription; strategy: "module" | "emitter" | "none" } {
  if (typeof native?.addListener === "function") {
    try {
      const sub = native.addListener(event, cb) as Subscription | undefined;
      if (sub && typeof sub.remove === "function") {
        return { subscription: sub, strategy: "module" };
      }
      // A return value without `remove` is the bridge stub: it registered
      // nothing. Fall through rather than trust it.
    } catch {
      // Fall through to the legacy emitter.
    }
  }
  if (legacy) {
    try {
      return {
        subscription: legacy.addListener(event, cb),
        strategy: "emitter",
      };
    } catch {
      // Fall through to the dead subscription below.
    }
  }
  return { subscription: { remove: () => {} }, strategy: "none" };
}

function buildModule(): WatchConnectivityInterface {
  try {
    // These are always available at runtime in an Expo binary
    const core = require("expo-modules-core");
    const { NativeModulesProxy, EventEmitter, requireNativeModule } = core;

    // Prefer requireNativeModule. NativeModulesProxy is deprecated, and on
    // SDK 54 a Void-returning AsyncFunction reached through it leaves its JS
    // promise unsettled — the native work runs, `await` never returns. That
    // is what stopped the Watch contraction drain from running at all: it sat
    // behind `await setActiveWatchUser(...)`. The Swift side now returns a
    // value too, so either route works; this one is the supported one.
    let native: unknown = null;
    try {
      native = requireNativeModule?.("WatchConnectivity") ?? null;
    } catch {
      native = null;
    }
    if (!native) native = NativeModulesProxy?.WatchConnectivity ?? null;
    if (!native) return stub;

    let emitter: {
      addListener: (e: string, cb: Listener) => Subscription;
    } | null = null;
    try {
      emitter = new EventEmitter(native);
    } catch {
      emitter = null;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nativeAny = native as any;
    return {
      sendTips: guarded(nativeAny, "sendTips", stub.sendTips),
      sendGestationalWeek: guarded(
        native,
        "sendGestationalWeek",
        stub.sendGestationalWeek,
      ),
      sendWeekAndTips: guarded(
        nativeAny,
        "sendWeekAndTips",
        stub.sendWeekAndTips,
      ),
      getSessionState: guarded(
        nativeAny,
        "getSessionState",
        stub.getSessionState,
      ),
      getActivationDiagnostic: guarded(
        native,
        "getActivationDiagnostic",
        stub.getActivationDiagnostic,
      ),
      addListener: (event: string, cb: Listener) => {
        const { subscription, strategy } = attachListener(
          nativeAny,
          emitter,
          event,
          cb,
        );
        // A dead subscription is silent forever: the live path simply never
        // fires and nothing anywhere says why. Record it so the phone can.
        countWatchBridge({
          listenerStrategy: strategy,
          listenerFailed: strategy === "none",
        });
        return subscription;
      },
      signOut: guarded(nativeAny, "signOut", stub.signOut),
      getPendingContractionReceipts: guarded(
        native,
        "getPendingContractionReceipts",
        stub.getPendingContractionReceipts,
      ),
      acknowledgeContractionReceipt: guarded(
        native,
        "acknowledgeContractionReceipt",
        stub.acknowledgeContractionReceipt,
      ),
      setActiveWatchUser: guarded(
        native,
        "setActiveWatchUser",
        stub.setActiveWatchUser,
      ),
    };
  } catch {
    return stub;
  }
}

export default buildModule();
