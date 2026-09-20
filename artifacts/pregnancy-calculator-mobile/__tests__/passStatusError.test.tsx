/**
 * usePass error-resilience tests (mobile).
 *
 * Confirms that when /api/billing/pass-status returns a 5xx error during a
 * background refetch, usePass stays in a safe, non-broken state:
 *  - hasPass stays true when the user had a cached pass — no incorrect revocation.
 *  - hasPass stays false when no cache exists — safe neutral default, no crash.
 *  - No incorrect pass grant from a server error with empty cache.
 *  - isLoading does not get stuck as true when the query errors.
 */
import React from "react";
import { Text } from "react-native";
import { act, create } from "react-test-renderer";

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(() => ({ isSignedIn: true })),
}));

jest.mock("expo-web-browser", () => ({
  openBrowserAsync: jest.fn(),
}));

jest.mock("@tanstack/react-query", () => ({
  useQueryClient: jest.fn(() => ({
    invalidateQueries: jest.fn(),
  })),
}));

jest.mock("@workspace/api-client-react", () => ({
  useGetPassStatus: jest.fn(),
  useReconcileRevenuecat: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useRedeemCode: jest.fn(() => ({ mutateAsync: jest.fn(), isPending: false })),
  getGetPassStatusQueryKey: jest.fn(() => ["get-pass-status"]),
}));

import { useAuth } from "@clerk/expo";
import {
  useGetPassStatus,
  useReconcileRevenuecat,
  useRedeemCode,
} from "@workspace/api-client-react";
import { usePass } from "../hooks/usePass";

const mockUseGetPassStatus = useGetPassStatus as jest.MockedFunction<
  typeof useGetPassStatus
>;

function makePassStatusQuery(
  overrides: Partial<{
    data: { hasPass: boolean; freeUsed: number; freeLimit: number } | undefined;
    isLoading: boolean;
    isError: boolean;
    error: Error | null;
    refetch: () => Promise<unknown>;
  }> = {},
): ReturnType<typeof useGetPassStatus> {
  return {
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
    refetch: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useGetPassStatus>;
}

interface PassState {
  hasPass: boolean;
  freeUsed: number;
  freeLimit: number;
  freeRemaining: number;
  isLoading: boolean;
}

let capturedState: PassState | null = null;

function PassStateCapture() {
  const { hasPass, freeUsed, freeLimit, freeRemaining, isLoading } = usePass();
  capturedState = { hasPass, freeUsed, freeLimit, freeRemaining, isLoading };
  return <Text>{hasPass ? "pass" : "no-pass"}</Text>;
}

beforeEach(() => {
  capturedState = null;
  jest.clearAllMocks();
  (useAuth as jest.Mock).mockReturnValue({ isSignedIn: true });
  (useReconcileRevenuecat as jest.Mock).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
  (useRedeemCode as jest.Mock).mockReturnValue({
    mutateAsync: jest.fn(),
    isPending: false,
  });
});

describe("usePass (mobile) — pass-status endpoint error resilience", () => {
  it("renders without crashing when pass-status errors with no prior cache", () => {
    mockUseGetPassStatus.mockReturnValue(
      makePassStatusQuery({
        data: undefined,
        isError: true,
        error: new Error("500 Internal Server Error"),
      }),
    );

    act(() => {
      create(<PassStateCapture />);
    });

    expect(capturedState).not.toBeNull();
    expect(capturedState!.hasPass).toBe(false);
    expect(capturedState!.isLoading).toBe(false);
  });

  it("retains hasPass=true when a background refetch returns 500 (no incorrect revocation)", () => {
    // React Query keeps `data` from the last successful fetch even when a
    // subsequent background refetch fails. We simulate that combined state here.
    mockUseGetPassStatus.mockReturnValue(
      makePassStatusQuery({
        data: { hasPass: true, freeUsed: 1, freeLimit: 5 },
        isError: true,
        error: new Error("500 Internal Server Error"),
      }),
    );

    act(() => {
      create(<PassStateCapture />);
    });

    // The pass must not be revoked because of a transient server error.
    expect(capturedState!.hasPass).toBe(true);
  });

  it("does not incorrectly grant hasPass=true when no cache exists and the request errors", () => {
    mockUseGetPassStatus.mockReturnValue(
      makePassStatusQuery({
        data: undefined,
        isError: true,
        error: new Error("503 Service Unavailable"),
      }),
    );

    act(() => {
      create(<PassStateCapture />);
    });

    // A server error must never elevate a free user to pass-holder.
    expect(capturedState!.hasPass).toBe(false);
  });

  it("isLoading stays false when the query errors — no infinite spinner", () => {
    mockUseGetPassStatus.mockReturnValue(
      makePassStatusQuery({
        data: undefined,
        isLoading: false,
        isError: true,
        error: new Error("500"),
      }),
    );

    act(() => {
      create(<PassStateCapture />);
    });

    expect(capturedState!.isLoading).toBe(false);
  });

  it("freeLimit and freeUsed fall back to safe defaults when the query errors with no cache", () => {
    mockUseGetPassStatus.mockReturnValue(
      makePassStatusQuery({
        data: undefined,
        isError: true,
        error: new Error("500"),
      }),
    );

    act(() => {
      create(<PassStateCapture />);
    });

    // Default quota — user is not locked out of the free tier by the error.
    expect(capturedState!.freeLimit).toBe(5);
    expect(capturedState!.freeUsed).toBe(0);
    expect(capturedState!.freeRemaining).toBe(5);
  });

  it("retains stale freeUsed/freeLimit values when a background refetch returns 500", () => {
    mockUseGetPassStatus.mockReturnValue(
      makePassStatusQuery({
        data: { hasPass: true, freeUsed: 3, freeLimit: 5 },
        isError: true,
        error: new Error("500"),
      }),
    );

    act(() => {
      create(<PassStateCapture />);
    });

    expect(capturedState!.freeUsed).toBe(3);
    expect(capturedState!.freeLimit).toBe(5);
    expect(capturedState!.freeRemaining).toBe(2);
  });
});
