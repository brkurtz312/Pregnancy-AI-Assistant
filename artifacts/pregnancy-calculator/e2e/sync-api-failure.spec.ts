/**
 * Playwright e2e: sync API failure handling for HospitalBag, BirthPlan, and Journal.
 *
 * Each test:
 *   1. Signs in as a fresh Clerk user.
 *   2. Installs a Playwright route that intercepts POST /api/tools/* and returns 500.
 *   3. Makes a change via the UI.
 *   4. Verifies the UI shows an error toast ("Couldn't save to server").
 *   5. Verifies the change remains visible in the UI (local fallback — no silent data loss).
 *   6. Removes the route intercept, reloads, and verifies the pending entry reaches the
 *      server on flush so that state is consistent after recovery.
 *
 * Auth: uses @clerk/testing to bypass Clerk captcha so sign-in works in automation.
 * Requires CLERK_SECRET_KEY + VITE_CLERK_PUBLISHABLE_KEY in env.
 */

import { test, expect, type Page } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const UNIQUE_SUFFIX = Date.now();
const TEST_EMAIL = `sync_fail_${UNIQUE_SUFFIX}@example.com`;
const TEST_PASSWORD = `Test!${UNIQUE_SUFFIX}fail`;

// ─── Clerk helpers ────────────────────────────────────────────────────────────

async function createTestUser(): Promise<string> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey)
    throw new Error("CLERK_SECRET_KEY is required for e2e sync-failure tests.");
  const clerk = createClerkClient({ secretKey });
  const user = await clerk.users.createUser({
    emailAddress: [TEST_EMAIL],
    password: TEST_PASSWORD,
    skipPasswordChecks: true,
  });
  return user.id;
}

async function deleteTestUser(userId: string): Promise<void> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) return;
  const clerk = createClerkClient({ secretKey });
  await clerk.users.deleteUser(userId).catch(() => {});
}

// ─── Page helpers ─────────────────────────────────────────────────────────────

async function signInViaUi(page: Page, email: string, password: string) {
  await page.goto("/sign-in");
  await page.getByLabel(/email/i).fill(email);
  await page.getByRole("button", { name: /continue/i }).click();
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/app/, { timeout: 20_000 });
}

async function navigateToJournal(page: Page) {
  const journalBtn = page.getByRole("button", { name: /^journal$/i });
  await expect(journalBtn).toBeVisible({ timeout: 10_000 });
  await journalBtn.click();
  await expect(page.getByRole("heading", { name: /my journal/i })).toBeVisible({
    timeout: 10_000,
  });
}

async function navigateToHospitalBag(page: Page) {
  await page.getByRole("button", { name: /tools/i }).click();
  await page.getByRole("button", { name: /hospital bag/i }).click();
  await expect(
    page.getByRole("heading", { name: /hospital bag/i }),
  ).toBeVisible({ timeout: 10_000 });
}

async function navigateToBirthPlan(page: Page) {
  await page.getByRole("button", { name: /tools/i }).click();
  await page.getByRole("button", { name: /birth plan/i }).click();
  await expect(page.getByRole("heading", { name: /birth plan/i })).toBeVisible({
    timeout: 10_000,
  });
}

/** Block all POST requests to /api/tools/* and return HTTP 500. */
async function interceptToolsPosts(page: Page) {
  await page.route(/\/api\/tools\//, async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "simulated server error" }),
      });
    } else {
      await route.continue();
    }
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("Sync API failure — error shown, no silent data loss", () => {
  let testUserId: string;

  test.beforeAll(async () => {
    await clerkSetup({
      publishableKey: process.env.VITE_CLERK_PUBLISHABLE_KEY,
    });
    testUserId = await createTestUser();
  });

  test.afterAll(async () => {
    await deleteTestUser(testUserId);
  });

  // ── Journal ────────────────────────────────────────────────────────────────

  test("journal: shows error toast on 500 and preserves entry locally", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await signInViaUi(page, TEST_EMAIL, TEST_PASSWORD);
    await navigateToJournal(page);

    // Arm the 500 interceptor before the save action
    await interceptToolsPosts(page);

    const uniqueText = `Fail-test journal ${UNIQUE_SUFFIX}`;
    await page.getByRole("button", { name: /new entry/i }).click();
    await page.getByPlaceholder(/write freely/i).fill(uniqueText);
    await page.getByRole("button", { name: /save entry/i }).click();

    // The UI must show an error toast — not a silent success
    await expect(page.getByText(/couldn't save to server/i)).toBeVisible({
      timeout: 10_000,
    });

    // The entry must still appear in the list (local fallback preserves it)
    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 5_000 });

    // Remove the intercept so the pending flush can succeed on next load
    await page.unrouteAll();

    // Reload — component sees the pending flag, flushes to server, then re-fetches
    await page.reload();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
    await navigateToJournal(page);

    // After successful flush the server now owns the entry; it must still appear
    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 15_000 });
  });

  // ── Hospital Bag ───────────────────────────────────────────────────────────

  test("hospital bag: shows error toast on 500 and preserves checkbox state locally", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await signInViaUi(page, TEST_EMAIL, TEST_PASSWORD);
    await navigateToHospitalBag(page);

    const itemLabel = "Photo ID and insurance card";
    await expect(page.getByText(itemLabel)).toBeVisible({ timeout: 10_000 });
    const checkbox = page.getByLabel(itemLabel);

    // Ensure the checkbox starts unchecked
    const initiallyChecked = await checkbox.isChecked();
    if (initiallyChecked) {
      await checkbox.click();
      await page.waitForTimeout(600);
    }

    // Arm the 500 interceptor before the action
    await interceptToolsPosts(page);

    // Toggle the checkbox — triggers apiSaveHospitalBag which will 500
    await checkbox.click();

    // The UI must surface an error toast — not silently succeed
    await expect(page.getByText(/couldn't save to server/i)).toBeVisible({
      timeout: 10_000,
    });

    // The checkbox must remain checked in the UI (optimistic + local fallback)
    await expect(checkbox).toBeChecked({ timeout: 5_000 });

    // Remove the intercept; on reload the pending flush will succeed
    await page.unrouteAll();

    await page.reload();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
    await navigateToHospitalBag(page);

    await expect(page.getByText(itemLabel)).toBeVisible({ timeout: 10_000 });

    // After successful flush the server now owns the checked state
    await expect(page.getByLabel(itemLabel)).toBeChecked({ timeout: 15_000 });
  });

  // ── Birth Plan ─────────────────────────────────────────────────────────────

  test("birth plan: shows error toast on 500 and preserves field value locally", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await signInViaUi(page, TEST_EMAIL, TEST_PASSWORD);
    await navigateToBirthPlan(page);

    const nameInput = page
      .locator('label:has-text("Your name") + input')
      .first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    // Arm the 500 interceptor before typing
    await interceptToolsPosts(page);

    const uniqueName = `FailTest ${UNIQUE_SUFFIX}`;
    await nameInput.fill(uniqueName);

    // The UI must show an error toast — not silently succeed
    await expect(page.getByText(/couldn't save to server/i)).toBeVisible({
      timeout: 10_000,
    });

    // The field value must still reflect what the user typed (local state preserved)
    await expect(nameInput).toHaveValue(uniqueName, { timeout: 5_000 });

    // Remove the intercept; on reload the pending flush will succeed
    await page.unrouteAll();

    await page.reload();
    await page.waitForURL(/\/app/, { timeout: 15_000 });
    await navigateToBirthPlan(page);

    const nameInputAfter = page
      .locator('label:has-text("Your name") + input')
      .first();
    await expect(nameInputAfter).toBeVisible({ timeout: 10_000 });

    // After successful flush the server now owns the field value
    await expect(nameInputAfter).toHaveValue(uniqueName, { timeout: 15_000 });
  });
});
