/**
 * The privacy policy page (App Store Connect's Privacy Policy URL).
 *
 * These pin the statements that must stay true and in step with
 * docs/app-privacy.md: who to contact, which services see data, and that
 * the old "we collect nothing" claim does not come back.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import PrivacyPage, { EFFECTIVE_DATE, PRIVACY_EMAIL } from "@/pages/privacy";

afterEach(cleanup);

function renderPage() {
  return render(
    <Router>
      <PrivacyPage />
    </Router>,
  );
}

describe("/privacy", () => {
  it("renders the policy heading and effective date", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Privacy Policy",
    );
    expect(document.body.textContent).toContain(`Effective ${EFFECTIVE_DATE}`);
  });

  it("gives a working contact address", () => {
    renderPage();
    const links = screen
      .getAllByRole("link")
      .map((a) => a.getAttribute("href"));
    expect(links).toContain(`mailto:${PRIVACY_EMAIL}`);
  });

  it("names every service that handles user data", () => {
    renderPage();
    const text = document.body.textContent ?? "";
    for (const name of [
      "Clerk",
      "Railway",
      "Cloudflare",
      "Anthropic",
      "RevenueCat",
      "Apple",
      "OpenStreetMap",
    ]) {
      expect(text, name).toContain(name);
    }
  });

  it("tells users how to delete their data", () => {
    renderPage();
    expect(document.body.textContent).toContain("Delete Account");
  });

  it("does not claim the app collects nothing", () => {
    renderPage();
    const text = (document.body.textContent ?? "").toLowerCase();
    expect(text).not.toContain("does not collect");
    expect(text).not.toContain("stored locally on your device only");
  });
});
