/**
 * Playwright e2e: stale pass/profile data disappears immediately on sign-out.
 *
 * Regression guard for SessionWatcher. Without SessionWatcher calling
 * queryClient.clear() on sign-out, the React Query cache would keep serving
 * the previous user's pass badge and "My Info" tab to the next visitor.
 *
 * Auth: uses @clerk/testing to bypass Clerk captcha so the sign-in form works
 * in automation. Requires CLERK_SECRET_KEY + VITE_CLERK_PUBLISHABLE_KEY in env.
 */

import { test, expect, type Page } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const UNIQUE_SUFFIX = Date.now();
const TEST_EMAIL = `signout_test_${UNIQUE_SUFFIX}@example.com`;
const TEST_PASSWORD = `Test!${UNIQUE_SUFFIX}pass`;

async function setupTestUser() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "CLERK_SECRET_KEY is required for e2e Clerk auth. Set it in your environment.",
    );
  }
  const clerk = createClerkClient({ secretKey });
  const user = await clerk.users.createUser({
    emailAddress: [TEST_EMAIL],
    password: TEST_PASSWORD,
    skipPasswordChecks: true,
  });
  return { userId: user.id, email: TEST_EMAIL };
}

async function cleanupTestUser(userId: string) {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return;
  const clerk = createClerkClient({ secretKey });
  await clerk.users.deleteUser(userId).catch(() => {});
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
}

test.describe("SessionWatcher — sign-out clears stale authenticated data", () => {
  let userId: string;

  test.beforeAll(async () => {
    await clerkSetup({
      publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    });
    const user = await setupTestUser();
    userId = user.userId;
  });

  test.afterAll(async () => {
    await cleanupTestUser(userId);
  });

  test("badges and My Info tab disappear immediately after sign-out without page reload", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });

    await signInViaUi(page, TEST_EMAIL, TEST_PASSWORD);

    await page.waitForSelector('[data-testid="badge-free-remaining"]', {
      timeout: 15_000,
    });

    await expect(page.getByTestId("badge-free-remaining")).toBeVisible();
    await expect(page.getByTestId("button-unlock-pass")).toBeVisible();
    await expect(page.getByRole("button", { name: /my info/i })).toBeVisible();
    await expect(page.getByTestId("button-sign-in")).not.toBeVisible();

    await signOut(page);

    await expect(page.getByTestId("badge-free-remaining")).not.toBeVisible();
    await expect(page.getByTestId("badge-pass-active")).not.toBeVisible();
    await expect(page.getByTestId("button-unlock-pass")).not.toBeVisible();
    await expect(
      page.getByRole("button", { name: /my info/i }),
    ).not.toBeVisible();

    const signInLink = page
      .getByTestId("button-sign-in")
      .or(page.getByTestId("button-nav-sign-in"));
    await expect(signInLink.first()).toBeVisible();
  });
});
