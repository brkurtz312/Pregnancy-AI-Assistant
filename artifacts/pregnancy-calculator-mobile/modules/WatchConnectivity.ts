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
  isSupported: boolean;
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

function buildModule(): WatchConnectivityInterface {
  try {
    // These are always available at runtime in an Expo binary
    const { NativeModulesProxy, EventEmitter } = require("expo-modules-core");
    const native = NativeModulesProxy.WatchConnectivity;
    if (!native) return stub;

    const emitter = new EventEmitter(native);
    return {
      sendTips: guarded(native, "sendTips", stub.sendTips),
      sendGestationalWeek: guarded(
        native,
        "sendGestationalWeek",
        stub.sendGestationalWeek,
      ),
      sendWeekAndTips: guarded(native, "sendWeekAndTips", stub.sendWeekAndTips),
      getSessionState: guarded(native, "getSessionState", stub.getSessionState),
      addListener: (event: string, cb: Listener) => {
        try {
          return emitter.addListener(event, cb);
        } catch {
          return { remove: () => {} };
        }
      },
      signOut: guarded(native, "signOut", stub.signOut),
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
