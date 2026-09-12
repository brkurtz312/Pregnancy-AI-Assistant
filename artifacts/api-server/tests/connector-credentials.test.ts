import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// The Stripe and RevenueCat clients read their credentials from the
// environment and fall back to Replit's connector API only when the
// environment is unset. These tests pin that precedence, because getting it
// wrong is silent: the wrong branch still returns a working client, against
// the wrong account.
//
// See docs/replit-exit-plan.md — the connector branch is deleted once the
// move off Replit is complete, and these tests should shrink with it.

const stripeConstructor = vi.fn();
vi.mock("stripe", () => ({
  default: class {
    constructor(...args: unknown[]) {
      stripeConstructor(...args);
    }
  },
}));

vi.mock("stripe-replit-sync", () => ({
  StripeSync: class {
    constructor(public options: unknown) {}
  },
  runMigrations: vi.fn(),
}));

const createClientMock = vi.fn(() => ({}));
vi.mock("@replit/revenuecat-sdk/client", () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

const REPLIT_ENV = {
  REPLIT_CONNECTORS_HOSTNAME: "connectors.replit.test",
  REPL_IDENTITY: "identity-token",
};

/** A connector API that would answer, if anything asked it. */
function mockConnector(settings: Record<string, unknown>) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => ({ items: [{ settings }] }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("credential resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    stripeConstructor.mockClear();
    createClientMock.mockClear();
    for (const key of [
      "STRIPE_SECRET_KEY",
      "STRIPE_WEBHOOK_SECRET",
      "REVENUECAT_SECRET_API_KEY",
      "REPLIT_CONNECTORS_HOSTNAME",
      "REPL_IDENTITY",
      "WEB_REPL_RENEWAL",
    ]) {
      delete process.env[key];
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("Stripe", () => {
    it("uses STRIPE_SECRET_KEY without calling the connector", async () => {
      const fetchMock = mockConnector({ secret: "sk_from_connector" });
      process.env.STRIPE_SECRET_KEY = "sk_from_env";
      Object.assign(process.env, REPLIT_ENV);

      const { getUncachableStripeClient } =
        await import("../src/lib/stripeClient");
      await getUncachableStripeClient();

      expect(stripeConstructor).toHaveBeenCalledWith("sk_from_env");
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("falls back to the connector when the env var is unset", async () => {
      const fetchMock = mockConnector({ secret: "sk_from_connector" });
      Object.assign(process.env, REPLIT_ENV);

      const { getUncachableStripeClient } =
        await import("../src/lib/stripeClient");
      await getUncachableStripeClient();

      expect(stripeConstructor).toHaveBeenCalledWith("sk_from_connector");
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("passes STRIPE_WEBHOOK_SECRET through to StripeSync", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_from_env";
      process.env.STRIPE_WEBHOOK_SECRET = "whsec_from_env";
      process.env.DATABASE_URL = "postgres://localhost/test";

      const { getStripeSync } = await import("../src/lib/stripeClient");
      const sync = (await getStripeSync()) as unknown as {
        options: { stripeSecretKey: string; stripeWebhookSecret: string };
      };

      expect(sync.options.stripeSecretKey).toBe("sk_from_env");
      expect(sync.options.stripeWebhookSecret).toBe("whsec_from_env");
    });

    it("tolerates a missing webhook secret, as Replit's managed webhook does", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_from_env";
      process.env.DATABASE_URL = "postgres://localhost/test";

      const { getStripeSync } = await import("../src/lib/stripeClient");
      const sync = (await getStripeSync()) as unknown as {
        options: { stripeWebhookSecret: string };
      };

      expect(sync.options.stripeWebhookSecret).toBe("");
    });

    it("names the env var when neither source is configured", async () => {
      const { getUncachableStripeClient } =
        await import("../src/lib/stripeClient");
      await expect(getUncachableStripeClient()).rejects.toThrow(
        /STRIPE_SECRET_KEY/,
      );
    });
  });

  describe("RevenueCat", () => {
    it("uses REVENUECAT_SECRET_API_KEY without calling the connector", async () => {
      const fetchMock = mockConnector({ access_token: "token_from_connector" });
      process.env.REVENUECAT_SECRET_API_KEY = "sk_from_env";
      Object.assign(process.env, REPLIT_ENV);

      const { getUncachableRevenueCatClient } =
        await import("../src/lib/revenueCatClient");
      await getUncachableRevenueCatClient();

      expect(createClientMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { Authorization: "Bearer sk_from_env" },
        }),
      );
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("falls back to the connector's OAuth token when the env var is unset", async () => {
      const fetchMock = mockConnector({ access_token: "token_from_connector" });
      Object.assign(process.env, REPLIT_ENV);

      const { getUncachableRevenueCatClient } =
        await import("../src/lib/revenueCatClient");
      await getUncachableRevenueCatClient();

      expect(createClientMock).toHaveBeenCalledWith(
        expect.objectContaining({
          headers: { Authorization: "Bearer token_from_connector" },
        }),
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it("names the env var when neither source is configured", async () => {
      const { getUncachableRevenueCatClient } =
        await import("../src/lib/revenueCatClient");
      await expect(getUncachableRevenueCatClient()).rejects.toThrow(
        /REVENUECAT_SECRET_API_KEY/,
      );
    });
  });
});
