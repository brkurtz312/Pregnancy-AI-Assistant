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

interface WatchConnectivityInterface {
  sendTips: (tips: object[]) => Promise<void>;
  sendGestationalWeek: (week: number) => Promise<void>;
  addListener: (event: string, cb: Listener) => Subscription;
}

const stub: WatchConnectivityInterface = {
  sendTips: async () => {},
  sendGestationalWeek: async () => {},
  addListener: () => ({ remove: () => {} }),
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
      addListener: (event: string, cb: Listener) =>
        emitter.addListener(event, cb),
    };
  } catch {
    return stub;
  }
}

export default buildModule();
