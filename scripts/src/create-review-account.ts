/**
 * Creates (or resets) the Apple App Review demo account in the production
 * Clerk tenant and grants it the full pregnancy pass in the database.
 *
 * Usage:
 *   pnpm --filter @workspace/scripts run create-review-account
 *
 * Requires:
 *   CLERK_SECRET_KEY  – set automatically by Replit for the production tenant
 *   DATABASE_URL      – set automatically by Replit
 */

import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";

const DEMO_EMAIL = "appreview@pregnancy-assistant.com";
const DEMO_PASSWORD = "SVvB5:x56my_de!";
const CLERK_API = "https://api.clerk.com/v1";

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  console.error("CLERK_SECRET_KEY is not set");
  process.exit(1);
}

const headers = {
  Authorization: `Bearer ${secretKey}`,
  "Content-Type": "application/json",
};

async function clerkGet(path: string) {
  const res = await fetch(`${CLERK_API}${path}`, { headers });
  if (!res.ok)
    throw new Error(`GET ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function clerkPost(path: string, body: unknown) {
  const res = await fetch(`${CLERK_API}${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`POST ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function clerkPatch(path: string, body: unknown) {
  const res = await fetch(`${CLERK_API}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok)
    throw new Error(`PATCH ${path} → ${res.status}: ${await res.text()}`);
  return res.json();
}

async function main() {
  console.log(`\n── Apple Review Demo Account Setup ──`);
  console.log(`Email:    ${DEMO_EMAIL}`);
  console.log(`Password: ${DEMO_PASSWORD}\n`);

  // 1. Search for existing user
  const existing = await clerkGet(
    `/users?email_address=${encodeURIComponent(DEMO_EMAIL)}&limit=1`,
  );

  let clerkUserId: string;

  if (Array.isArray(existing) && existing.length > 0) {
    clerkUserId = existing[0].id;
    console.log(`Found existing Clerk user: ${clerkUserId}`);

    // Reset password and ensure email is verified
    await clerkPatch(`/users/${clerkUserId}`, {
      password: DEMO_PASSWORD,
      skip_password_checks: true,
    });
    console.log("✓ Password updated");

    // Mark primary email address as verified
    const emailId: string = existing[0].email_addresses?.[0]?.id;
    if (emailId) {
      await clerkPatch(`/email_addresses/${emailId}`, { verified: true });
      console.log("✓ Email marked as verified");
    }
  } else {
    console.log("No existing user found — creating new account...");
    const created = await clerkPost("/users", {
      email_address: [DEMO_EMAIL],
      password: DEMO_PASSWORD,
      skip_password_checks: true,
      // Mark email as verified so no OTP is required on sign-in
      email_address_verified: true,
    });
    clerkUserId = (created as { id: string }).id;
    console.log(`✓ Created Clerk user: ${clerkUserId}`);
  }

  // 2. Grant the Full Pregnancy Pass in our DB (upsert)
  await db
    .insert(usersTable)
    .values({ id: clerkUserId, hasPass: true })
    .onConflictDoUpdate({
      target: usersTable.id,
      set: { hasPass: true },
    });
  console.log("✓ Full Pregnancy Pass granted in database");

  console.log("\n✅ Demo account is ready for App Store review.\n");
  console.log(`   Username: ${DEMO_EMAIL}`);
  console.log(`   Password: ${DEMO_PASSWORD}`);
  console.log(
    "\n   Update these credentials in App Store Connect → Your App → App Review Information → Sign-in required.\n",
  );

  process.exit(0);
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
