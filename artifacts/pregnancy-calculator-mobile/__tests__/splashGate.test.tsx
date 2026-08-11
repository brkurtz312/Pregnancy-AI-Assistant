/**
 * splashGate.test.tsx
 *
 * Verifies the splash-screen safety timeout that guarantees the app always
 * reaches the sign-in screen within a bounded time, even if launch-time work
 * (font loading, an OTA-updated bundle misbehaving) stalls indefinitely.
 *
 * Note on OTA behaviour: the native expo-updates layer is configured with
 * `fallbackToCacheTimeout: 0` in app.json, so an OTA download can never block
 * launch — the cached bundle always boots immediately and updates apply on
 * the NEXT launch. The JS-side timeout tested here covers everything else
 * that gates first render.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import {
  SPLASH_SAFETY_TIMEOUT_MS,
  useSplashSafetyTimeout,
} from "@/lib/splash-gate";

function Probe({
  timeoutMs,
  onValue,
}: {
  timeoutMs?: number;
  onValue: (v: boolean) => void;
}) {
  const timedOut = useSplashSafetyTimeout(timeoutMs);
  onValue(timedOut);
  return null;
}

describe("useSplashSafetyTimeout", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("is false before the timeout elapses", () => {
    let value = true;
    act(() => {
      create(<Probe onValue={(v) => (value = v)} />);
    });
    expect(value).toBe(false);

    act(() => {
      jest.advanceTimersByTime(SPLASH_SAFETY_TIMEOUT_MS - 1);
    });
    expect(value).toBe(false);
  });

  it("flips to true once the timeout elapses (default timeout)", () => {
    let value = false;
    act(() => {
      create(<Probe onValue={(v) => (value = v)} />);
    });

    act(() => {
      jest.advanceTimersByTime(SPLASH_SAFETY_TIMEOUT_MS);
    });
    expect(value).toBe(true);
  });

  it("respects a custom timeout", () => {
    let value = false;
    act(() => {
      create(<Probe timeoutMs={100} onValue={(v) => (value = v)} />);
    });

    act(() => {
      jest.advanceTimersByTime(99);
    });
    expect(value).toBe(false);

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(value).toBe(true);
  });

  it("cleans up its timer on unmount (no state update after unmount)", () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    let tree: ReturnType<typeof create> | undefined;
    act(() => {
      tree = create(<Probe onValue={() => {}} />);
    });
    act(() => {
      tree?.unmount();
    });
    act(() => {
      jest.advanceTimersByTime(SPLASH_SAFETY_TIMEOUT_MS + 1000);
    });
    // React warns via console.error on setState-after-unmount; none expected.
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("keeps the splash timeout within a reasonable bound (<= 10s)", () => {
    expect(SPLASH_SAFETY_TIMEOUT_MS).toBeGreaterThan(0);
    expect(SPLASH_SAFETY_TIMEOUT_MS).toBeLessThanOrEqual(10000);
  });
});
