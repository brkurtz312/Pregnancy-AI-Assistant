import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// DB mock
// We control the return values via selectWhereImpl so each test can configure
// what the DB "returns" for getConfig and the user lookup without a real
// database connection.
// ---------------------------------------------------------------------------

const selectWhereImpl = vi.fn();

vi.mock("@workspace/db", () => {
  const selectChain = {
    from: () => ({
      where: (...args: unknown[]) => selectWhereImpl(...args),
    }),
  };

  const updateChain = {
    set: () => ({
      where: async () => undefined,
    }),
  };

  const insertChain = {
    values: () => ({
      onConflictDoUpdate: async () => undefined,
    }),
  };

  return {
    db: {
      select: (_fields?: unknown) => selectChain,
      update: () => updateChain,
      insert: () => insertChain,
    },
    appConfigTable: { key: "key" },
    usersTable: {
      id: "id",
      hasPass: "hasPass",
      passPurchasedAt: "passPurchasedAt",
      updatedAt: "updatedAt",
    },
    sql: (strings: TemplateStringsArray) => strings.raw[0],
    eq: (_col: unknown, _val: unknown) => "eq_stub",
  };
});

// ---------------------------------------------------------------------------
// Fetch stub — records calls, returns 200 ok by default
// ---------------------------------------------------------------------------
const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
  Promise.resolve({
    ok: true,
    status: 200,
    text: async () => "ok",
  } as Response),
);

// ---------------------------------------------------------------------------
// Import the module under test AFTER vi.mock() declarations.
// vitest hoists vi.mock() so the mocks are in place at import time.
// ---------------------------------------------------------------------------
import { main, sendAlert } from "../src/check-reviewer-pass";

// ---------------------------------------------------------------------------
// Env var snapshot / restore helpers
// ---------------------------------------------------------------------------
const ORIGINAL_SLACK = process.env.ALERT_SLACK_WEBHOOK_URL;
const ORIGINAL_RESEND = process.env.RESEND_API_KEY;
const ORIGINAL_EMAIL = process.env.ALERT_EMAIL;
const ORIGINAL_DEMO_USER = process.env.REVIEWER_DEMO_USER_ID;

function clearAlertEnv() {
  delete process.env.ALERT_SLACK_WEBHOOK_URL;
  delete process.env.RESEND_API_KEY;
  delete process.env.ALERT_EMAIL;
}

afterEach(() => {
  vi.restoreAllMocks();
  clearAlertEnv();
  if (ORIGINAL_SLACK !== undefined)
    process.env.ALERT_SLACK_WEBHOOK_URL = ORIGINAL_SLACK;
  if (ORIGINAL_RESEND !== undefined)
    process.env.RESEND_API_KEY = ORIGINAL_RESEND;
  if (ORIGINAL_EMAIL !== undefined) process.env.ALERT_EMAIL = ORIGINAL_EMAIL;
  if (ORIGINAL_DEMO_USER !== undefined)
    process.env.REVIEWER_DEMO_USER_ID = ORIGINAL_DEMO_USER;
  else delete process.env.REVIEWER_DEMO_USER_ID;
});

// ---------------------------------------------------------------------------
// sendAlert unit tests — exercise alerting logic in isolation
// ---------------------------------------------------------------------------
describe("sendAlert — Slack channel", () => {
  const payload = {
    demoUserId: "user_demo_test",
    timestamp: "2026-06-27T00:00:00.000Z",
    reason: "pass_revoked" as const,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    selectWhereImpl.mockReset();
    // sendAlert now calls getConfig for 4 keys; return no row for all by default
    // so the tests below control exactly which source wins per-test.
    selectWhereImpl.mockResolvedValue([]);
  });

  it("POSTs to the Slack webhook URL when ALERT_SLACK_WEBHOOK_URL is set via env var", async () => {
    clearAlertEnv();
    process.env.ALERT_SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/test-webhook";

    await sendAlert(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://hooks.slack.com/test-webhook");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as {
      text: string;
      blocks: Array<{ text: { text: string } }>;
    };
    expect(body.text).toContain("Reviewer pass revoked");
    expect(body.blocks[0].text.text).toContain("user_demo_test");
  });

  it("uses the app_config DB row for Slack URL over the env var", async () => {
    clearAlertEnv();
    // env var set to something different so we can confirm DB wins
    process.env.ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.com/env-webhook";

    // First getConfig call is for alert_slack_webhook_url → return a DB row
    selectWhereImpl
      .mockResolvedValueOnce([{ value: "https://hooks.slack.com/db-webhook" }]) // alert_slack_webhook_url
      .mockResolvedValue([]); // remaining keys (resend, email, from_email)

    await sendAlert(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://hooks.slack.com/db-webhook");
  });

  it("POSTs to the Resend API when RESEND_API_KEY + ALERT_EMAIL are both set via env vars", async () => {
    clearAlertEnv();
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.ALERT_EMAIL = "oncall@example.com";

    await sendAlert(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.method).toBe("POST");

    const body = JSON.parse(init.body as string) as {
      to: string[];
      subject: string;
    };
    expect(body.to).toContain("oncall@example.com");
    expect(body.subject).toContain("Reviewer pass revoked");
  });

  it("uses the app_config DB rows for Resend key and email over env vars", async () => {
    clearAlertEnv();
    // env vars set to something different so we can confirm DB wins
    process.env.RESEND_API_KEY = "re_env_key";
    process.env.ALERT_EMAIL = "env@example.com";

    // getConfig call order: alert_slack_webhook_url, alert_resend_api_key,
    //                        alert_email, alert_from_email
    selectWhereImpl
      .mockResolvedValueOnce([]) // alert_slack_webhook_url → no DB row
      .mockResolvedValueOnce([{ value: "re_db_key_abc" }]) // alert_resend_api_key → DB wins
      .mockResolvedValueOnce([{ value: "db@example.com" }]) // alert_email → DB wins
      .mockResolvedValue([]); // alert_from_email → no DB row

    await sendAlert(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");

    const body = JSON.parse(init.body as string) as {
      to: string[];
      from: string;
    };
    expect(body.to).toContain("db@example.com");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer re_db_key_abc",
    );
  });

  it("falls back to env var when DB row is absent (null getConfig)", async () => {
    clearAlertEnv();
    process.env.ALERT_SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/env-fallback";
    // All getConfig calls return [] → env fallback kicks in

    await sendAlert(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://hooks.slack.com/env-fallback");
  });

  it("makes no HTTP call when neither channel is configured", async () => {
    clearAlertEnv();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await sendAlert(payload);

    expect(fetchMock).not.toHaveBeenCalled();
    const allMessages = errorSpy.mock.calls.map((c) => c.join(" "));
    expect(
      allMessages.some((m) => m.includes("No alert channel configured")),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// main() integration tests — full health-check flow with DB mock
//
// process.exit() is mocked to throw so we can assert the exit code without
// terminating the test runner process.
// ---------------------------------------------------------------------------

/**
 * Build a process.exit spy that converts exit(N) into a thrown error so
 * the test can assert on the code via rejects.toThrow().
 */
function mockProcessExit() {
  return vi
    .spyOn(process, "exit")
    .mockImplementation((code?: number | string | null | undefined) => {
      throw new Error(`process.exit(${code})`);
    });
}

describe("main() — pass revoked triggers Slack alert and exits 1", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    selectWhereImpl.mockReset();
    clearAlertEnv();
    process.env.ALERT_SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/test-webhook";
    process.env.REVIEWER_DEMO_USER_ID = "user_demo_abc";
  });

  it("fires a Slack alert and exits 1 when hasPass = false", async () => {
    // Call order:
    //   1. getConfig("reviewer_demo_user_id") → []
    //   2. user select → [{hasPass: false}]
    //   3-6. sendAlert getConfig calls (4 keys) → [] each (env fallback active)
    selectWhereImpl
      .mockResolvedValueOnce([]) // getConfig(reviewer_demo_user_id)
      .mockResolvedValueOnce([{ hasPass: false }]) // user select
      .mockResolvedValue([]); // sendAlert getConfig calls → env fallback

    const exitSpy = mockProcessExit();

    await expect(main()).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    // The Slack webhook must have been called exactly once
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://hooks.slack.com/test-webhook");
  });

  it("fires a Slack alert and exits 1 when the demo user row is missing entirely", async () => {
    selectWhereImpl
      .mockResolvedValueOnce([]) // getConfig → null
      .mockResolvedValueOnce([]) // user select → row missing
      .mockResolvedValue([]); // sendAlert getConfig calls

    const exitSpy = mockProcessExit();

    await expect(main()).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("exits 0 and sends no alert when hasPass = true", async () => {
    selectWhereImpl
      .mockResolvedValueOnce([]) // getConfig → null
      .mockResolvedValueOnce([{ hasPass: true }]); // user → healthy

    const exitSpy = mockProcessExit();

    await expect(main()).rejects.toThrow("process.exit(0)");

    expect(exitSpy).toHaveBeenCalledWith(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("main() — no alert channel configured", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    selectWhereImpl.mockReset();
    clearAlertEnv(); // ← no ALERT_SLACK_WEBHOOK_URL or RESEND_API_KEY
    process.env.REVIEWER_DEMO_USER_ID = "user_demo_abc";
  });

  it("exits 1 and logs the warning without making any HTTP call", async () => {
    selectWhereImpl
      .mockResolvedValueOnce([]) // getConfig → null
      .mockResolvedValueOnce([{ hasPass: false }]) // user → revoked
      .mockResolvedValue([]); // sendAlert getConfig calls → all null → no env fallback either

    const exitSpy = mockProcessExit();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(main()).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    // No outbound HTTP calls — no channel was configured
    expect(fetchMock).not.toHaveBeenCalled();
    // "No alert channel configured" warning must appear
    const allMessages = errorSpy.mock.calls.map((c) => c.join(" "));
    expect(
      allMessages.some((m) => m.includes("No alert channel configured")),
    ).toBe(true);
  });
});
