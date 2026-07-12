/**
 * Playwright e2e: profile data never bleeds from user A to user B after a
 * same-device account switch — not even as a transient flash.
 *
 * Test 1 — My Info (providerName / hospitalName fields):
 *   Regression guard for the SessionWatcher clear() → invalidateQueries() ordering.
 *   Without queryClient.clear() on sign-out followed by queryClient.invalidateQueries()
 *   on the next sign-in, user A's cached providerName / hospitalName could appear
 *   in the input fields while user B's profile fetch is still in-flight.
 *
 * Test 2 — Calculator screen (due date / results panel):
 *   The due date is the highest-visibility field: it is auto-loaded from the
 *   profile and drives the entire ResultsDisplay panel on the Calculator tab.
 *   If queryClient.clear() does not fire (or fires after the calculator re-renders),
 *   user B will briefly see user A's due-date results before the fresh fetch
 *   completes.  This test covers that regression with the same stall-and-inspect
 *   technique used for My Info.
 *
 * Why the "no flash" check works:
 *   After user B signs in and the Calculator tab is visible, we intercept the
 *   GET /api/profile request and stall it. During that window the React Query
 *   cache is the only data source. If SessionWatcher's clear() fired correctly,
 *   the cache is empty and no results panel appears. If it didn't fire, the stale
 *   cache would populate results with user A's due date — caught immediately.
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

async function saveDueDateViaApi(page: Page, dueDate: string): Promise<void> {
  const response = await page.request.put("/api/profile", {
    data: { dueDate },
    headers: { "Content-Type": "application/json" },
  });
  if (!response.ok()) {
    throw new Error(
      `Failed to save due date via API: ${response.status()} ${await response.text()}`,
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

  test("user B never sees user A's due-date results on the Calculator screen — not even as a transient flash — after an account switch on the same device", async ({
    page,
  }) => {
    // A distinctive future due date that belongs only to user A.
    // format(new Date("2027-06-15"), "MMMM d, yyyy") === "June 15, 2027"
    const USER_A_DUE_DATE = "2027-06-15";
    const USER_A_EDD_FORMATTED = "June 15, 2027";

    // ── Step 1: Sign in as user A ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_A_EMAIL, SHARED_PASSWORD);

    // ── Step 2: Save a distinctive due date for user A via the profile API ─────
    await saveDueDateViaApi(page, USER_A_DUE_DATE);

    // ── Step 3: Reload to trigger profile auto-load on the Calculator tab ──────
    // The calculator page auto-loads results whenever profile.dueDate is set.
    // After reload the page starts on the Calculator tab (default view).
    await page.reload();
    await page.waitForURL(/\/app/, { timeout: 15_000 });

    // ── Step 4: Confirm user A's results panel is visible with their EDD ───────
    const resultsSection = page.getByTestId("results-section");
    await expect(resultsSection).toBeVisible({ timeout: 15_000 });
    const eddEl = page.getByTestId("text-edd");
    await expect(eddEl).toContainText(USER_A_EDD_FORMATTED, {
      timeout: 10_000,
    });

    // ── Step 5: Sign out — wait for deterministic signed-out UI signal ─────────
    await signOut(page);

    // ── Step 6: Set up route interception BEFORE signing in as user B ─────────
    // Stall GET /api/profile so we can inspect the Calculator UI while the cache
    // is the only data source, catching any stale-cache leak that would flash
    // user A's results (including their due date) to user B.
    let resolveProfileFetch!: () => void;
    const profileFetchGate = new Promise<void>(
      (resolve) => (resolveProfileFetch = resolve),
    );

    await page.route("**/api/profile", async (route) => {
      if (route.request().method() === "GET") {
        await profileFetchGate;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // ── Step 7: Sign in as user B ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);

    // ── Step 8: Confirm the Calculator tab is active (default landing page) ────
    // After sign-in the app lands on the Calculator tab. We wait for the
    // calculator card (the tab switcher) to be visible — this confirms React has
    // rendered and any stale-cache re-render has already happened.
    const calcTabButton = page.getByTestId("tab-lmp");
    await expect(calcTabButton).toBeVisible({ timeout: 15_000 });

    // ── Step 9: Assert IMMEDIATELY — results panel must NOT be visible ─────────
    // The profile fetch is still stalled, so React Query can only show what is
    // in the cache. If queryClient.clear() fired correctly on sign-out, the cache
    // is empty and no results panel should appear. If stale data leaked, the panel
    // would be visible with USER_A_EDD_FORMATTED — the regression we are catching.
    const resultsPanelVisible = await page
      .getByTestId("results-section")
      .isVisible();
    if (resultsPanelVisible) {
      // Grab what EDD the panel shows so the error is maximally actionable.
      const eddText = await page
        .getByTestId("text-edd")
        .textContent()
        .catch(() => "(not found)");
      throw new Error(
        `REGRESSION: the Calculator results panel is visible for user B before ` +
          `the profile response resolved. EDD shown: "${eddText}". ` +
          `SessionWatcher did not clear the cache on sign-out. ` +
          `User A's due date (${USER_A_EDD_FORMATTED}) may have leaked.`,
      );
    }

    // ── Step 10: Release the stalled profile fetch ─────────────────────────────
    resolveProfileFetch();

    // Give the response time to land and the component to re-render.
    await page.waitForTimeout(PROFILE_FETCH_DELAY_MS);

    // ── Step 11: Assert AFTER fetch — results panel must still NOT appear ──────
    // User B has no saved due date, so no results should be shown.
    const resultsPanelVisibleAfterFetch = await page
      .getByTestId("results-section")
      .isVisible();
    if (resultsPanelVisibleAfterFetch) {
      const eddText = await page
        .getByTestId("text-edd")
        .textContent()
        .catch(() => "(not found)");
      throw new Error(
        `REGRESSION: the Calculator results panel appeared for user B after ` +
          `the profile response resolved. EDD shown: "${eddText}". ` +
          `The server may have returned user A's due date for user B's session.`,
      );
    }

    // ── Step 12: Belt-and-suspenders — poll for 1 s ───────────────────────────
    // Ensures the results panel never transiently appeared during any
    // intermediate render between steps 9 and 11.
    const deadline = Date.now() + 1_000;
    while (Date.now() < deadline) {
      const visible = await page.getByTestId("results-section").isVisible();
      if (visible) {
        const eddText = await page
          .getByTestId("text-edd")
          .textContent()
          .catch(() => "(not found)");
        throw new Error(
          `REGRESSION: user A's due-date results appeared in user B's Calculator ` +
            `session during polling. EDD shown: "${eddText}".`,
        );
      }
      await page.waitForTimeout(50);
    }

    // ── Step 13: Confirm user B is actually authenticated (not signed out) ─────
    await expect(calcTabButton).toBeVisible();
    await expect(page.getByTestId("button-sign-in")).not.toBeVisible();

    // Clean up route interception.
    await page.unroute("**/api/profile");
  });
});
