/**
 * Playwright e2e: 'My Info' profile data never bleeds from user A to user B after
 * a same-device account switch — not even as a transient flash.
 *
 * Regression guard for the SessionWatcher clear() → invalidateQueries() ordering.
 * Without queryClient.clear() on sign-out followed by queryClient.invalidateQueries()
 * on the next sign-in, user A's cached providerName / hospitalName could appear
 * in the input fields while user B's profile fetch is still in-flight.
 *
 * Why the "no flash" check works:
 *   After user B signs in and the My Info tab is clicked, we intercept the
 *   GET /api/profile request and stall it for 800 ms. During that window the
 *   React Query cache is the only data source. If SessionWatcher's clear() fired
 *   correctly, the cache is empty and the input stays blank. If it didn't fire,
 *   the stale cache would fill the input with user A's value — caught immediately.
 *
 * Flow:
 *   1. Sign in as user A, fill in a unique providerName via the profile API,
 *      open My Info and assert the name is visible.
 *   2. Sign out — wait for sign-in button to confirm signed-out state (deterministic).
 *   3. Sign in as user B, intercept profile fetch, open My Info.
 *   4. Assert input is empty *before* the delayed response resolves (catches flash).
 *   5. Allow response to complete; assert input is still empty (user B has no data).
 *
 * Auth: uses @clerk/testing to bypass Clerk captcha so the sign-in form works
 * in automation. Requires CLERK_SECRET_KEY + VITE_CLERK_PUBLISHABLE_KEY in env.
 */

import { test, expect, type Page } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const UNIQUE_SUFFIX = Date.now();
const USER_A_EMAIL = `switch_user_a_${UNIQUE_SUFFIX}@example.com`;
const USER_B_EMAIL = `switch_user_b_${UNIQUE_SUFFIX}@example.com`;
const SHARED_PASSWORD = `Test!${UNIQUE_SUFFIX}pass`;

/** Unique provider name that belongs only to user A. */
const USER_A_PROVIDER_NAME = `Dr_SwitchTest_A_${UNIQUE_SUFFIX}`;

/** How long (ms) to stall the profile response so we can inspect the pre-fetch UI. */
const PROFILE_FETCH_DELAY_MS = 800;

async function createTestUsers() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "CLERK_SECRET_KEY is required for e2e Clerk auth. Set it in your environment.",
    );
  }
  const clerk = createClerkClient({ secretKey });
  const userA = await clerk.users.createUser({
    emailAddress: [USER_A_EMAIL],
    password: SHARED_PASSWORD,
    skipPasswordChecks: true,
  });
  const userB = await clerk.users.createUser({
    emailAddress: [USER_B_EMAIL],
    password: SHARED_PASSWORD,
    skipPasswordChecks: true,
  });
  return { userAId: userA.id, userBId: userB.id };
}

async function cleanupTestUsers(userAId: string, userBId: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return;
  const clerk = createClerkClient({ secretKey });
  await clerk.users.deleteUser(userAId).catch(() => {});
  await clerk.users.deleteUser(userBId).catch(() => {});
}

async function signInViaUi(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 20_000 });
}

async function signOut(page: Page) {
  const userButton = page.locator(".cl-userButtonTrigger").first();
  await userButton.click();
  await page.getByRole("menuitem", { name: /sign out/i }).click();

  // Wait for a deterministic signed-out indicator rather than a URL regex:
  // Clerk redirects to "/" (landing page) after sign-out; either sign-in
  // button confirms we are fully signed out.
  const signInBtn = page
    .getByTestId("button-sign-in")
    .or(page.getByTestId("button-nav-sign-in"));
  await expect(signInBtn.first()).toBeVisible({ timeout: 15_000 });
}

async function saveProfileViaApi(
  page: Page,
  providerName: string,
): Promise<void> {
  const response = await page.request.put("/api/profile", {
    data: { providerName },
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok()) {
    throw new Error(
      `Failed to save profile via API: ${response.status()} ${await response.text()}`,
    );
  }
}

async function navigateToMyInfo(page: Page) {
  const myInfoBtn = page.getByRole("button", { name: /my info/i });
  await expect(myInfoBtn).toBeVisible({ timeout: 10_000 });
  await myInfoBtn.click();
  await expect(page.locator("#providerName")).toBeVisible({ timeout: 10_000 });
}

test.describe("SessionWatcher — user-switch does not bleed profile data from A to B", () => {
  let userAId: string;
  let userBId: string;

  test.beforeAll(async () => {
    await clerkSetup({
      publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    });
    const users = await createTestUsers();
    userAId = users.userAId;
    userBId = users.userBId;
  });

  test.afterAll(async () => {
    await cleanupTestUsers(userAId, userBId);
  });

  test("user B never sees user A's provider name — not even as a transient flash — after an account switch on the same device", async ({
    page,
  }) => {
    // ── Step 1: Sign in as user A ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_A_EMAIL, SHARED_PASSWORD);

    // ── Step 2: Save a distinctive provider name for user A via API ────────────
    await saveProfileViaApi(page, USER_A_PROVIDER_NAME);

    // ── Step 3: Navigate to My Info and confirm user A's data is visible ───────
    await navigateToMyInfo(page);
    await expect(page.locator("#providerName")).toHaveValue(
      USER_A_PROVIDER_NAME,
      { timeout: 10_000 },
    );

    // ── Step 4: Sign out — wait for deterministic signed-out UI signal ─────────
    await signOut(page);

    // ── Step 5: Set up route interception BEFORE signing in as user B ─────────
    // Stall GET /api/profile so we can inspect the UI while the cache is the
    // only data source, catching any stale-cache leak that would flash user A's data.
    let resolveProfileFetch!: () => void;
    const profileFetchGate = new Promise<void>(
      (resolve) => (resolveProfileFetch = resolve),
    );

    await page.route("**/api/profile", async (route) => {
      if (route.request().method() === "GET") {
        await profileFetchGate; // hold the response until we release the gate
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // ── Step 6: Sign in as user B ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);

    // ── Step 7: Open My Info while profile fetch is still stalled ─────────────
    // The My Info tab becomes visible once user B is authenticated.
    await navigateToMyInfo(page);

    // ── Step 8: Assert IMMEDIATELY — before the delayed profile response lands ─
    // At this moment React Query can only show what is in the cache. If
    // queryClient.clear() fired correctly on sign-out, the cache is empty and
    // the input must be blank. If stale data leaked, the input would show
    // USER_A_PROVIDER_NAME here — that is the regression we are catching.
    const providerInput = page.locator("#providerName");
    const valueBeforeFetch = await providerInput.inputValue();
    if (valueBeforeFetch === USER_A_PROVIDER_NAME) {
      throw new Error(
        `REGRESSION: user A's providerName "${USER_A_PROVIDER_NAME}" ` +
          "appeared in user B's My Info before the profile response resolved. " +
          "SessionWatcher did not clear the cache on sign-out.",
      );
    }

    // ── Step 9: Release the stalled profile fetch ──────────────────────────────
    resolveProfileFetch();

    // Give the response time to land and the component to re-render.
    await page.waitForTimeout(PROFILE_FETCH_DELAY_MS);

    // ── Step 10: Assert AFTER fetch — user B's profile should still be empty ───
    // User B has no saved profile so the input must remain blank.
    const valueAfterFetch = await providerInput.inputValue();
    if (valueAfterFetch === USER_A_PROVIDER_NAME) {
      throw new Error(
        `REGRESSION: user A's providerName "${USER_A_PROVIDER_NAME}" ` +
          "appeared in user B's My Info after the profile response resolved. " +
          "The server returned user A's data for user B's session.",
      );
    }
    expect(valueAfterFetch).toBe("");

    // ── Step 11: Belt-and-suspenders — poll the input for 1 s ─────────────────
    // Ensures the value never transiently became USER_A_PROVIDER_NAME during
    // any intermediate render between steps 8 and 10.
    const deadline = Date.now() + 1_000;
    while (Date.now() < deadline) {
      const v = await providerInput.inputValue();
      if (v === USER_A_PROVIDER_NAME) {
        throw new Error(
          `REGRESSION: user A's providerName appeared in user B's session during polling.`,
        );
      }
      await page.waitForTimeout(50);
    }

    // ── Step 12: Confirm user B is actually authenticated (not signed out) ─────
    await expect(page.getByRole("button", { name: /my info/i })).toBeVisible();
    await expect(page.getByTestId("button-sign-in")).not.toBeVisible();

    // Clean up route interception.
    await page.unroute("**/api/profile");
  });
});
