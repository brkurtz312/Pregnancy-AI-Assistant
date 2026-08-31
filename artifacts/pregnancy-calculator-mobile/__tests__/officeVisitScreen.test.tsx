/**
 * Office Visit screen — render smoke tests
 *
 * Verifies that:
 *  1. The screen renders without throwing when the user is signed in.
 *  2. The "Enter Office Mode" mode-entry button is present.
 *  3. The sign-in gate is shown (and mode button absent) when the user is
 *     signed out.
 *
 * All API hooks, native modules, and async-storage calls are mocked so the
 * test is fast and hermetic.
 */

import React from "react";
import { act, create } from "react-test-renderer";

jest.mock("react-native-reanimated", () =>
  require("react-native-reanimated/mock"),
);

// The screen reads auth state through useAppAuth, which calls Clerk's useAuth.
// Both hooks share one mock so the existing mockUseUser.mockReturnValue calls
// continue to express "the component sees this signed-in state".
jest.mock("@clerk/expo", () => {
  const shared = jest.fn();
  return { useUser: shared, useAuth: shared };
});

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
}));

jest.mock("expo-haptics", () => ({
  impactAsync: jest.fn(),
  ImpactFeedbackStyle: { Light: "Light" },
}));

jest.mock("expo-print", () => ({
  printToFileAsync: jest.fn(),
}));

jest.mock("@expo/vector-icons", () => ({
  Ionicons: "Ionicons",
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

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
  }),
}));

jest.mock("@workspace/api-client-react", () => ({
  useGetProfile: jest.fn(() => ({ data: undefined })),
  getGetProfileQueryKey: jest.fn(() => ["profile"]),
  useListPrenatalVisits: jest.fn(() => ({
    data: undefined,
    isLoading: false,
    refetch: jest.fn(),
  })),
  getListPrenatalVisitsQueryKey: jest.fn(() => ["prenatal-visits"]),
  useCreatePrenatalVisit: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useUpdatePrenatalVisit: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useDeletePrenatalVisit: jest.fn(() => ({
    mutateAsync: jest.fn(),
    isPending: false,
  })),
  useListSymptoms: jest.fn(() => ({ data: undefined })),
  getListSymptomsQueryKey: jest.fn(() => ["symptoms"]),
  useListKickSessions: jest.fn(() => ({ data: undefined })),
  getListKickSessionsQueryKey: jest.fn(() => ["kick-sessions"]),
  useListContractions: jest.fn(() => ({ data: undefined })),
  getListContractionsQueryKey: jest.fn(() => ["contractions"]),
}));

jest.mock("@/lib/visit-questions", () => ({
  loadQuestions: jest.fn(async () => []),
  saveQuestions: jest.fn(async () => {}),
  DEFAULT_QUESTIONS: [],
  QUESTIONS_STORAGE_KEY: "@visit_prep_questions_v2",
  getSelectedQuestions: jest.fn(() => []),
}));

jest.mock("@/lib/appointment-reminders", () => ({
  scheduleAppointmentReminder: jest.fn(async () => {}),
  cancelAppointmentReminder: jest.fn(async () => {}),
  cancelAllAppointmentReminders: jest.fn(async () => {}),
  requestNotificationPermission: jest.fn(async () => false),
}));

jest.mock("@/lib/pregnancy-math", () => ({
  getGestationalAgeAtDate: jest.fn(() => ({ weeks: 20, days: 0 })),
}));

jest.mock("@/constants/prenatal-visit-expectations", () => ({
  getVisitExpectation: jest.fn(() => ({ label: "Standard checkup" })),
}));

import { useUser } from "@clerk/expo";

const mockUseUser = useUser as jest.Mock;

function setSignedIn() {
  mockUseUser.mockReturnValue({
    isSignedIn: true,
    user: { id: "user-test" },
  });
}

function setSignedOut() {
  mockUseUser.mockReturnValue({
    isSignedIn: false,
    user: null,
  });
}

import OfficeVisitScreen from "../app/office-visit";

describe("Office Visit screen", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("renders without throwing when signed in", async () => {
    setSignedIn();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(OfficeVisitScreen));
    });
    expect(renderer.toJSON()).not.toBeNull();
  });

  it("renders the 'Enter Office Mode' mode-entry button when signed in", async () => {
    setSignedIn();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(OfficeVisitScreen));
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Enter Office Mode");
  });

  it("shows the sign-in gate and omits the mode button when signed out", async () => {
    setSignedOut();
    let renderer!: ReturnType<typeof create>;
    await act(async () => {
      renderer = create(React.createElement(OfficeVisitScreen));
    });
    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Sign in to use Office Visits");
    expect(json).not.toContain("Enter Office Mode");
  });
});
