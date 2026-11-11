import { Platform } from "react-native";

import { toErrorCode, track } from "@/lib/analytics";

/**
 * track() is called from the purchase flow without await or try/catch, so it
 * must never throw and never leave a rejected promise behind — whatever the
 * network does.
 */

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("track()", () => {
  const originalFetch = global.fetch;
  const originalDomain = process.env.EXPO_PUBLIC_DOMAIN;
  const originalOS = Platform.OS;
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => {
    unhandled.push(reason);
  };

  beforeAll(() => {
    process.on("unhandledRejection", onUnhandled);
  });

  afterAll(() => {
    process.off("unhandledRejection", onUnhandled);
  });

  beforeEach(() => {
    unhandled.length = 0;
    process.env.EXPO_PUBLIC_DOMAIN = "api.example.test";
    Object.defineProperty(Platform, "OS", { value: "ios", writable: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalDomain === undefined) delete process.env.EXPO_PUBLIC_DOMAIN;
    else process.env.EXPO_PUBLIC_DOMAIN = originalDomain;
    Object.defineProperty(Platform, "OS", {
      value: originalOS,
      writable: true,
    });
  });

  it("posts the event to /api/events with nothing identifying in it", async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 204 });
    global.fetch = fetchMock as unknown as typeof fetch;

    track("paywall_viewed", { signedIn: true, source: "home" });
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.example.test/api/events");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(Object.keys(body).sort()).toEqual(
      ["appVersion", "event", "platform", "signedIn", "source"].sort(),
    );
    expect(body).toMatchObject({
      event: "paywall_viewed",
      source: "home",
      signedIn: true,
      platform: "ios",
    });
  });

  it("returns nothing, so there is nothing for a caller to await", () => {
    global.fetch = jest.fn().mockResolvedValue({}) as unknown as typeof fetch;
    expect(track("restore_tapped", { signedIn: false })).toBeUndefined();
  });

  it("does not throw when fetch rejects (network down)", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(
        new TypeError("Network request failed"),
      ) as unknown as typeof fetch;

    expect(() => track("purchase_started", { signedIn: true })).not.toThrow();
    await flush();
    expect(unhandled).toEqual([]);
  });

  it("does not throw when fetch throws synchronously", async () => {
    global.fetch = jest.fn(() => {
      throw new Error("boom");
    }) as unknown as typeof fetch;

    expect(() => track("purchase_completed", { signedIn: true })).not.toThrow();
    await flush();
    expect(unhandled).toEqual([]);
  });

  it("does not throw when fetch is missing entirely", () => {
    (global as { fetch?: unknown }).fetch = undefined;
    expect(() => track("ai_limit_reached", { signedIn: false })).not.toThrow();
  });

  it("drops the event silently with no API domain configured on native", async () => {
    delete process.env.EXPO_PUBLIC_DOMAIN;
    const fetchMock = jest.fn();
    global.fetch = fetchMock as unknown as typeof fetch;

    expect(() => track("restore_tapped", { signedIn: false })).not.toThrow();
    await flush();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw when given junk props", async () => {
    global.fetch = jest
      .fn()
      .mockRejectedValue(new Error("x")) as unknown as typeof fetch;
    expect(() =>
      track(
        "purchase_failed",
        null as unknown as { signedIn: boolean; errorCode: string },
      ),
    ).not.toThrow();
    await flush();
    expect(unhandled).toEqual([]);
  });
});

describe("toErrorCode()", () => {
  it("prefers RevenueCat's readable error code", () => {
    expect(
      toErrorCode({
        code: "1",
        userInfo: { readableErrorCode: "PURCHASE_CANCELLED" },
      }),
    ).toBe("PURCHASE_CANCELLED");
  });

  it("falls back to the older top-level readable code, then the numeric code", () => {
    expect(toErrorCode({ readableErrorCode: "NETWORK_ERROR" })).toBe(
      "NETWORK_ERROR",
    );
    expect(toErrorCode({ code: 35 })).toBe("35");
  });

  it("never passes a free-text message through", () => {
    expect(toErrorCode(new Error("card declined for jane@example.com"))).toBe(
      "unknown",
    );
    expect(toErrorCode("has spaces in it")).toBe("unknown");
    expect(toErrorCode(undefined)).toBe("unknown");
    expect(toErrorCode(null)).toBe("unknown");
  });
});
