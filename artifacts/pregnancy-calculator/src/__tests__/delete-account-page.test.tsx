/**
 * The account deletion page (Google Play Data safety's deletion URL).
 *
 * Play requires a page that names the app and developer, explains how to ask
 * for deletion without the app, and says what is deleted and what is kept.
 * These pin those statements, and the privacy page's link to it.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import DeleteAccountPage, { EMAIL_REQUEST_DAYS } from "@/pages/delete-account";
import PrivacyPage, { COMPANY_NAME, PRIVACY_EMAIL } from "@/pages/privacy";

afterEach(cleanup);

function renderPage(page: React.ReactElement) {
  return render(<Router>{page}</Router>);
}

describe("/delete-account", () => {
  it("names the app and the developer", () => {
    renderPage(<DeleteAccountPage />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Delete your account",
    );
    const text = document.body.textContent ?? "";
    expect(text).toContain("Pregnancy AI Assistant");
    expect(text).toContain(COMPANY_NAME);
  });

  it("gives the in-app steps", () => {
    renderPage(<DeleteAccountPage />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Delete Account");
    expect(text).toContain("Permanently Delete Account");
  });

  it("offers an email request for people without the app", () => {
    renderPage(<DeleteAccountPage />);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href") ?? "");
    expect(
      hrefs.some((h) => h.startsWith(`mailto:${PRIVACY_EMAIL}?subject=`)),
    ).toBe(true);
    expect(document.body.textContent).toContain(
      `within ${EMAIL_REQUEST_DAYS} days`,
    );
  });

  it("says what is deleted and what is kept", () => {
    renderPage(<DeleteAccountPage />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("What is deleted");
    expect(text).toContain("What is kept");
    expect(text).toContain("Google Play");
    expect(text).toContain("RevenueCat");
  });

  it("links back to the privacy policy", () => {
    renderPage(<DeleteAccountPage />);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/privacy");
  });
});

describe("/privacy, for Android", () => {
  it("links to the deletion page for people without the app", () => {
    renderPage(<PrivacyPage />);
    const hrefs = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/delete-account");
  });

  it("names Google Play alongside Apple for purchases", () => {
    renderPage(<PrivacyPage />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Apple or Google Play");
    expect(text).toContain("Android");
  });
});
