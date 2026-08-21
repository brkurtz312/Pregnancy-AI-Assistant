/**
 * This script is no longer a replacement for a Production reviewer account.
 *
 * The reviewer access code only unlocks the pass after a user has signed in.
 * App Review therefore needs a real Production Clerk account with a password;
 * this command cannot create or reset that account.
 *
 * The API service's reviewer health check monitors the configured demo
 * account's pass independently.
 *
 * If you need to verify the reviewer system is operational, run:
 *   pnpm --filter @workspace/scripts run check-reviewer-pass
 *
 * If you need to rotate the access code, run:
 *   pnpm --filter @workspace/scripts run rotate-reviewer-code
 */

console.log(`\n── reset-reviewer-pass: reviewer account required ──\n`);
console.log(
  "The access code is not a Clerk password. App Review must first sign in",
);
console.log(
  "to a verified Production Clerk demo account, then redeem the code.",
);
console.log();
console.log("To verify the code-redemption service is healthy:");
console.log("  pnpm --filter @workspace/scripts run check-reviewer-pass");
console.log();
process.exit(0);
