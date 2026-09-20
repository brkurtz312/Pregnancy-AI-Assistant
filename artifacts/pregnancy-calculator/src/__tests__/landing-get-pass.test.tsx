/**
 * Landing page "get the pass" tests.
 *
 * The web app does not sell the pass — purchases happen in the App Store
 * (docs/stripe-removal-plan.md). These pin the two things that replaced the
 * Stripe checkout flow:
 *
 *  1. The CTA is a link to the App Store, for signed-in and signed-out alike.
 *     There is no sign-in detour any more: nothing on this page needs an
 *     account to complete.
 *  2. A user who already owns the pass sees the active banner instead.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import LandingPage from "@/pages/landing";
import * as ClerkReact from "@clerk/react";
import * as UsePassModule from "@/hooks/use-pass";
import { APP_STORE_URL } from "@/lib/app-store";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useAuth: vi.fn(() => ({ isSignedIn: false })),
  Show: vi.fn(
    ({ when, children }: { when: string; children: React.ReactNode }) =>
      when === "signed-out" ? <>{children}</> : null,
  ),
  UserButton: vi.fn(() => null),
}));

vi.mock("@/hooks/use-pass", () => ({
  usePass: vi.fn(() => ({
    hasPass: false,
    isSignedIn: false,
    freeUsed: 0,
    freeLimit: 5,
    freeRemaining: 5,
    isLoading: false,
    redeemCode: vi.fn(),
    isRedeeming: false,
    refresh: vi.fn(),
    justPurchased: false,
    dismissJustPurchased: vi.fn(),
  })),
  PassProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderLanding() {
  return render(
    <Router>
      <LandingPage />
    </Router>,
  );
}

function makePassValue(
  overrides: Partial<ReturnType<typeof UsePassModule.usePass>> = {},
) {
  return {
    hasPass: false,
    isSignedIn: true,
    freeUsed: 0,
    freeLimit: 5,
    freeRemaining: 5,
    isLoading: false,
    redeemCode: vi.fn(),
    isRedeeming: false,
    refresh: vi.fn(),
    justPurchased: false,
    dismissJustPurchased: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Landing page — getting the pass", () => {
  it("signed-in: the CTA links to the App Store", () => {
    vi.mocked(ClerkReact.useAuth).mockReturnValue({
      isSignedIn: true,
    } as unknown as ReturnType<typeof ClerkReact.useAuth>);
    vi.mocked(UsePassModule.usePass).mockReturnValue(makePassValue());

    renderLanding();

    const cta = screen.getByTestId("button-plan-pass");
    expect(cta.getAttribute("href")).toBe(APP_STORE_URL);
  });

  it("signed-out: the CTA links to the App Store rather than detouring via sign-in", () => {
    vi.mocked(ClerkReact.useAuth).mockReturnValue({
      isSignedIn: false,
    } as unknown as ReturnType<typeof ClerkReact.useAuth>);
    vi.mocked(UsePassModule.usePass).mockReturnValue(
      makePassValue({ isSignedIn: false }),
    );

    renderLanding();

    const cta = screen.getByTestId("button-plan-pass");
    // The old flow sent a signed-out visitor to /sign-in with
    // ?start_checkout=1 so checkout could resume afterwards. Nothing resumes
    // now, so the detour is gone.
    expect(cta.getAttribute("href")).toBe(APP_STORE_URL);
  });

  it("opens the App Store in a new tab, safely", () => {
    vi.mocked(UsePassModule.usePass).mockReturnValue(makePassValue());

    renderLanding();

    const cta = screen.getByTestId("button-plan-pass");
    expect(cta.getAttribute("target")).toBe("_blank");
    expect(cta.getAttribute("rel")).toContain("noreferrer");
  });

  it("a user who already owns the pass sees the active banner, not the CTA", () => {
    vi.mocked(UsePassModule.usePass).mockReturnValue(
      makePassValue({ hasPass: true }),
    );

    renderLanding();

    expect(screen.getByTestId("pass-active-banner")).toBeDefined();
    expect(screen.queryByTestId("button-plan-pass")).toBeNull();
  });

  it("states the price the App Store charges", () => {
    vi.mocked(UsePassModule.usePass).mockReturnValue(makePassValue());

    renderLanding();

    expect(screen.getByText("$9.99")).toBeDefined();
  });
});
