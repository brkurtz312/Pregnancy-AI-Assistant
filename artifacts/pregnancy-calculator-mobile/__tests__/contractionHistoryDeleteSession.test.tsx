/**
 * contractionHistoryDeleteSession.test.tsx
 *
 * Confirms that after the user confirms "Delete Session" in the alert, the
 * deleted session card disappears from the list immediately and the remaining
 * session is still shown — without navigating away from the screen.
 *
 * Two assertions are verified:
 *
 *   A) Tapping the trash icon shows an Alert with a "Delete" button; confirming
 *      it calls deleteMutation.mutateAsync with the correct sessionDate.
 *
 *   B) After the mutation resolves and the hook returns the updated list,
 *      the deleted session card is gone while the other session card remains.
 */

import React from "react";
import { act, create, type ReactTestInstance } from "react-test-renderer";
import { Alert } from "react-native";

// ── Silence Reanimated ────────────────────────────────────────────────────────
jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// ── Clerk ─────────────────────────────────────────────────────────────────────
jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(() => ({
    isSignedIn: true,
    userId: "user-delete-session-test",
    getToken: jest.fn().mockResolvedValue("token-delete-session"),
  })),
}));

// ── Icons ─────────────────────────────────────────────────────────────────────
jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

// ── Safe area ─────────────────────────────────────────────────────────────────
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// ── Colors ────────────────────────────────────────────────────────────────────
jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#f9f9f9",
    border: "#eee",
    primary: "#ff69b4",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
    destructive: "#ef4444",
    accent: "#f0f0f0",
  }),
}));

// ── Navigation ────────────────────────────────────────────────────────────────
jest.mock("expo-router", () => ({
  useRouter: jest.fn(() => ({ back: jest.fn(), push: jest.fn() })),
  useFocusEffect: jest.fn(),
}));

// ── API client ────────────────────────────────────────────────────────────────

const mockRefetch = jest.fn().mockResolvedValue(undefined);
const mockMutateAsync = jest.fn().mockResolvedValue(undefined);
const mockUseListContractions = jest.fn();
const mockUseListKickSessions = jest.fn();

jest.mock("@workspace/api-client-react", () => ({
  useListContractions: (...args: unknown[]) => mockUseListContractions(...args),
  useListKickSessions: (...args: unknown[]) => mockUseListKickSessions(...args),
  useDeleteContractionSession: jest.fn(() => ({
    mutateAsync: mockMutateAsync,
    isPending: false,
  })),
  useDeleteKickSession: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
  useUpdateKickSession: jest.fn(() => ({
    mutateAsync: jest.fn().mockResolvedValue(undefined),
    isPending: false,
  })),
}));

// ── Subject import (after all mocks) ─────────────────────────────────────────
import SessionHistoryScreen from "../app/session-history";

// ── Tree-walking helpers ──────────────────────────────────────────────────────

function findAll(
  root: ReactTestInstance,
  predicate: (n: ReactTestInstance) => boolean,
): ReactTestInstance[] {
  const results: ReactTestInstance[] = [];
  const walk = (node: ReactTestInstance) => {
    if (predicate(node)) results.push(node);
    node.children.forEach((child) => {
      if (typeof child !== "string") walk(child);
    });
  };
  walk(root);
  return results;
}

function findByTestId(
  root: ReactTestInstance,
  testID: string,
): ReactTestInstance | undefined {
  return findAll(root, (n) => n.props.testID === testID)[0];
}

function allLeafText(root: ReactTestInstance): string[] {
  const texts: string[] = [];
  const walk = (node: ReactTestInstance) => {
    node.children.forEach((child) => {
      if (typeof child === "string") texts.push(child);
      else walk(child);
    });
  };
  walk(root);
  return texts;
}

/** Find nodes whose accessibilityLabel matches the given label. */
function findByAccessibilityLabel(
  root: ReactTestInstance,
  label: string,
): ReactTestInstance[] {
  return findAll(root, (n) => n.props.accessibilityLabel === label);
}

// ── Sample data — two different session dates ─────────────────────────────────

const SESSION_A_DATE = "2026-08-13";
const SESSION_B_DATE = "2026-08-14";

const SESSION_A_CONTRACTIONS = [
  {
    id: 1,
    sessionDate: SESSION_A_DATE,
    startedAt: "2026-08-13T09:00:00.000Z",
    durationSeconds: 55,
    intervalSeconds: null,
    notes: null,
    createdAt: "2026-08-13T09:00:00.000Z",
    updatedAt: "2026-08-13T09:00:00.000Z",
  },
  {
    id: 2,
    sessionDate: SESSION_A_DATE,
    startedAt: "2026-08-13T09:10:00.000Z",
    durationSeconds: 60,
    intervalSeconds: 600,
    notes: null,
    createdAt: "2026-08-13T09:10:00.000Z",
    updatedAt: "2026-08-13T09:10:00.000Z",
  },
];

const SESSION_B_CONTRACTIONS = [
  {
    id: 3,
    sessionDate: SESSION_B_DATE,
    startedAt: "2026-08-14T10:05:00.000Z",
    durationSeconds: 62,
    intervalSeconds: null,
    notes: null,
    createdAt: "2026-08-14T10:05:00.000Z",
    updatedAt: "2026-08-14T10:05:00.000Z",
  },
];

const ALL_CONTRACTIONS = [...SESSION_B_CONTRACTIONS, ...SESSION_A_CONTRACTIONS];

// ── Setup / teardown ──────────────────────────────────────────────────────────

beforeEach(() => {
  mockRefetch.mockReset().mockResolvedValue(undefined);
  mockMutateAsync.mockReset().mockResolvedValue(undefined);

  // KickHistoryTab is rendered first; stub it to avoid errors.
  mockUseListKickSessions.mockReturnValue({
    data: { items: [] },
    isFetching: false,
    refetch: jest.fn(),
  });
});

afterEach(() => {
  jest.clearAllMocks();
});

// ── Helper — render screen and switch to Contractions tab ─────────────────────

async function renderContractionTab(renderer: { root: ReactTestInstance }) {
  const tabBtn = findByTestId(renderer.root, "tab-btn-contractions");
  expect(tabBtn).toBeDefined();
  await act(async () => {
    tabBtn!.props.onPress();
  });
}

// ── Helper — capture the Alert.alert call and invoke a button by its text ─────

async function confirmAlert(buttonText: string) {
  const alertSpy = jest.spyOn(Alert, "alert");
  // The spy was already called; grab the most recent call's buttons array.
  const calls = alertSpy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  const lastCall = calls[calls.length - 1];
  const buttons = lastCall[2] as Array<{
    text: string;
    onPress?: () => void | Promise<void>;
  }>;
  const btn = buttons?.find((b) => b.text === buttonText);
  expect(btn).toBeDefined();
  await act(async () => {
    await btn!.onPress?.();
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// A) Tapping trash → Alert → confirming → calls mutateAsync with correct date
// ─────────────────────────────────────────────────────────────────────────────

describe("ContractionHistoryTab — delete session alert", () => {
  it("shows a Delete alert when the trash icon is tapped", async () => {
    mockUseListContractions.mockReturnValue({
      data: { items: ALL_CONTRACTIONS },
      isFetching: false,
      refetch: mockRefetch,
    });

    const alertSpy = jest.spyOn(Alert, "alert");

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    // Find the first "Delete session" trash button (for SESSION_B, the newest).
    const trashBtns = findByAccessibilityLabel(renderer.root, "Delete session");
    expect(trashBtns.length).toBeGreaterThan(0);

    await act(async () => {
      trashBtns[0].props.onPress();
    });

    // Alert.alert must have been called with the "Delete Session" title.
    expect(alertSpy).toHaveBeenCalledWith(
      "Delete Session",
      expect.any(String),
      expect.arrayContaining([
        expect.objectContaining({ text: "Delete", style: "destructive" }),
        expect.objectContaining({ text: "Cancel", style: "cancel" }),
      ]),
    );
  });

  it("calls deleteMutation.mutateAsync with the session date when Delete is confirmed", async () => {
    mockUseListContractions.mockReturnValue({
      data: { items: ALL_CONTRACTIONS },
      isFetching: false,
      refetch: mockRefetch,
    });

    jest.spyOn(Alert, "alert");

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    // Tap the trash icon on the first group card (SESSION_B — newest first).
    const trashBtns = findByAccessibilityLabel(renderer.root, "Delete session");
    expect(trashBtns.length).toBeGreaterThan(0);

    await act(async () => {
      trashBtns[0].props.onPress();
    });

    // Confirm the delete alert.
    await confirmAlert("Delete");

    // mutateAsync must have been called with the correct session date.
    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({ date: SESSION_B_DATE });
  });

  it("calls refetch() after the mutation resolves", async () => {
    mockUseListContractions.mockReturnValue({
      data: { items: ALL_CONTRACTIONS },
      isFetching: false,
      refetch: mockRefetch,
    });

    jest.spyOn(Alert, "alert");

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    const trashBtns = findByAccessibilityLabel(renderer.root, "Delete session");

    await act(async () => {
      trashBtns[0].props.onPress();
    });

    await confirmAlert("Delete");

    // refetch must have been called after the mutation settled.
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// B) Deleted session card disappears; surviving session card remains
// ─────────────────────────────────────────────────────────────────────────────

describe("ContractionHistoryTab — session disappears after delete, other session stays", () => {
  it("removes the deleted session card and keeps the surviving session card", async () => {
    // Phase 1: both sessions are visible.
    mockUseListContractions.mockReturnValue({
      data: { items: ALL_CONTRACTIONS },
      isFetching: false,
      refetch: mockRefetch,
    });

    jest.spyOn(Alert, "alert");

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    // Both session date groups must be present initially.
    const textsBefore = allLeafText(renderer.root);
    const hasSessionA = textsBefore.some((t) =>
      t.includes(
        new Date(SESSION_A_DATE + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      ),
    );
    const hasSessionB = textsBefore.some((t) =>
      t.includes(
        new Date(SESSION_B_DATE + "T00:00:00").toLocaleDateString(undefined, {
          weekday: "short",
          month: "short",
          day: "numeric",
          year: "numeric",
        }),
      ),
    );
    expect(hasSessionA).toBe(true);
    expect(hasSessionB).toBe(true);

    // Phase 2: tap trash on the first card (SESSION_B, newest-first order).
    const trashBtns = findByAccessibilityLabel(renderer.root, "Delete session");
    expect(trashBtns.length).toBeGreaterThan(0);

    await act(async () => {
      trashBtns[0].props.onPress();
    });

    // Confirm the delete.
    await confirmAlert("Delete");

    // Phase 3: simulate React Query updating the hook after refetch completes —
    // only SESSION_A contractions remain.
    mockUseListContractions.mockReturnValue({
      data: { items: SESSION_A_CONTRACTIONS },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      renderer.update(React.createElement(SessionHistoryScreen));
    });

    // SESSION_B card must be gone.
    const textsAfter = allLeafText(renderer.root);
    const sessionBDateLabel = new Date(
      SESSION_B_DATE + "T00:00:00",
    ).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const sessionADateLabel = new Date(
      SESSION_A_DATE + "T00:00:00",
    ).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    expect(textsAfter.some((t) => t.includes(sessionBDateLabel))).toBe(false);

    // SESSION_A card must still be present.
    expect(textsAfter.some((t) => t.includes(sessionADateLabel))).toBe(true);
  });

  it("does not navigate away after deletion — the screen remains mounted", async () => {
    mockUseListContractions.mockReturnValue({
      data: { items: ALL_CONTRACTIONS },
      isFetching: false,
      refetch: mockRefetch,
    });

    const { useRouter } = require("expo-router") as {
      useRouter: jest.Mock;
    };
    const mockBack = jest.fn();
    useRouter.mockReturnValue({ back: mockBack, push: jest.fn() });

    jest.spyOn(Alert, "alert");

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    const trashBtns = findByAccessibilityLabel(renderer.root, "Delete session");

    await act(async () => {
      trashBtns[0].props.onPress();
    });

    await confirmAlert("Delete");

    // router.back() must NOT have been called — deletion stays on the screen.
    expect(mockBack).not.toHaveBeenCalled();

    // The tab bar must still be present — the screen is still mounted.
    expect(findByTestId(renderer.root, "tab-btn-contractions")).toBeDefined();
  });

  it("does not remove the surviving session when only one session is deleted", async () => {
    // Start with two sessions.
    mockUseListContractions.mockReturnValue({
      data: { items: ALL_CONTRACTIONS },
      isFetching: false,
      refetch: mockRefetch,
    });

    jest.spyOn(Alert, "alert");

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    // Delete the first session (SESSION_B).
    const trashBtns = findByAccessibilityLabel(renderer.root, "Delete session");

    await act(async () => {
      trashBtns[0].props.onPress();
    });

    await confirmAlert("Delete");

    // React Query now returns only SESSION_A.
    mockUseListContractions.mockReturnValue({
      data: { items: SESSION_A_CONTRACTIONS },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      renderer.update(React.createElement(SessionHistoryScreen));
    });

    // SESSION_B date label must be gone.
    const sessionBDateLabel = new Date(
      SESSION_B_DATE + "T00:00:00",
    ).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const sessionADateLabel = new Date(
      SESSION_A_DATE + "T00:00:00",
    ).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    const leafTexts = allLeafText(renderer.root);
    expect(leafTexts.some((t) => t.includes(sessionBDateLabel))).toBe(false);

    // SESSION_A date label must still be present.
    expect(leafTexts.some((t) => t.includes(sessionADateLabel))).toBe(true);

    // Empty state must not be shown — one session is still present.
    expect(
      findByTestId(renderer.root, "contraction-history-empty"),
    ).toBeUndefined();
  });

  it("shows the empty state when the last session is deleted", async () => {
    // Start with only SESSION_B.
    mockUseListContractions.mockReturnValue({
      data: { items: SESSION_B_CONTRACTIONS },
      isFetching: false,
      refetch: mockRefetch,
    });

    jest.spyOn(Alert, "alert");

    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(SessionHistoryScreen));
    });

    await renderContractionTab(renderer);

    // Verify the session card is visible before deletion.
    const sessionBDateLabel = new Date(
      SESSION_B_DATE + "T00:00:00",
    ).toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    expect(
      allLeafText(renderer.root).some((t) => t.includes(sessionBDateLabel)),
    ).toBe(true);

    const trashBtns = findByAccessibilityLabel(renderer.root, "Delete session");
    expect(trashBtns.length).toBeGreaterThan(0);

    await act(async () => {
      trashBtns[0].props.onPress();
    });

    await confirmAlert("Delete");

    // Simulate React Query returning an empty list after the delete.
    mockUseListContractions.mockReturnValue({
      data: { items: [] },
      isFetching: false,
      refetch: mockRefetch,
    });

    await act(async () => {
      renderer.update(React.createElement(SessionHistoryScreen));
    });

    // The empty state must now be shown.
    expect(
      findByTestId(renderer.root, "contraction-history-empty"),
    ).toBeDefined();
    const leafTexts = allLeafText(renderer.root);
    expect(leafTexts.some((t) => t.includes("No sessions yet"))).toBe(true);
  });
});
