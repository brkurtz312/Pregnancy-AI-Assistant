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
}

const stub: WatchConnectivityInterface = {
  sendTips: async () => {},
  sendGestationalWeek: async () => {},
  sendWeekAndTips: async () => {},
  getSessionState: async () => ({
    activationState: "notActivated",
    isWatchAppInstalled: false,
    isReachable: false,
  }),
  addListener: () => ({ remove: () => {} }),
  signOut: async () => {},
};

function buildModule(): WatchConnectivityInterface {
  try {
    // These are always available at runtime in an Expo binary
    const { NativeModulesProxy, EventEmitter } = require("expo-modules-core");
    const native = NativeModulesProxy.WatchConnectivity;
    if (!native) return stub;

    const emitter = new EventEmitter(native);
    return {
      sendTips: (tips: object[]) => native.sendTips(tips),
      sendGestationalWeek: (week: number) => native.sendGestationalWeek(week),
      sendWeekAndTips: (week: number, tips: object[]) =>
        native.sendWeekAndTips(week, tips),
      getSessionState: () => native.getSessionState(),
      addListener: (event: string, cb: Listener) =>
        emitter.addListener(event, cb),
      signOut: () => native.signOut(),
    };
  } catch {
    return stub;
  }
}

export default buildModule();
