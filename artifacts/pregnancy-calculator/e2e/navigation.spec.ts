import { test, expect } from "@playwright/test";

test("hero CTA navigates from landing to calculator", async ({ page }) => {
  await page.goto("/");

  const cta = page.getByTestId("button-hero-start-free");
  await expect(cta).toBeVisible();

  await cta.click();

  await expect(page.getByTestId("tab-lmp").first()).toBeVisible();
});
