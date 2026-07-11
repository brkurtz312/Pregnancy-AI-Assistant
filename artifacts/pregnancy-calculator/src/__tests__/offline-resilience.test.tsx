/**
 * Offline resilience tests for HospitalBag, BirthPlan, and Journal.
 *
 * Covers:
 * - A failed API write shows a destructive toast error
 * - Data is saved to localStorage (local fallback) when the API is unreachable
 * - The pending sync flag is set in localStorage
 * - Dispatching the "online" event drains the pending sync queue and calls the
 *   API again so data is eventually delivered to the server
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type MockedFunction,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import { useUser, useAuth } from "@clerk/react";
import { HospitalBag } from "@/components/tools/HospitalBag";
import { BirthPlan } from "@/components/tools/BirthPlan";
import { Journal } from "@/components/journal/Journal";
import {
  apiLoadHospitalBag,
  apiSaveHospitalBag,
  apiLoadBirthPlanAnswers,
  apiSaveBirthPlanAnswers,
  apiLoadJournalEntries,
  apiUpsertJournalEntry,
} from "@/lib/sync-api";
import { toast } from "@/hooks/use-toast";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@clerk/react", () => ({
  useUser: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/lib/sync-api", () => ({
  apiLoadHospitalBag: vi.fn(),
  apiSaveHospitalBag: vi.fn(),
  apiDeleteHospitalBag: vi.fn(),
  apiLoadBirthPlanAnswers: vi.fn(),
  apiSaveBirthPlanAnswers: vi.fn(),
  apiDeleteBirthPlanAnswers: vi.fn(),
  apiLoadJournalEntries: vi.fn(),
  apiUpsertJournalEntry: vi.fn(),
  apiDeleteJournalEntry: vi.fn(),
}));

vi.mock("@/hooks/use-toast", () => ({
  toast: vi.fn(),
  useToast: vi.fn(() => ({ toast: vi.fn(), toasts: [], dismiss: vi.fn() })),
}));

// ─── Typed mock helpers ───────────────────────────────────────────────────────

const mockUseUser = useUser as MockedFunction<typeof useUser>;
const mockUseAuth = useAuth as MockedFunction<typeof useAuth>;

const mockApiLoadHospitalBag = apiLoadHospitalBag as MockedFunction<
  typeof apiLoadHospitalBag
>;
const mockApiSaveHospitalBag = apiSaveHospitalBag as MockedFunction<
  typeof apiSaveHospitalBag
>;
const mockApiLoadBirthPlanAnswers = apiLoadBirthPlanAnswers as MockedFunction<
  typeof apiLoadBirthPlanAnswers
>;
const mockApiSaveBirthPlanAnswers = apiSaveBirthPlanAnswers as MockedFunction<
  typeof apiSaveBirthPlanAnswers
>;
const mockApiLoadJournalEntries = apiLoadJournalEntries as MockedFunction<
  typeof apiLoadJournalEntries
>;
const mockApiUpsertJournalEntry = apiUpsertJournalEntry as MockedFunction<
  typeof apiUpsertJournalEntry
>;
const mockToast = toast as MockedFunction<typeof toast>;

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function setupSignedInAuth(userId = "user_test_offline") {
  mockUseUser.mockReturnValue({
    isSignedIn: true,
    isLoaded: true,
    user: { id: userId } as ReturnType<typeof useUser>["user"] & {},
  } as ReturnType<typeof useUser>);

  mockUseAuth.mockReturnValue({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isLoaded: true,
    isSignedIn: true,
  } as unknown as ReturnType<typeof useAuth>);
}

// ─── Shared setup ─────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// ─── HospitalBag ──────────────────────────────────────────────────────────────

describe("HospitalBag — offline resilience", () => {
  const serverCategories = [
    {
      id: "paperwork",
      title: "Paperwork & Essentials",
      items: [
        {
          id: "item-id",
          label: "Photo ID and insurance card",
          checked: false,
          custom: false,
        },
      ],
    },
  ];

  it("shows a toast error and saves locally when the API write fails", async () => {
    setupSignedInAuth();

    mockApiLoadHospitalBag.mockResolvedValue(serverCategories);
    mockApiSaveHospitalBag.mockRejectedValue(new Error("Network error"));

    render(<HospitalBag />);

    // Wait for categories to load and render
    const checkbox = await screen.findByRole("checkbox", {
      name: /Photo ID and insurance card/i,
    });

    // Trigger a save by toggling a checkbox
    await act(async () => {
      fireEvent.click(checkbox);
    });

    // Toast should fire with a destructive variant
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: expect.stringMatching(/saved locally/i),
        }),
      );
    });

    // Data must be persisted in localStorage
    const stored = localStorage.getItem("pregnancy_hospital_bag_v1");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);

    // Pending flag must be set
    expect(localStorage.getItem("syncPending:hospitalBag")).toBe("1");
  });

  it("retries the API write when the browser comes back online", async () => {
    setupSignedInAuth();

    mockApiLoadHospitalBag.mockResolvedValue(serverCategories);
    mockApiSaveHospitalBag.mockRejectedValue(new Error("Network error"));

    render(<HospitalBag />);

    const checkbox = await screen.findByRole("checkbox", {
      name: /Photo ID and insurance card/i,
    });

    await act(async () => {
      fireEvent.click(checkbox);
    });

    // Wait for the pending flag to be set
    await waitFor(() => {
      expect(localStorage.getItem("syncPending:hospitalBag")).toBe("1");
    });

    const saveCallsAfterOffline = mockApiSaveHospitalBag.mock.calls.length;

    // Simulate the browser coming back online — make the retry succeed
    mockApiSaveHospitalBag.mockResolvedValue(undefined);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // API must have been called again for the retry
    await waitFor(() => {
      expect(mockApiSaveHospitalBag.mock.calls.length).toBeGreaterThan(
        saveCallsAfterOffline,
      );
    });

    // After a successful flush the pending flag must be cleared
    await waitFor(() => {
      expect(localStorage.getItem("syncPending:hospitalBag")).toBeNull();
    });
  });
});

// ─── BirthPlan ────────────────────────────────────────────────────────────────

describe("BirthPlan — offline resilience", () => {
  it("shows a toast error and saves locally when the API write fails", async () => {
    setupSignedInAuth();

    // Return null so the component initialises with local (empty) state —
    // no migration save is triggered when local data is also empty.
    mockApiLoadBirthPlanAnswers.mockResolvedValue(null);
    mockApiSaveBirthPlanAnswers.mockRejectedValue(new Error("Network error"));

    render(<BirthPlan />);

    // BirthPlan renders text inputs for its fields
    const textboxes = await screen.findAllByRole("textbox");
    expect(textboxes.length).toBeGreaterThan(0);
    const firstTextbox = textboxes[0];

    await act(async () => {
      fireEvent.change(firstTextbox, { target: { value: "Test value" } });
    });

    // Toast should fire with a destructive variant
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: expect.stringMatching(/saved locally/i),
        }),
      );
    });

    // Data must be persisted in localStorage
    const stored = localStorage.getItem("pregnancy_birth_plan_v1");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(typeof parsed).toBe("object");

    // Pending flag must be set
    expect(localStorage.getItem("syncPending:birthPlan")).toBe("1");
  });

  it("retries the API write when the browser comes back online", async () => {
    setupSignedInAuth();

    mockApiLoadBirthPlanAnswers.mockResolvedValue(null);
    mockApiSaveBirthPlanAnswers.mockRejectedValue(new Error("Network error"));

    render(<BirthPlan />);

    const textboxes = await screen.findAllByRole("textbox");
    const firstTextbox = textboxes[0];

    await act(async () => {
      fireEvent.change(firstTextbox, { target: { value: "Test value" } });
    });

    // Wait for the pending flag
    await waitFor(() => {
      expect(localStorage.getItem("syncPending:birthPlan")).toBe("1");
    });

    const saveCallsAfterOffline = mockApiSaveBirthPlanAnswers.mock.calls.length;

    // Simulate reconnection — make the retry succeed
    mockApiSaveBirthPlanAnswers.mockResolvedValue(undefined);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // API must have been called again for the retry
    await waitFor(() => {
      expect(mockApiSaveBirthPlanAnswers.mock.calls.length).toBeGreaterThan(
        saveCallsAfterOffline,
      );
    });

    // After a successful flush the pending flag must be cleared
    await waitFor(() => {
      expect(localStorage.getItem("syncPending:birthPlan")).toBeNull();
    });
  });
});

// ─── Journal ──────────────────────────────────────────────────────────────────

describe("Journal — offline resilience", () => {
  it("shows a toast error and saves locally when the API write fails", async () => {
    setupSignedInAuth();

    mockApiLoadJournalEntries.mockResolvedValue([]);
    mockApiUpsertJournalEntry.mockRejectedValue(new Error("Network error"));

    render(<Journal />);

    // Click "New Entry" to open the entry form
    const newEntryButton = await screen.findByRole("button", {
      name: /new entry/i,
    });
    fireEvent.click(newEntryButton);

    // Type something in the journal textarea
    const textarea = screen.getByPlaceholderText(
      /Write freely — this is your private space/i,
    );
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: "Feeling great today." },
      });
    });

    // Save the entry
    const saveButton = screen.getByRole("button", { name: /save entry/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    // Toast should fire with a destructive variant
    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          description: expect.stringMatching(/saved locally/i),
        }),
      );
    });

    // Entry must be persisted in localStorage
    const stored = localStorage.getItem("pregnancy_journal_entries_v1");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThan(0);
    expect(parsed[0].text).toBe("Feeling great today.");

    // A pending ID must be recorded
    const pendingRaw = localStorage.getItem("syncPending:journalEntries");
    expect(pendingRaw).not.toBeNull();
    expect(pendingRaw!.length).toBeGreaterThan(0);
  });

  it("retries the API write when the browser comes back online", async () => {
    setupSignedInAuth();

    mockApiLoadJournalEntries.mockResolvedValue([]);
    mockApiUpsertJournalEntry.mockRejectedValue(new Error("Network error"));

    render(<Journal />);

    const newEntryButton = await screen.findByRole("button", {
      name: /new entry/i,
    });
    fireEvent.click(newEntryButton);

    const textarea = screen.getByPlaceholderText(
      /Write freely — this is your private space/i,
    );
    await act(async () => {
      fireEvent.change(textarea, {
        target: { value: "Offline entry for retry test." },
      });
    });

    const saveButton = screen.getByRole("button", { name: /save entry/i });
    await act(async () => {
      fireEvent.click(saveButton);
    });

    // Wait for the pending entry to be recorded
    await waitFor(() => {
      expect(localStorage.getItem("syncPending:journalEntries")).not.toBeNull();
    });

    const upsertCallsAfterOffline = mockApiUpsertJournalEntry.mock.calls.length;

    // Simulate reconnection — retry should now succeed
    mockApiUpsertJournalEntry.mockResolvedValue({
      id: "server-uuid-123",
      text: "Offline entry for retry test.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    mockApiLoadJournalEntries.mockResolvedValue([
      {
        id: "server-uuid-123",
        text: "Offline entry for retry test.",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // API must have been called again for the pending entry
    await waitFor(() => {
      expect(mockApiUpsertJournalEntry.mock.calls.length).toBeGreaterThan(
        upsertCallsAfterOffline,
      );
    });

    // After a successful flush the pending queue must be empty
    await waitFor(() => {
      expect(localStorage.getItem("syncPending:journalEntries")).toBeNull();
    });
  });
});
