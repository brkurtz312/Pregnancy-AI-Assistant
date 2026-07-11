/**
 * Playwright e2e: journal, hospital-bag, and birth-plan data must NOT bleed
 * from user A to user B after a same-device account switch.
 *
 * Companion to sync-persistence.spec.ts (which tests reload for the same user)
 * and session-switch-isolation.spec.ts (which tests profile/My-Info isolation).
 * This spec specifically covers the three sync-heavy tool sections so that any
 * regression in the SessionWatcher clear() → invalidateQueries() ordering is
 * caught before it reaches production.
 *
 * Why the "no flash" technique works:
 *   After user B signs in we intercept each GET /api/tools/* request and stall
 *   it for ~800 ms. During that window the React Query cache is the only data
 *   source. If SessionWatcher called queryClient.clear() on sign-out the cache
 *   is empty and the section renders nothing from user A. If it did NOT fire,
 *   the stale cache would immediately populate the UI with user A's data before
 *   the server response arrives — caught before the stall is released.
 *
 * Flow (single browser context, no page reloads between users):
 *   1. Sign in as user A; save journal entry, bag state, and birth-plan answer
 *      directly via the API so the data exists server-side.
 *   2. Navigate to each section so user A's data is loaded into the cache.
 *   3. Sign out — wait for deterministic signed-out UI indicator.
 *   4. Intercept each tool fetch to add an 800 ms stall.
 *   5. Sign in as user B; navigate to Journal, Hospital Bag, and Birth Plan.
 *   6. Assert user A's unique values are ABSENT before stalls resolve (no flash).
 *   7. Release stalls; assert sections are empty for user B (server agrees).
 *
 * Auth: uses @clerk/testing to bypass Clerk captcha.
 * Requires CLERK_SECRET_KEY + VITE_CLERK_PUBLISHABLE_KEY in env.
 */

import { test, expect, type Page } from "@playwright/test";
import { clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";

const UNIQUE_SUFFIX = Date.now();
const USER_A_EMAIL = `acct_switch_a_${UNIQUE_SUFFIX}@example.com`;
const USER_B_EMAIL = `acct_switch_b_${UNIQUE_SUFFIX}@example.com`;
const SHARED_PASSWORD = `Test!${UNIQUE_SUFFIX}pass`;

const USER_A_JOURNAL_TEXT = `AcctSwitch_Journal_A_${UNIQUE_SUFFIX}`;
const USER_A_BIRTH_PLAN_NAME = `AcctSwitch_BirthPlan_A_${UNIQUE_SUFFIX}`;
const USER_A_BAG_ITEM_LABEL = `AcctSwitch_BagItem_A_${UNIQUE_SUFFIX}`;

const USER_B_JOURNAL_TEXT = `AcctSwitch_Journal_B_${UNIQUE_SUFFIX}`;
const USER_B_BIRTH_PLAN_NAME = `AcctSwitch_BirthPlan_B_${UNIQUE_SUFFIX}`;
const USER_B_BAG_ITEM_LABEL = `AcctSwitch_BagItem_B_${UNIQUE_SUFFIX}`;

const STALL_MS = 800;

// ─── Clerk helpers ─────────────────────────────────────────────────────────────

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

// ─── UI helpers ───────────────────────────────────────────────────────────────

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
  // Wait for a deterministic signed-out indicator before proceeding.
  const signInBtn = page
    .getByTestId("button-sign-in")
    .or(page.getByTestId("button-nav-sign-in"));
  await expect(signInBtn.first()).toBeVisible({ timeout: 15_000 });
}

// ─── API seed helpers (bypass the UI for speed and determinism) ───────────────

async function seedJournalEntry(page: Page): Promise<void> {
  const res = await page.request.post("/api/tools/journal", {
    data: { text: USER_A_JOURNAL_TEXT },
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to seed journal entry: ${res.status()} ${await res.text()}`,
    );
  }
}

async function seedHospitalBag(page: Page): Promise<void> {
  const categories = [
    {
      id: "acct-switch-test",
      title: "Test Category",
      items: [
        {
          id: "acct-switch-item",
          label: USER_A_BAG_ITEM_LABEL,
          checked: true,
          custom: true,
        },
      ],
    },
  ];
  const res = await page.request.post("/api/tools/hospital-bag", {
    data: { categories },
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to seed hospital bag: ${res.status()} ${await res.text()}`,
    );
  }
}

async function seedBirthPlan(page: Page): Promise<void> {
  const res = await page.request.post("/api/tools/birth-plan", {
    data: { answers: { yourName: USER_A_BIRTH_PLAN_NAME } },
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok()) {
    throw new Error(
      `Failed to seed birth plan: ${res.status()} ${await res.text()}`,
    );
  }
}

// ─── Navigation helpers ───────────────────────────────────────────────────────

async function navigateToJournal(page: Page) {
  await page.getByRole("button", { name: /^journal$/i }).click();
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

// ─── Tests ─────────────────────────────────────────────────────────────────────

test.describe("Sync account-switch isolation — journal, bag, birth-plan", () => {
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

  test("user B never sees user A's journal entry — not even as a transient flash", async ({
    page,
  }) => {
    // ── Step 1: Sign in as user A ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_A_EMAIL, SHARED_PASSWORD);

    // ── Step 2: Seed user A's journal entry via API ────────────────────────────
    await seedJournalEntry(page);

    // ── Step 3: Navigate to Journal so user A's data enters the React Query cache
    await navigateToJournal(page);
    await expect(page.getByText(USER_A_JOURNAL_TEXT)).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 4: Sign out and wait for deterministic signed-out UI ──────────────
    await signOut(page);

    // ── Step 5: Intercept GET /api/tools/journal and stall it ──────────────────
    // Allows us to inspect the UI while React Query has no fresh server data,
    // catching any stale-cache leak from user A before the response arrives.
    let resolveJournalFetch!: () => void;
    const journalFetchGate = new Promise<void>(
      (resolve) => (resolveJournalFetch = resolve),
    );
    await page.route("**/api/tools/journal", async (route) => {
      if (route.request().method() === "GET") {
        await journalFetchGate;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // ── Step 6: Sign in as user B ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);

    // ── Step 7: Navigate to Journal while fetch is stalled ────────────────────
    await navigateToJournal(page);

    // ── Step 8: Assert BEFORE stall resolves — cache must be empty ────────────
    // If SessionWatcher did not call queryClient.clear() on sign-out, the stale
    // cache entry for user A's journal would appear here.
    const isVisibleBeforeFetch = await page
      .getByText(USER_A_JOURNAL_TEXT)
      .isVisible();
    if (isVisibleBeforeFetch) {
      throw new Error(
        `REGRESSION: user A's journal text "${USER_A_JOURNAL_TEXT}" ` +
          "appeared in user B's Journal view before the server response arrived. " +
          "SessionWatcher did not clear the React Query cache on sign-out.",
      );
    }

    // ── Step 9: Release the stall ──────────────────────────────────────────────
    resolveJournalFetch();
    await page.waitForTimeout(STALL_MS);

    // ── Step 10: Assert AFTER fetch — user B's journal should be empty ─────────
    await expect(page.getByText(USER_A_JOURNAL_TEXT)).not.toBeVisible({
      timeout: 5_000,
    });

    await page.unroute("**/api/tools/journal");
  });

  test("user B never sees user A's hospital bag checked state after an account switch", async ({
    page,
  }) => {
    // ── Step 1: Sign in as user A ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_A_EMAIL, SHARED_PASSWORD);

    // ── Step 2: Seed user A's hospital bag via API ─────────────────────────────
    await seedHospitalBag(page);

    // ── Step 3: Navigate to Hospital Bag to warm the React Query cache ─────────
    await navigateToHospitalBag(page);
    await expect(page.getByText(USER_A_BAG_ITEM_LABEL)).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 4: Sign out ───────────────────────────────────────────────────────
    await signOut(page);

    // ── Step 5: Intercept GET /api/tools/hospital-bag and stall it ────────────
    let resolveBagFetch!: () => void;
    const bagFetchGate = new Promise<void>(
      (resolve) => (resolveBagFetch = resolve),
    );
    await page.route("**/api/tools/hospital-bag", async (route) => {
      if (route.request().method() === "GET") {
        await bagFetchGate;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // ── Step 6: Sign in as user B ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);

    // ── Step 7: Navigate to Hospital Bag while fetch is stalled ───────────────
    await navigateToHospitalBag(page);

    // ── Step 8: Assert BEFORE stall resolves — user A's item must be absent ───
    const isVisibleBeforeFetch = await page
      .getByText(USER_A_BAG_ITEM_LABEL)
      .isVisible();
    if (isVisibleBeforeFetch) {
      throw new Error(
        `REGRESSION: user A's hospital bag item "${USER_A_BAG_ITEM_LABEL}" ` +
          "appeared in user B's Hospital Bag view before the server response arrived. " +
          "SessionWatcher did not clear the React Query cache on sign-out.",
      );
    }

    // ── Step 9: Release the stall ──────────────────────────────────────────────
    resolveBagFetch();
    await page.waitForTimeout(STALL_MS);

    // ── Step 10: Assert AFTER fetch — user B should not see user A's custom item
    await expect(page.getByText(USER_A_BAG_ITEM_LABEL)).not.toBeVisible({
      timeout: 5_000,
    });

    await page.unroute("**/api/tools/hospital-bag");
  });

  test("user B never sees user A's birth plan name after an account switch", async ({
    page,
  }) => {
    // ── Step 1: Sign in as user A ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_A_EMAIL, SHARED_PASSWORD);

    // ── Step 2: Seed user A's birth plan via API ───────────────────────────────
    await seedBirthPlan(page);

    // ── Step 3: Navigate to Birth Plan to warm the React Query cache ───────────
    await navigateToBirthPlan(page);
    const nameInput = page
      .locator('label:has-text("Your name") + input')
      .first();
    await expect(nameInput).toBeVisible({ timeout: 10_000 });
    await expect(nameInput).toHaveValue(USER_A_BIRTH_PLAN_NAME, {
      timeout: 10_000,
    });

    // ── Step 4: Sign out ───────────────────────────────────────────────────────
    await signOut(page);

    // ── Step 5: Intercept GET /api/tools/birth-plan and stall it ──────────────
    let resolveBirthPlanFetch!: () => void;
    const birthPlanFetchGate = new Promise<void>(
      (resolve) => (resolveBirthPlanFetch = resolve),
    );
    await page.route("**/api/tools/birth-plan", async (route) => {
      if (route.request().method() === "GET") {
        await birthPlanFetchGate;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // ── Step 6: Sign in as user B ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);

    // ── Step 7: Navigate to Birth Plan while fetch is stalled ─────────────────
    await navigateToBirthPlan(page);
    const nameInputB = page
      .locator('label:has-text("Your name") + input')
      .first();
    await expect(nameInputB).toBeVisible({ timeout: 10_000 });

    // ── Step 8: Assert BEFORE stall resolves — input must not contain A's name ─
    const valueBeforeFetch = await nameInputB.inputValue();
    if (valueBeforeFetch === USER_A_BIRTH_PLAN_NAME) {
      throw new Error(
        `REGRESSION: user A's birth plan name "${USER_A_BIRTH_PLAN_NAME}" ` +
          "appeared in user B's Birth Plan view before the server response arrived. " +
          "SessionWatcher did not clear the React Query cache on sign-out.",
      );
    }

    // ── Step 9: Release the stall ──────────────────────────────────────────────
    resolveBirthPlanFetch();
    await page.waitForTimeout(STALL_MS);

    // ── Step 10: Assert AFTER fetch — user B has no saved birth plan ───────────
    const valueAfterFetch = await nameInputB.inputValue();
    if (valueAfterFetch === USER_A_BIRTH_PLAN_NAME) {
      throw new Error(
        `REGRESSION: user A's birth plan name "${USER_A_BIRTH_PLAN_NAME}" ` +
          "appeared in user B's Birth Plan after the server response resolved. " +
          "The server returned user A's data for user B's session.",
      );
    }
    expect(valueAfterFetch).toBe("");

    await page.unroute("**/api/tools/birth-plan");
  });
});

// ─── Positive-case: user B's own previously-saved data loads after a switch ───
//
// The isolation suite above only proves user A's data does NOT appear for user B
// (user B is always fresh with no prior data, so "empty" is trivially correct).
// This suite seeds real data for user B BEFORE the switch and verifies that the
// positive case — user B's OWN data appearing — also works correctly.
//
// Flow per test:
//   1. Sign in as user B; seed B's data via the API; sign out.
//   2. Sign in as user A; navigate to the same section so A's session warms the
//      React Query cache with A's data; sign out.
//   3. Intercept the relevant GET endpoint and stall it (same technique as above)
//      to confirm the cache was cleared on sign-out and no flash of A's data appears.
//   4. Sign in as user B; navigate to the section; release the stall.
//   5. Assert user B's OWN data IS visible and user A's data is NOT visible.

test.describe("Sync account-switch — user B's own saved data loads after switch", () => {
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

  test("user B's own journal entry is visible after switching from user A", async ({
    page,
  }) => {
    // ── Step 1: Sign in as user B and seed B's journal entry ──────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);
    const seedBJournal = await page.request.post("/api/tools/journal", {
      data: { text: USER_B_JOURNAL_TEXT },
      headers: { "Content-Type": "application/json" },
    });
    if (!seedBJournal.ok()) {
      throw new Error(
        `Failed to seed user B journal: ${seedBJournal.status()} ${await seedBJournal.text()}`,
      );
    }

    // ── Step 2: Sign out user B ────────────────────────────────────────────────
    await signOut(page);

    // ── Step 3: Sign in as user A and seed + warm A's journal in the cache ────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_A_EMAIL, SHARED_PASSWORD);
    const seedAJournal = await page.request.post("/api/tools/journal", {
      data: { text: USER_A_JOURNAL_TEXT },
      headers: { "Content-Type": "application/json" },
    });
    if (!seedAJournal.ok()) {
      throw new Error(
        `Failed to seed user A journal: ${seedAJournal.status()} ${await seedAJournal.text()}`,
      );
    }
    await navigateToJournal(page);
    await expect(page.getByText(USER_A_JOURNAL_TEXT)).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 4: Sign out user A ────────────────────────────────────────────────
    await signOut(page);

    // ── Step 5: Intercept GET /api/tools/journal to stall the fetch ───────────
    let resolveJournalFetch!: () => void;
    const journalFetchGate = new Promise<void>(
      (resolve) => (resolveJournalFetch = resolve),
    );
    await page.route("**/api/tools/journal", async (route) => {
      if (route.request().method() === "GET") {
        await journalFetchGate;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // ── Step 6: Sign in as user B ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);
    await navigateToJournal(page);

    // ── Step 7: Before the stall resolves — user A's text must not appear ─────
    const aVisibleBeforeFetch = await page
      .getByText(USER_A_JOURNAL_TEXT)
      .isVisible();
    if (aVisibleBeforeFetch) {
      throw new Error(
        `REGRESSION: user A's journal text "${USER_A_JOURNAL_TEXT}" appeared ` +
          "in user B's Journal view before the server response arrived.",
      );
    }

    // ── Step 8: Release the stall ──────────────────────────────────────────────
    resolveJournalFetch();
    await page.waitForTimeout(STALL_MS);

    // ── Step 9: User B's OWN journal entry must now be visible ────────────────
    await expect(page.getByText(USER_B_JOURNAL_TEXT)).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 10: User A's entry must NOT be visible ───────────────────────────
    await expect(page.getByText(USER_A_JOURNAL_TEXT)).not.toBeVisible({
      timeout: 5_000,
    });

    await page.unroute("**/api/tools/journal");
  });

  test("user B's own hospital bag state is visible after switching from user A", async ({
    page,
  }) => {
    // ── Step 1: Sign in as user B and seed B's hospital bag ───────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);
    const seedBBag = await page.request.post("/api/tools/hospital-bag", {
      data: {
        categories: [
          {
            id: "acct-switch-test-b",
            title: "Test Category B",
            items: [
              {
                id: "acct-switch-item-b",
                label: USER_B_BAG_ITEM_LABEL,
                checked: true,
                custom: true,
              },
            ],
          },
        ],
      },
      headers: { "Content-Type": "application/json" },
    });
    if (!seedBBag.ok()) {
      throw new Error(
        `Failed to seed user B hospital bag: ${seedBBag.status()} ${await seedBBag.text()}`,
      );
    }

    // ── Step 2: Sign out user B ────────────────────────────────────────────────
    await signOut(page);

    // ── Step 3: Sign in as user A and warm A's bag in the cache ───────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_A_EMAIL, SHARED_PASSWORD);
    const seedABag = await page.request.post("/api/tools/hospital-bag", {
      data: {
        categories: [
          {
            id: "acct-switch-test-a",
            title: "Test Category A",
            items: [
              {
                id: "acct-switch-item-a",
                label: USER_A_BAG_ITEM_LABEL,
                checked: true,
                custom: true,
              },
            ],
          },
        ],
      },
      headers: { "Content-Type": "application/json" },
    });
    if (!seedABag.ok()) {
      throw new Error(
        `Failed to seed user A hospital bag: ${seedABag.status()} ${await seedABag.text()}`,
      );
    }
    await navigateToHospitalBag(page);
    await expect(page.getByText(USER_A_BAG_ITEM_LABEL)).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 4: Sign out user A ────────────────────────────────────────────────
    await signOut(page);

    // ── Step 5: Intercept GET /api/tools/hospital-bag to stall the fetch ──────
    let resolveBagFetch!: () => void;
    const bagFetchGate = new Promise<void>(
      (resolve) => (resolveBagFetch = resolve),
    );
    await page.route("**/api/tools/hospital-bag", async (route) => {
      if (route.request().method() === "GET") {
        await bagFetchGate;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // ── Step 6: Sign in as user B ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);
    await navigateToHospitalBag(page);

    // ── Step 7: Before the stall resolves — user A's item must not appear ─────
    const aVisibleBeforeFetch = await page
      .getByText(USER_A_BAG_ITEM_LABEL)
      .isVisible();
    if (aVisibleBeforeFetch) {
      throw new Error(
        `REGRESSION: user A's bag item "${USER_A_BAG_ITEM_LABEL}" appeared ` +
          "in user B's Hospital Bag view before the server response arrived.",
      );
    }

    // ── Step 8: Release the stall ──────────────────────────────────────────────
    resolveBagFetch();
    await page.waitForTimeout(STALL_MS);

    // ── Step 9: User B's OWN bag item must now be visible ─────────────────────
    await expect(page.getByText(USER_B_BAG_ITEM_LABEL)).toBeVisible({
      timeout: 10_000,
    });

    // ── Step 10: User A's item must NOT be visible ────────────────────────────
    await expect(page.getByText(USER_A_BAG_ITEM_LABEL)).not.toBeVisible({
      timeout: 5_000,
    });

    await page.unroute("**/api/tools/hospital-bag");
  });

  test("user B's own birth plan name is visible after switching from user A", async ({
    page,
  }) => {
    // ── Step 1: Sign in as user B and seed B's birth plan ─────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);
    const seedBPlan = await page.request.post("/api/tools/birth-plan", {
      data: { answers: { yourName: USER_B_BIRTH_PLAN_NAME } },
      headers: { "Content-Type": "application/json" },
    });
    if (!seedBPlan.ok()) {
      throw new Error(
        `Failed to seed user B birth plan: ${seedBPlan.status()} ${await seedBPlan.text()}`,
      );
    }

    // ── Step 2: Sign out user B ────────────────────────────────────────────────
    await signOut(page);

    // ── Step 3: Sign in as user A and warm A's birth plan in the cache ────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_A_EMAIL, SHARED_PASSWORD);
    const seedAPlan = await page.request.post("/api/tools/birth-plan", {
      data: { answers: { yourName: USER_A_BIRTH_PLAN_NAME } },
      headers: { "Content-Type": "application/json" },
    });
    if (!seedAPlan.ok()) {
      throw new Error(
        `Failed to seed user A birth plan: ${seedAPlan.status()} ${await seedAPlan.text()}`,
      );
    }
    await navigateToBirthPlan(page);
    const nameInputA = page
      .locator('label:has-text("Your name") + input')
      .first();
    await expect(nameInputA).toHaveValue(USER_A_BIRTH_PLAN_NAME, {
      timeout: 10_000,
    });

    // ── Step 4: Sign out user A ────────────────────────────────────────────────
    await signOut(page);

    // ── Step 5: Intercept GET /api/tools/birth-plan to stall the fetch ────────
    let resolveBirthPlanFetch!: () => void;
    const birthPlanFetchGate = new Promise<void>(
      (resolve) => (resolveBirthPlanFetch = resolve),
    );
    await page.route("**/api/tools/birth-plan", async (route) => {
      if (route.request().method() === "GET") {
        await birthPlanFetchGate;
        await route.continue();
      } else {
        await route.continue();
      }
    });

    // ── Step 6: Sign in as user B ──────────────────────────────────────────────
    await setupClerkTestingToken({ page });
    await signInViaUi(page, USER_B_EMAIL, SHARED_PASSWORD);
    await navigateToBirthPlan(page);
    const nameInputB = page
      .locator('label:has-text("Your name") + input')
      .first();
    await expect(nameInputB).toBeVisible({ timeout: 10_000 });

    // ── Step 7: Before the stall resolves — user A's name must not appear ─────
    const valueBeforeFetch = await nameInputB.inputValue();
    if (valueBeforeFetch === USER_A_BIRTH_PLAN_NAME) {
      throw new Error(
        `REGRESSION: user A's birth plan name "${USER_A_BIRTH_PLAN_NAME}" ` +
          "appeared in user B's Birth Plan view before the server response arrived.",
      );
    }

    // ── Step 8: Release the stall ──────────────────────────────────────────────
    resolveBirthPlanFetch();
    await page.waitForTimeout(STALL_MS);

    // ── Step 9: User B's OWN birth plan name must now appear ──────────────────
    const nameInputBAfter = page
      .locator('label:has-text("Your name") + input')
      .first();
    await expect(nameInputBAfter).toHaveValue(USER_B_BIRTH_PLAN_NAME, {
      timeout: 10_000,
    });

    // ── Step 10: User A's name must NOT appear ────────────────────────────────
    const finalValue = await nameInputBAfter.inputValue();
    if (finalValue === USER_A_BIRTH_PLAN_NAME) {
      throw new Error(
        `REGRESSION: user A's birth plan name "${USER_A_BIRTH_PLAN_NAME}" ` +
          "appeared in user B's Birth Plan after the server response resolved.",
      );
    }

    await page.unroute("**/api/tools/birth-plan");
  });
});
