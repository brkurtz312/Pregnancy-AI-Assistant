/**
 * Which Clerk keys this server authenticates with.
 *
 * Replit's own auth product provisions a Clerk instance per App and injects
 * its CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY into the deployed process.
 * That injection wins over the values set in the deployment's own secrets, so
 * a server configured by hand kept verifying tokens against Replit's instance
 * and rejected every session the app issued — jwk-kid-mismatch, on a token
 * that was perfectly valid.
 *
 * Reading names Replit does not claim puts the choice back in our hands. The
 * CLERK_* names remain as a fallback so local development, CI and any other
 * environment that sets only those keeps working unchanged.
 */

/** Prefixed names win; the bare CLERK_* names are the fallback. */
function read(
  name: "SECRET_KEY" | "PUBLISHABLE_KEY",
  env: NodeJS.ProcessEnv,
): string | undefined {
  return env[`PREGNANCY_CLERK_${name}`] || env[`CLERK_${name}`] || undefined;
}

export function clerkSecretKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return read("SECRET_KEY", env);
}

export function clerkPublishableKey(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return read("PUBLISHABLE_KEY", env);
}

/**
 * Which variable supplied each key, for the boot log. A deployment running on
 * the fallback when it meant to run on the prefixed name is exactly the state
 * that took a day to find, so it should be visible without a debugger.
 */
export function clerkKeySources(env: NodeJS.ProcessEnv = process.env): {
  secretKeyFrom: string | null;
  publishableKeyFrom: string | null;
} {
  const source = (name: "SECRET_KEY" | "PUBLISHABLE_KEY") =>
    env[`PREGNANCY_CLERK_${name}`]
      ? `PREGNANCY_CLERK_${name}`
      : env[`CLERK_${name}`]
        ? `CLERK_${name}`
        : null;
  return {
    secretKeyFrom: source("SECRET_KEY"),
    publishableKeyFrom: source("PUBLISHABLE_KEY"),
  };
}
