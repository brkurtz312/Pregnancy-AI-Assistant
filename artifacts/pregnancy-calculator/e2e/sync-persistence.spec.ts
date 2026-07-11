/**
 * Playwright e2e: journal entries, hospital bag check state, and birth plan answers
 * survive a page reload (the equivalent of switching devices when the server is the
 * source of truth).
 *
 * Each test:
 *   1. Signs in as a fresh Clerk user (created at the start of the suite).
 *   2. Creates / modifies data through the UI so the sync layer saves it server-side.
 *   3. Reloads the page, triggering a fresh API fetch with no in-memory state.
 *   4. Navigates to the same section and verifies the data is still present.
 *
 * Auth: uses @clerk/testing to bypass Clerk captcha so sign-in works in automation.
 * Requires CLERK_SECRET_KEY + VITE_CLERK_PUBLISHABLE_KEY in env.
 */

import { test, expect, type Page } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const UNIQUE_SUFFIX = Date.now();
const TEST_EMAIL = `sync_persist_${UNIQUE_SUFFIX}@example.com`;
const TEST_PASSWORD = `Test!${UNIQUE_SUFFIX}pass`;

// ─── Clerk helpers ────────────────────────────────────────────────────────────

async function createTestUser(): Promise<string> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required for e2e sync tests.");
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
  // Wait for the Journal heading to confirm the view rendered
  await expect(page.getByRole("heading", { name: /my journal/i })).toBeVisible({
    timeout: 10_000,
  });
}

async function navigateToHospitalBag(page: Page) {
  await page.getByRole("button", { name: /tools/i }).click();
  await page.getByRole("button", { name: /hospital bag/i }).click();
  await expect(page.getByRole("heading", { name: /hospital bag/i })).toBeVisible({
    timeout: 10_000,
  });
}

async function navigateToBirthPlan(page: Page) {
  await page.getByRole("button", { name: /tools/i }).click();
  await page.getByRole("button", { name: /birth plan/i }).click();
  await expect(page.getByRole("heading", { name: /birth plan/i })).toBeVisible({
    timeout: 10_000,
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe("Sync persistence — data survives a page reload", () => {
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

  test("journal entry persists across a page reload", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await signInViaUi(page, TEST_EMAIL, TEST_PASSWORD);

    await navigateToJournal(page);

    // Create a new entry with unique text
    const uniqueText = `Sync journal test ${UNIQUE_SUFFIX}`;
    await page.getByRole("button", { name: /new entry/i }).click();
    await page.getByPlaceholder(/write freely/i).fill(uniqueText);
    await page.getByRole("button", { name: /save entry/i }).click();

    // Confirm the entry appears in the list before reload
    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 10_000 });

    // Reload — wipes all in-memory React state; the server is now the only source
    await page.reload();
    await page.waitForURL(/\/app/, { timeout: 15_000 });

    await navigateToJournal(page);

    // The entry must still be visible — restored from the API
    await expect(page.getByText(uniqueText)).toBeVisible({ timeout: 10_000 });
  });

  // ── Hospital Bag ───────────────────────────────────────────────────────────

  test("hospital bag check state persists across a page reload", async ({
    page,
  }) => {
    await setupClerkTestingToken({ page });
    await signInViaUi(page, TEST_EMAIL, TEST_PASSWORD);

    await navigateToHospitalBag(page);

    // "Photo ID and insurance card" is the first default item (no note) in the
    // "Paperwork & Essentials" category. Its checkbox is a descendant of a
    // <label> whose text content is that string, so getByLabel resolves it.
    const itemLabel = "Photo ID and insurance card";

    // Wait for categories to render
    await expect(page.getByText(itemLabel)).toBeVisible({ timeout: 10_000 });
    const checkbox = page.getByLabel(itemLabel);

    // Ensure it starts unchecked (fresh user — server has no data yet).
    // If it happens to be checked from a prior state, uncheck first.
    const initiallyChecked = await checkbox.isChecked();
    if (initiallyChecked) {
      await checkbox.click();
      await page.waitForTimeout(600);
    }

    // Check the item — triggers apiSaveHospitalBag server-side
    await checkbox.click();
    // Give the API call time to complete before reloading
    await page.waitForTimeout(800);

    // Reload — all component state is destroyed
    await page.reload();
    await page.waitForURL(/\/app/, { timeout: 15_000 });

    await navigateToHospitalBag(page);

    // Wait for the list to re-render from the server response
    await expect(page.getByText(itemLabel)).toBeVisible({ timeout: 10_000 });

    // The item must be checked — restored from the API
    await expect(page.getByLabel(itemLabel)).toBeChecked({ timeout: 10_000 });
  });

  // ── Birth Plan ─────────────────────────────────────────────────────────────

  test("birth plan answer persists across a page reload", async ({ page }) => {
    await setupClerkTestingToken({ page });
    await signInViaUi(page, TEST_EMAIL, TEST_PASSWORD);

    await navigateToBirthPlan(page);

    // The "Your name" field (field id: yourName) renders as:
    //   <label>Your name</label>
    //   <input ... />            ← direct adjacent sibling
    // There is no `for`/`id` linkage, so we use the adjacent-sibling CSS selector.
    const uniqueName = `Sync Test User ${UNIQUE_SUFFIX}`;
    const nameInput = page.locator('label:has-text("Your name") + input').first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });

    await nameInput.fill(uniqueName);
    // setField calls apiSaveBirthPlanAnswers on every change — wait for it
    await page.waitForTimeout(800);

    // Reload — wipes all React state
    await page.reload();
    await page.waitForURL(/\/app/, { timeout: 15_000 });

    await navigateToBirthPlan(page);

    // Locate the same input after reload
    const nameInputAfter = page.locator('label:has-text("Your name") + input').first();
    await expect(nameInputAfter).toBeVisible({ timeout: 10_000 });

    // Value must be restored from the server
    await expect(nameInputAfter).toHaveValue(uniqueName, { timeout: 10_000 });
  });
});
