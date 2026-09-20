/**
 * Routing smoke tests.
 *
 * Guards against future routing regressions where `/` and `/app` swap pages or
 * where a landing-page CTA accidentally stops pointing at the calculator.
 *
 * We render each page component in isolation (heavy Clerk / API deps are
 * mocked) and assert on the distinctive content that should appear there.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { Router } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import LandingPage from "@/pages/landing";
import CalculatorPage from "@/pages/calculator";

// ─── DOM cleanup ──────────────────────────────────────────────────────────────
// vitest is configured with globals:false so testing-library's auto-cleanup
// hook does not register automatically — call cleanup explicitly after each test.
afterEach(cleanup);

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useAuth: vi.fn(() => ({ isSignedIn: false })),
  useUser: vi.fn(() => ({ isSignedIn: false, user: null })),
  Show: vi.fn(
    ({ when, children }: { when: string; children: React.ReactNode }) =>
      when === "signed-out" ? <>{children}</> : null,
  ),
  UserButton: vi.fn(() => null),
}));

vi.mock("@/hooks/use-pass", () => ({
  usePass: vi.fn(() => ({
    hasPass: false,
    freeRemaining: 5,
    freeLimit: 5,
  })),
  PassProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@workspace/api-client-react", () => ({
  useGetProfile: vi.fn(() => ({ data: undefined })),
  useUpdateProfile: vi.fn(() => ({ mutate: vi.fn() })),
}));

// RedeemCodeDialog uses a Radix portal — stub to avoid portal issues in jsdom
vi.mock("@/components/auth/redeem-code-dialog", () => ({
  RedeemCodeDialog: () => null,
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderLanding() {
  return render(
    <Router>
      <LandingPage />
    </Router>,
  );
}

function renderCalculator() {
  const qc = makeQueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Router>
        <CalculatorPage />
      </Router>
    </QueryClientProvider>,
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("/ — Landing page", () => {
  it("renders the hero section", () => {
    renderLanding();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.textContent?.toLowerCase()).toContain("every week of your");
  });

  it("renders the pricing section", () => {
    renderLanding();
    // Free plan price
    expect(screen.getByText("$0")).toBeDefined();
    // Pass price
    expect(screen.getByText("$9.99")).toBeDefined();
  });

  it("primary hero CTA links to /app", () => {
    renderLanding();
    const heroStart = screen.getByTestId("button-hero-start-free").closest("a");
    expect(heroStart?.getAttribute("href")).toBe("/app");
  });

  it("nav 'Open the app' button links to /app", () => {
    renderLanding();
    const navOpen = screen.getByTestId("button-nav-open-app").closest("a");
    expect(navOpen?.getAttribute("href")).toBe("/app");
  });

  it("free plan card 'Start free' button links to /app", () => {
    renderLanding();
    // button-plan-free is the unique testid on the free-plan card CTA
    const planFree = screen.getByTestId("button-plan-free").closest("a");
    expect(planFree?.getAttribute("href")).toBe("/app");
  });

  it("closing CTA 'Open the calculator' button links to /app", () => {
    renderLanding();
    // There is one element with this testid on the page; use getAllByTestId
    // and assert the first one points at /app (all must point to /app).
    const ctaButtons = screen.getAllByTestId("button-cta-open-app");
    expect(ctaButtons.length).toBeGreaterThan(0);
    for (const btn of ctaButtons) {
      const anchor = btn.closest("a");
      expect(anchor?.getAttribute("href")).toBe("/app");
    }
  });
});

describe("/app — Calculator page", () => {
  it("renders the Pregnancy Assistant heading", () => {
    renderCalculator();
    // The h1 on the calculator page contains this text
    expect(screen.getAllByText("Pregnancy Assistant").length).toBeGreaterThan(
      0,
    );
  });

  it("renders the LMP calculator tab", () => {
    renderCalculator();
    // getAllByTestId because the tab may appear in multiple tab lists
    const tabs = screen.getAllByTestId("tab-lmp");
    expect(tabs.length).toBeGreaterThan(0);
  });

  it("renders all four calculation method tabs", () => {
    renderCalculator();
    expect(screen.getAllByTestId("tab-lmp").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("tab-due-date").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("tab-conception").length).toBeGreaterThan(0);
    expect(screen.getAllByTestId("tab-ultrasound").length).toBeGreaterThan(0);
  });
});
