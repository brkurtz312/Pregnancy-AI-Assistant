/**
 * Unit tests for AuthTokenBridge — the mobile equivalent of the web's
 * SessionWatcher. Verifies that switching accounts on a shared device never
 * leaves stale cached data from the previous user in the React Query store
 * or in the AsyncStorage tool caches (journal, hospital bag, birth plan,
 * visit questions).
 *
 * Scenarios covered:
 *   User A signs in  → queryClient.invalidateQueries() is called
 *   User A signs out → queryClient.clear() is called (cache wiped)
 *                    → clearJournalCache / clearHospitalBagCache /
 *                       clearBirthPlanCache / clearVisitQuestionsCache called
 *   User B signs in  → queryClient.invalidateQueries() is called (fresh fetch)
 *
 * This mirrors session-switch-isolation.spec.ts on the web side.
 */

import React from "react";
import { act, create } from "react-test-renderer";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

jest.mock("@clerk/expo", () => ({
  useSession: jest.fn(),
}));

jest.mock("@workspace/api-client-react", () => ({
  setAuthTokenGetter: jest.fn(),
}));

jest.mock("@/lib/journal", () => ({
  clearJournalCache: jest.fn(async () => {}),
}));

jest.mock("@/lib/hospital-bag", () => ({
  clearHospitalBagCache: jest.fn(async () => {}),
}));

jest.mock("@/lib/birth-plan", () => ({
  clearBirthPlanCache: jest.fn(async () => {}),
}));

jest.mock("@/lib/visit-questions", () => ({
  clearVisitQuestionsCache: jest.fn(async () => {}),
}));

import { useSession } from "@clerk/expo";
import { setAuthTokenGetter } from "@workspace/api-client-react";
import { clearJournalCache } from "@/lib/journal";
import { clearHospitalBagCache } from "@/lib/hospital-bag";
import { clearBirthPlanCache } from "@/lib/birth-plan";
import { clearVisitQuestionsCache } from "@/lib/visit-questions";
import { AuthTokenBridge } from "../components/AuthTokenBridge";

const mockUseSession = useSession as jest.Mock;
const mockSetAuthTokenGetter = setAuthTokenGetter as jest.Mock;
const mockClearJournal = clearJournalCache as jest.Mock;
const mockClearHospitalBag = clearHospitalBagCache as jest.Mock;
const mockClearBirthPlan = clearBirthPlanCache as jest.Mock;
const mockClearVisitQuestions = clearVisitQuestionsCache as jest.Mock;

function makeSession(id: string) {
  return { getToken: jest.fn(async () => `token-${id}`) };
}

function renderBridge(queryClient: QueryClient, session: unknown) {
  mockUseSession.mockReturnValue({ session });
  let renderer!: ReturnType<typeof create>;
  act(() => {
    renderer = create(
      React.createElement(
        QueryClientProvider,
        { client: queryClient },
        React.createElement(AuthTokenBridge),
      ),
    );
  });
  return renderer;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("AuthTokenBridge — session-switch isolation", () => {
  it("registers setAuthTokenGetter on mount and clears it on unmount", async () => {
    const qc = new QueryClient();
    const renderer = renderBridge(qc, null);
    await act(async () => {});

    expect(mockSetAuthTokenGetter).toHaveBeenCalledTimes(1);
    expect(typeof mockSetAuthTokenGetter.mock.calls[0][0]).toBe("function");

    act(() => renderer.unmount());
    expect(mockSetAuthTokenGetter).toHaveBeenCalledWith(null);
  });

  it("does NOT call invalidateQueries or clear on initial mount with no session", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    renderBridge(qc, null);
    await act(async () => {});

    expect(invalidate).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("does NOT call invalidateQueries or clear on initial mount with an existing session", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    renderBridge(qc, makeSession("userA"));
    await act(async () => {});

    expect(invalidate).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("calls invalidateQueries (not clear) when transitioning null → session (sign-in)", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    const renderer = renderBridge(qc, null);
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: makeSession("userA") });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });

  it("calls clear (not invalidateQueries) when transitioning session → null (sign-out)", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    const renderer = renderBridge(qc, makeSession("userA"));
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: null });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();
  });

  it("clears on sign-out then invalidates on sign-in — account-switch isolation", async () => {
    const qc = new QueryClient();
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    // User A signs in from the start
    const renderer = renderBridge(qc, makeSession("userA"));
    await act(async () => {});

    // User A signs out
    mockUseSession.mockReturnValue({ session: null });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(clear).toHaveBeenCalledTimes(1);
    expect(invalidate).not.toHaveBeenCalled();

    // User B signs in
    mockUseSession.mockReturnValue({ session: makeSession("userB") });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1); // still only once, from sign-out
  });

  it("clears journal, hospital-bag, birth-plan, and visit-questions caches on sign-out", async () => {
    const qc = new QueryClient();

    const renderer = renderBridge(qc, makeSession("userA"));
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: null });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(mockClearJournal).toHaveBeenCalledTimes(1);
    expect(mockClearHospitalBag).toHaveBeenCalledTimes(1);
    expect(mockClearBirthPlan).toHaveBeenCalledTimes(1);
    expect(mockClearVisitQuestions).toHaveBeenCalledTimes(1);
  });

  it("does NOT clear tool caches on sign-in (only on sign-out)", async () => {
    const qc = new QueryClient();

    const renderer = renderBridge(qc, null);
    await act(async () => {});

    mockUseSession.mockReturnValue({ session: makeSession("userA") });
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(mockClearJournal).not.toHaveBeenCalled();
    expect(mockClearHospitalBag).not.toHaveBeenCalled();
    expect(mockClearBirthPlan).not.toHaveBeenCalled();
    expect(mockClearVisitQuestions).not.toHaveBeenCalled();
  });

  it("does not call invalidateQueries or clear when the same session re-renders without changing", async () => {
    const qc = new QueryClient();
    const session = makeSession("userA");
    const invalidate = jest.spyOn(qc, "invalidateQueries");
    const clear = jest.spyOn(qc, "clear");

    const renderer = renderBridge(qc, session);
    await act(async () => {});

    // Re-render with the same session object (e.g. parent re-renders)
    await act(async () => {
      renderer.update(
        React.createElement(
          QueryClientProvider,
          { client: qc },
          React.createElement(AuthTokenBridge),
        ),
      );
    });

    expect(invalidate).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });
});
