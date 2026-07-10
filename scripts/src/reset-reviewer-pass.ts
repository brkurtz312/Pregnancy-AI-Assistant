/**
 * This script is no longer needed.
 *
 * The reviewer system previously used a single shared demo account whose pass
 * sometimes needed manual resetting. That account has been replaced with a
 * per-session model: each reviewer or developer who enters the access code
 * receives a brand-new isolated Clerk account with the pass granted
 * automatically at sign-in time.
 *
 * There is nothing to reset — every session starts fresh.
 *
 * If you need to verify the reviewer system is operational, run:
 *   pnpm --filter @workspace/scripts run check-reviewer-pass
 *
 * If you need to rotate the access code, run:
 *   pnpm --filter @workspace/scripts run rotate-reviewer-code
 */

console.log(`\n── reset-reviewer-pass: no longer needed ──\n`);
console.log(
  "Each reviewer sign-in now creates its own isolated account with the pass",
);
console.log("granted automatically. There is no shared demo account to reset.");
console.log();
console.log("To verify the system is healthy:");
console.log(
  "  pnpm --filter @workspace/scripts run check-reviewer-pass",
);
console.log();
process.exit(0);
