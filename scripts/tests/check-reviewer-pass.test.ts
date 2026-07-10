import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// DB mock — only getConfig (appConfigTable select) is used now
// ---------------------------------------------------------------------------

const selectWhereImpl = vi.fn();

vi.mock("@workspace/db", () => {
  const selectChain = {
    from: () => ({
      where: (...args: unknown[]) => selectWhereImpl(...args),
    }),
  };

  return {
    db: {
      select: (_fields?: unknown) => selectChain,
    },
    appConfigTable: { key: "key" },
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
// Import module under test AFTER vi.mock() declarations.
// ---------------------------------------------------------------------------
import { main, sendAlert } from "../src/check-reviewer-pass";

// ---------------------------------------------------------------------------
// Env snapshot / restore helpers
// ---------------------------------------------------------------------------
const ORIGINAL_SLACK = process.env.ALERT_SLACK_WEBHOOK_URL;
const ORIGINAL_RESEND = process.env.RESEND_API_KEY;
const ORIGINAL_EMAIL = process.env.ALERT_EMAIL;
const ORIGINAL_CLERK_KEY = process.env.CLERK_SECRET_KEY;
const ORIGINAL_DEV_CODE = process.env.DEV_ACCESS_CODE;

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
  if (ORIGINAL_CLERK_KEY !== undefined)
    process.env.CLERK_SECRET_KEY = ORIGINAL_CLERK_KEY;
  else delete process.env.CLERK_SECRET_KEY;
  if (ORIGINAL_DEV_CODE !== undefined)
    process.env.DEV_ACCESS_CODE = ORIGINAL_DEV_CODE;
  else delete process.env.DEV_ACCESS_CODE;
});

// ---------------------------------------------------------------------------
// sendAlert unit tests
// ---------------------------------------------------------------------------
describe("sendAlert — Slack channel", () => {
  const payload = {
    timestamp: "2026-06-27T00:00:00.000Z",
    reason: "clerk_unreachable" as const,
  };

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    selectWhereImpl.mockReset();
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
    expect(body.text).toContain("Clerk API unreachable");
  });

  it("uses the app_config DB row for Slack URL over the env var", async () => {
    clearAlertEnv();
    process.env.ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.com/env-webhook";

    selectWhereImpl
      .mockResolvedValueOnce([{ value: "https://hooks.slack.com/db-webhook" }])
      .mockResolvedValue([]);

    await sendAlert(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://hooks.slack.com/db-webhook");
  });

  it("POSTs to the Resend API when RESEND_API_KEY + ALERT_EMAIL are both set", async () => {
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
    expect(body.subject).toContain("Clerk API unreachable");
  });

  it("uses the app_config DB rows for Resend key and email over env vars", async () => {
    clearAlertEnv();
    process.env.RESEND_API_KEY = "re_env_key";
    process.env.ALERT_EMAIL = "env@example.com";

    selectWhereImpl
      .mockResolvedValueOnce([]) // alert_slack_webhook_url → no DB row
      .mockResolvedValueOnce([{ value: "re_db_key_abc" }]) // alert_resend_api_key
      .mockResolvedValueOnce([{ value: "db@example.com" }]) // alert_email
      .mockResolvedValue([]); // alert_from_email

    await sendAlert(payload);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");

    const body = JSON.parse(init.body as string) as { to: string[] };
    expect(body.to).toContain("db@example.com");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe(
      "Bearer re_db_key_abc",
    );
  });

  it("falls back to env var when DB row is absent", async () => {
    clearAlertEnv();
    process.env.ALERT_SLACK_WEBHOOK_URL =
      "https://hooks.slack.com/env-fallback";

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
// main() integration tests
// ---------------------------------------------------------------------------

function mockProcessExit() {
  return vi
    .spyOn(process, "exit")
    .mockImplementation((code?: number | string | null | undefined) => {
      throw new Error(`process.exit(${code})`);
    });
}

describe("main() — all checks pass", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    selectWhereImpl.mockReset();
    selectWhereImpl.mockResolvedValue([]); // no DB config rows
    clearAlertEnv();
    // Healthy environment
    process.env.DEV_ACCESS_CODE = "test-code";
    process.env.CLERK_SECRET_KEY = "sk_test_fake";
    // fetch returns 200 for Clerk API
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => "ok",
    } as Response);
  });

  it("exits 0 and makes no alert call when everything is configured", async () => {
    const exitSpy = mockProcessExit();

    await expect(main()).rejects.toThrow("process.exit(0)");

    expect(exitSpy).toHaveBeenCalledWith(0);
    // Only the Clerk connectivity check fetch, no alert fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain("clerk.com");
  });
});

describe("main() — no access code configured", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    selectWhereImpl.mockReset();
    selectWhereImpl.mockResolvedValue([]);
    clearAlertEnv();
    delete process.env.DEV_ACCESS_CODE;
    delete process.env.REVIEWER_ACCESS_CODE;
    process.env.CLERK_SECRET_KEY = "sk_test_fake";
    process.env.ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
  });

  it("exits 1 and fires an alert when no access code is set", async () => {
    const exitSpy = mockProcessExit();

    await expect(main()).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    // Alert should have been sent
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe("https://hooks.slack.com/test");
  });
});

describe("main() — no Clerk key", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    selectWhereImpl.mockReset();
    selectWhereImpl.mockResolvedValue([]);
    clearAlertEnv();
    process.env.DEV_ACCESS_CODE = "test-code";
    delete process.env.CLERK_SECRET_KEY;
    process.env.ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
  });

  it("exits 1 and fires an alert when CLERK_SECRET_KEY is absent", async () => {
    const exitSpy = mockProcessExit();

    await expect(main()).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("main() — Clerk API unreachable", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    selectWhereImpl.mockReset();
    selectWhereImpl.mockResolvedValue([]);
    clearAlertEnv();
    process.env.DEV_ACCESS_CODE = "test-code";
    process.env.CLERK_SECRET_KEY = "sk_test_fake";
    process.env.ALERT_SLACK_WEBHOOK_URL = "https://hooks.slack.com/test";
  });

  it("exits 1 when Clerk API returns non-OK", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        text: async () => "",
      } as Response)
      .mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => "",
      } as Response);

    const exitSpy = mockProcessExit();

    await expect(main()).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    // Clerk connectivity check must have fired
    const clerkCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).includes("clerk.com"),
    );
    expect(clerkCall).toBeDefined();
    // Slack alert must have fired
    const slackCall = fetchMock.mock.calls.find(([url]) =>
      (url as string).includes("hooks.slack.com"),
    );
    expect(slackCall).toBeDefined();
  });

  it("exits 1 and sends no alert channel call when no channel configured", async () => {
    clearAlertEnv();
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "",
    } as Response);

    const exitSpy = mockProcessExit();
    vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(main()).rejects.toThrow("process.exit(1)");

    expect(exitSpy).toHaveBeenCalledWith(1);
    // Only the Clerk check fetch — no alert channel configured
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
