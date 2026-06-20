// Dynamic Expo config.
//
// EXPO_PUBLIC_* values are how this app receives its Clerk key, RevenueCat keys,
// and API domain (Metro inlines `process.env.EXPO_PUBLIC_*` references at bundle
// time). Those values are injected by the `dev` script (development) and by
// `scripts/build.js` (web export) — but NEITHER of those runs during a native
// build (EAS / Replit Expo Launch, which produces the TestFlight/App Store app).
// Without a bridge, the native bundle ships with an empty Clerk key, which makes
// <ClerkProvider> throw on launch and crashes the app.
//
// app.config.js is the one hook Expo evaluates for every build pipeline (dev,
// web export, and native EAS) before Metro bundles, so we derive the EXPO_PUBLIC_*
// values from the workspace-provided variables here. We only set values that
// aren't already present, so the `dev` script and `build.js` keep precedence in
// their own pipelines.

const appJson = require("./app.json");

function setIfMissing(name, value) {
  if (!process.env[name] && value) {
    process.env[name] = value;
  }
}

function stripProtocol(domain) {
  if (!domain) return "";
  try {
    const withScheme = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    return new URL(withScheme).host;
  } catch {
    return domain;
  }
}

const deploymentDomain = stripProtocol(
  process.env.REPLIT_INTERNAL_APP_DOMAIN ||
    (process.env.REPLIT_DOMAINS || "").split(",")[0] ||
    process.env.REPLIT_DEV_DOMAIN ||
    process.env.EXPO_PUBLIC_DOMAIN ||
    "",
);

// In production Clerk is reached through a same-domain proxy; CLERK_PROXY_URL is
// the proxy path (empty in dev, where the SDK hits the Frontend API directly).
// Only build it when both the path and a domain are present, otherwise we'd emit
// a malformed `https:///...` URL.
const clerkProxyUrl =
  process.env.CLERK_PROXY_URL && deploymentDomain
    ? `https://${deploymentDomain}${process.env.CLERK_PROXY_URL}`
    : "";

setIfMissing("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY", process.env.CLERK_PUBLISHABLE_KEY);
setIfMissing("EXPO_PUBLIC_CLERK_PROXY_URL", clerkProxyUrl);
setIfMissing("EXPO_PUBLIC_REVENUECAT_TEST_API_KEY", process.env.REVENUECAT_TEST_API_KEY);
setIfMissing("EXPO_PUBLIC_REVENUECAT_IOS_API_KEY", process.env.REVENUECAT_IOS_API_KEY);
setIfMissing("EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY", process.env.REVENUECAT_ANDROID_API_KEY);
setIfMissing("EXPO_PUBLIC_DOMAIN", deploymentDomain);
setIfMissing("EXPO_PUBLIC_REPL_ID", process.env.REPL_ID);

module.exports = ({ config }) => ({ ...config, ...appJson.expo });
