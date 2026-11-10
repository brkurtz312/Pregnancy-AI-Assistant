/**
 * Jest resolver for reanimated 4.7 / worklets 0.13 (Expo SDK 58).
 *
 * Both packages now need Jest to load the web (non-`.native`) build of some
 * of their files, and each ships a resolver for that:
 * `react-native-reanimated/jest/resolver` (which wraps
 * `react-native-worklets/jest/resolver`). We can't use them as-is: they decide
 * by checking whether the *path contains* the package name, and under pnpm
 * reanimated lives in a folder named
 * `react-native-reanimated@x_react-native-worklets@y_...`. The worklets check
 * then matches every reanimated file, Jest loads all of reanimated's web
 * build, and suites crash on `window.matchMedia`. This copy keeps the same
 * rules but matches on the real package folder.
 */
const WORKLETS_DIR = /[\\/]node_modules[\\/]react-native-worklets[\\/]/;
const REANIMATED_DIR = /[\\/]node_modules[\\/]react-native-reanimated[\\/]/;

// Reanimated's own list (react-native-reanimated/jest/resolver.js).
const REANIMATED_WEB_ONLY_IN_JEST = [
  "initializers",
  "mutables",
  "mappers",
  "ConfigHelper",
  "UpdateLayoutAnimations",
  "useAnimatedRef",
  "useAnimatedStyle",
  "WorkletEventHandler",
  "JSPropsUpdater",
  "updateProps",
  "util",
  "css/component/AnimatedComponent",
];

function withoutNative(options) {
  return {
    ...options,
    extensions: options.extensions?.filter((ext) => !ext.includes("native")),
  };
}

module.exports = (request, options) => {
  const { defaultResolver } = options;
  const basedir = options.basedir + "/";

  if (request.startsWith(".") && REANIMATED_DIR.test(basedir)) {
    const basename = request.split("/").pop();
    const webOnly = REANIMATED_WEB_ONLY_IN_JEST.some((entry) =>
      entry.includes("/") ? request.endsWith(entry) : basename === entry,
    );
    if (webOnly) return defaultResolver(request, withoutNative(options));
  }

  if (
    request === "react-native-worklets" ||
    request.startsWith("react-native-worklets/") ||
    WORKLETS_DIR.test(basedir)
  ) {
    return defaultResolver(request, withoutNative(options));
  }

  return defaultResolver(request, options);
};
