/**
 * Landing page checkout button tests.
 *
 * Covers three paths:
 *  1. Signed-in user clicks "Get the Full Pass" → startCheckout() fires.
 *  2. Signed-out user clicks "Get the Full Pass" → redirected to
 *     /sign-in?redirect_url=...&start_checkout=1.
 *  3. Signed-in user arrives with ?start_checkout=1 in the URL → auto-checkout
 *     effect fires automatically.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Router } from "wouter";
import LandingPage from "@/pages/landing";
import * as ClerkReact from "@clerk/react";
import * as UsePassModule from "@/hooks/use-pass";

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
    startCheckout: vi.fn(),
    isStartingCheckout: false,
    redeemCode: vi.fn(),
    isRedeeming: false,
    refresh: vi.fn(),
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
    startCheckout: vi.fn(),
    isStartingCheckout: false,
    redeemCode: vi.fn(),
    isRedeeming: false,
    refresh: vi.fn(),
    ...overrides,
  };
}

// ─── Cleanup ──────────────────────────────────────────────────────────────────

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  // Restore URL to bare path after each test.
  window.history.replaceState(null, "", "/");
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("Landing page — checkout button", () => {
  it("signed-in: clicking 'Get the Full Pass' calls startCheckout()", async () => {
    const startCheckout = vi.fn();

    vi.mocked(ClerkReact.useAuth).mockReturnValue({
      isSignedIn: true,
    } as ReturnType<typeof ClerkReact.useAuth>);
    vi.mocked(UsePassModule.usePass).mockReturnValue(
      makePassValue({ startCheckout }),
    );

    renderLanding();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("button-plan-pass"));

    expect(startCheckout).toHaveBeenCalledOnce();
  });

  it("signed-out: clicking 'Get the Full Pass' redirects to /sign-in with start_checkout=1 in the redirect_url", async () => {
    // Stub window.location so we can inspect the href assignment without
    // triggering an actual navigation in happy-dom.
    const locationStub = {
      href: "",
      pathname: "/",
      search: "",
      hash: "",
    };
    vi.stubGlobal("location", locationStub);

    vi.mocked(ClerkReact.useAuth).mockReturnValue({
      isSignedIn: false,
    } as ReturnType<typeof ClerkReact.useAuth>);
    vi.mocked(UsePassModule.usePass).mockReturnValue(
      makePassValue({ isSignedIn: false }),
    );

    renderLanding();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("button-plan-pass"));

    // The href must point at the sign-in page.
    expect(locationStub.href).toContain("/sign-in");

    // Extract and decode the redirect_url query param.
    const assignedUrl = new URL(locationStub.href, "http://localhost");
    const rawRedirectUrl = assignedUrl.searchParams.get("redirect_url");
    expect(rawRedirectUrl).not.toBeNull();

    const redirectUrl = new URL(
      decodeURIComponent(rawRedirectUrl!),
      "http://localhost",
    );
    expect(redirectUrl.searchParams.get("start_checkout")).toBe("1");
  });

  it("auto-checkout: signed-in user landing with ?start_checkout=1 triggers startCheckout()", async () => {
    const startCheckout = vi.fn();

    // Simulate arriving from the sign-in redirect by setting the search param
    // before the component mounts.
    window.history.pushState(null, "", "/?start_checkout=1");

    vi.mocked(ClerkReact.useAuth).mockReturnValue({
      isSignedIn: true,
    } as ReturnType<typeof ClerkReact.useAuth>);
    vi.mocked(UsePassModule.usePass).mockReturnValue(
      makePassValue({ startCheckout }),
    );

    renderLanding();

    await waitFor(() => {
      expect(startCheckout).toHaveBeenCalledOnce();
    });

    // The effect must also strip ?start_checkout from the URL.
    expect(window.location.search).not.toContain("start_checkout");
  });
});
