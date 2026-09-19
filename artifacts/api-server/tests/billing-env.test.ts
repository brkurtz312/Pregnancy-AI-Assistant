import { describe, it, expect } from "vitest";
import {
  billingCredentialReport,
  billingProblems,
  replitConnectorAvailable,
} from "../src/lib/billing-env";

// The environment this server runs in today: Replit injects the connector
// hostname and an identity token, so every unset credential silently resolves
// through the connector.
const ON_REPLIT: NodeJS.ProcessEnv = {
  REPLIT_CONNECTORS_HOSTNAME: "connectors.replit.com",
  REPL_IDENTITY: "token",
  // Set in `.replit`'s `[userenv]`, so production has it today. It is here
  // because it does not travel: that file is not a secret store, and a host
  // that copies only the secrets loses this.
  REVENUECAT_PROJECT_ID: "proj9120626a",
};

// The environment after the hosting move: no connector, so an unset credential
// resolves to nothing at all.
const OFF_REPLIT: NodeJS.ProcessEnv = {};

describe("replitConnectorAvailable", () => {
  it("needs both a hostname and an identity token", () => {
    expect(replitConnectorAvailable(ON_REPLIT)).toBe(true);
    expect(
      replitConnectorAvailable({
        REPLIT_CONNECTORS_HOSTNAME: "connectors.replit.com",
        WEB_REPL_RENEWAL: "token",
      }),
    ).toBe(true);
    // A hostname with no token is how a half-configured deployment looks, and
    // it cannot actually reach the connector.
    expect(
      replitConnectorAvailable({
        REPLIT_CONNECTORS_HOSTNAME: "connectors.replit.com",
      }),
    ).toBe(false);
    expect(replitConnectorAvailable({ REPL_IDENTITY: "token" })).toBe(false);
    expect(replitConnectorAvailable(OFF_REPLIT)).toBe(false);
  });
});

describe("on Replit", () => {
  it("reports unset credentials as coming from the connector, not missing", () => {
    const report = billingCredentialReport(ON_REPLIT);
    expect(report.revenueCatKey).toBe("replit-connector");
    expect(report.stripeSecretKey).toBe("replit-connector");
    expect(report.onReplit).toBe(true);
  });

  it("raises nothing fatal — this is the state production runs in today", () => {
    const problems = billingProblems(billingCredentialReport(ON_REPLIT));
    expect(problems.filter((p) => p.severity === "error")).toEqual([]);
  });

  // The Stripe connection exposes no webhook_secret, so this is unset on
  // Replit too — survivable only because stripe-replit-sync reads the secret
  // from a table on that database.
  it("still warns about the webhook secret, which has no connector fallback", () => {
    const problems = billingProblems(billingCredentialReport(ON_REPLIT));
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("warn");
    expect(problems[0].message).toMatch(/stripe\._managed_webhooks/);
  });
});

describe("off Replit with nothing set", () => {
  const problems = billingProblems(billingCredentialReport(OFF_REPLIT));

  it("calls the RevenueCat gap an error, and says what breaks", () => {
    const err = problems.find((p) =>
      p.message.includes("REVENUECAT_SECRET_API_KEY"),
    );
    expect(err?.severity).toBe("error");
    // The consequence matters more than the variable name: this is the path
    // every App Store purchase takes.
    expect(err?.message).toMatch(/App Store purchase/);
  });

  it("calls the missing project id an error of its own", () => {
    // A separate failure from the key: reconcile checks the project id first
    // and gives up before authenticating, so a perfect key cannot cover it.
    const err = problems.find((p) =>
      p.message.includes("REVENUECAT_PROJECT_ID"),
    );
    expect(err?.severity).toBe("error");
    expect(err?.message).toMatch(/App Store purchases grant/);
  });

  it("calls the Stripe secret key an error", () => {
    const err = problems.find((p) => p.message.includes("STRIPE_SECRET_KEY"));
    expect(err?.severity).toBe("error");
  });

  it("reports every credential as missing", () => {
    const report = billingCredentialReport(OFF_REPLIT);
    expect(report.revenueCatKey).toBe("missing");
    expect(report.revenueCatProjectId).toBe("missing");
    expect(report.stripeSecretKey).toBe("missing");
    expect(report.stripeWebhookSecret).toBe("missing");
    expect(report.onReplit).toBe(false);
  });
});

describe("off Replit, fully configured", () => {
  const CONFIGURED: NodeJS.ProcessEnv = {
    REVENUECAT_SECRET_API_KEY: "sk_rc",
    REVENUECAT_PROJECT_ID: "proj9120626a",
    STRIPE_SECRET_KEY: "sk_live_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
  };

  it("reports every credential as coming from the environment", () => {
    const report = billingCredentialReport(CONFIGURED);
    expect(report).toEqual({
      revenueCatKey: "env",
      revenueCatProjectId: "env",
      stripeSecretKey: "env",
      stripeWebhookSecret: "env",
      onReplit: false,
    });
  });

  it("raises nothing — this is the target state", () => {
    expect(billingProblems(billingCredentialReport(CONFIGURED))).toEqual([]);
  });
});

// The dangerous middle: off Replit with Stripe configured but RevenueCat not.
// Web checkout works, the deploy looks healthy, and every App Store purchase
// silently fails to grant a pass.
describe("off Replit with RevenueCat forgotten", () => {
  it("is an error, not a warning", () => {
    const problems = billingProblems(
      billingCredentialReport({
        REVENUECAT_PROJECT_ID: "proj9120626a",
        STRIPE_SECRET_KEY: "sk_live_x",
        STRIPE_WEBHOOK_SECRET: "whsec_x",
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("error");
    expect(problems[0].message).toMatch(/REVENUECAT_SECRET_API_KEY/);
  });
});

// The same trap one variable over: the key is copied to the new host because
// it is in the secret manager, and the project id is not because it never was.
describe("off Replit with the project id forgotten", () => {
  it("is an error, and names the variable that is missing", () => {
    const problems = billingProblems(
      billingCredentialReport({
        REVENUECAT_SECRET_API_KEY: "sk_rc",
        STRIPE_SECRET_KEY: "sk_live_x",
        STRIPE_WEBHOOK_SECRET: "whsec_x",
      }),
    );
    expect(problems).toHaveLength(1);
    expect(problems[0].severity).toBe("error");
    expect(problems[0].message).toMatch(/REVENUECAT_PROJECT_ID/);
  });
});
