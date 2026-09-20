/**
 * Unit tests for the Visit Notes Scribe component.
 *
 * Covers:
 * - Unauthenticated users see a sign-in prompt, not a broken state.
 * - SCRIBE_LIMIT_REACHED error shows the upgrade message + CTA button.
 * - SCRIBE_LIMIT_REACHED with hasPass=true never shows the upgrade CTA (page-reload regression).
 * - The transcript textarea is editable before generating a summary.
 * - Browsers without SpeechRecognition see the Chrome/Edge guidance message.
 */
import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  type MockedFunction,
} from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useUser, useAuth } from "@clerk/react";
import { usePass } from "@/hooks/use-pass";
import { Scribe } from "@/components/tools/Scribe";
import { APP_STORE_URL } from "@/lib/app-store";

vi.mock("@clerk/react", () => ({
  useUser: vi.fn(),
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/use-pass", () => ({
  usePass: vi.fn(),
}));

const mockUseUser = useUser as MockedFunction<typeof useUser>;
const mockUseAuth = useAuth as MockedFunction<typeof useAuth>;
const mockUsePass = usePass as MockedFunction<typeof usePass>;

function defaultPassValue(): ReturnType<typeof usePass> {
  return {
    isSignedIn: true,
    hasPass: false,
    freeUsed: 0,
    freeLimit: 5,
    freeRemaining: 5,
    isLoading: false,
    redeemCode: vi.fn(),
    isRedeeming: false,
    refresh: vi.fn(),
    justPurchased: false,
    dismissJustPurchased: vi.fn(),
  };
}

function signedInUser() {
  mockUseUser.mockReturnValue({
    isSignedIn: true,
    isLoaded: true,
    user: { id: "user_test" } as ReturnType<typeof useUser>["user"] & {},
  } as ReturnType<typeof useUser>);

  mockUseAuth.mockReturnValue({
    getToken: vi.fn().mockResolvedValue("test-token"),
    isLoaded: true,
    isSignedIn: true,
  } as unknown as ReturnType<typeof useAuth>);
}

function signedOutUser() {
  mockUseUser.mockReturnValue({
    isSignedIn: false,
    isLoaded: true,
    user: null,
  } as ReturnType<typeof useUser>);

  mockUseAuth.mockReturnValue({
    getToken: vi.fn().mockResolvedValue(null),
    isLoaded: true,
    isSignedIn: false,
  } as unknown as ReturnType<typeof useAuth>);
}

interface IFakeSpeechResultEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

type FakeRecognitionInstance = {
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onresult: ((e: IFakeSpeechResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};

const recognitionInstances: FakeRecognitionInstance[] = [];

function withSpeechRecognition() {
  recognitionInstances.length = 0;

  class FakeSpeechRecognition {
    continuous = false;
    interimResults = false;
    lang = "";
    onresult: ((e: IFakeSpeechResultEvent) => void) | null = null;
    onerror: ((e: { error: string }) => void) | null = null;
    onend: (() => void) | null = null;
    start = vi.fn();
    stop = vi.fn();

    constructor() {
      recognitionInstances.push(this);
    }
  }

  (window as unknown as Record<string, unknown>)["SpeechRecognition"] =
    FakeSpeechRecognition;
  (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"] =
    undefined;
}

function withoutSpeechRecognition() {
  (window as unknown as Record<string, unknown>)["SpeechRecognition"] =
    undefined;
  (window as unknown as Record<string, unknown>)["webkitSpeechRecognition"] =
    undefined;
}

function simulateSpeech(transcript: string) {
  const instance = recognitionInstances[recognitionInstances.length - 1];
  if (!instance?.onresult) return;
  instance.onresult({
    resultIndex: 0,
    results: {
      length: 1,
      0: {
        isFinal: true,
        0: { transcript },
      },
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  recognitionInstances.length = 0;
  mockUsePass.mockReturnValue(defaultPassValue());
  vi.stubGlobal("fetch", vi.fn());
  localStorage.clear();
});

describe("Scribe — unauthenticated", () => {
  it("shows sign-in prompt when user is not signed in", () => {
    signedOutUser();
    mockUsePass.mockReturnValue({
      ...defaultPassValue(),
      isSignedIn: false,
    });
    render(<Scribe />);

    expect(screen.getByText("Sign in to use Scribe")).toBeTruthy();
    expect(
      screen.getByText(/records your prenatal appointments/i),
    ).toBeTruthy();
    expect(screen.queryByText(/tap the mic/i)).toBeNull();
  });
});

describe("Scribe — browser not supported", () => {
  it("shows Chrome/Edge guidance when SpeechRecognition is unavailable", () => {
    signedInUser();
    withoutSpeechRecognition();
    render(<Scribe />);

    expect(screen.getByText("Browser not supported")).toBeTruthy();
    expect(screen.getByText(/Google Chrome or Microsoft Edge/i)).toBeTruthy();
    expect(screen.queryByText(/tap the mic/i)).toBeNull();
  });
});

describe("Scribe — transcript editing", () => {
  it("transcript textarea is editable after stopping recording", () => {
    signedInUser();
    withSpeechRecognition();
    render(<Scribe />);

    const micButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-primary",
    )!;
    fireEvent.click(micButton);

    simulateSpeech(
      "The doctor checked my blood pressure and said it looks good.",
    );

    const stopButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-red-500",
    )!;
    fireEvent.click(stopButton);

    const textarea = screen.getByPlaceholderText(
      /Your transcript will appear here/i,
    ) as HTMLTextAreaElement;

    expect(textarea).toBeTruthy();
    expect(textarea.value).toContain("blood pressure");

    fireEvent.change(textarea, {
      target: { value: "My corrected transcript for this visit." },
    });
    expect(textarea.value).toBe("My corrected transcript for this visit.");
  });
});

describe("Scribe — SCRIBE_LIMIT_REACHED", () => {
  it("shows upgrade message and CTA button when limit is reached", async () => {
    signedInUser();
    withSpeechRecognition();

    mockUsePass.mockReturnValue({
      ...defaultPassValue(),
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            code: "SCRIBE_LIMIT_REACHED",
            error:
              "You have used your free scribe session. Upgrade to the Full Pregnancy Pass for unlimited sessions.",
          }),
      }),
    );

    render(<Scribe />);

    const micButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-primary",
    )!;
    fireEvent.click(micButton);

    simulateSpeech(
      "Doctor said everything looks good and baby is healthy today.",
    );

    const stopButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-red-500",
    )!;
    fireEvent.click(stopButton);

    const generateBtn = await screen.findByRole("button", {
      name: /Generate My Visit Summary/i,
    });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/You've used your free scribe session/i),
      ).toBeTruthy();
    });

    const ctaButton = screen.getByTestId("upgrade-to-pass-cta");
    expect(ctaButton).toBeTruthy();
    // The web app does not sell the pass; the CTA is a link to the App Store.
    expect(ctaButton.textContent).toContain("Get the Pass in the App Store");
    expect(ctaButton.getAttribute("href")).toBe(APP_STORE_URL);
  });

  it("shows generic 'try again' message and no upgrade CTA when service is unavailable (503)", async () => {
    signedInUser();
    withSpeechRecognition();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: () =>
          Promise.resolve({
            error:
              "The scribe service is not available right now. Please try again later.",
          }),
      }),
    );

    render(<Scribe />);

    const micButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-primary",
    )!;
    fireEvent.click(micButton);

    simulateSpeech(
      "Doctor said everything looks good and baby is healthy today.",
    );

    const stopButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-red-500",
    )!;
    fireEvent.click(stopButton);

    const generateBtn = await screen.findByRole("button", {
      name: /Generate My Visit Summary/i,
    });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/not available right now/i)).toBeTruthy();
    });

    expect(screen.queryByTestId("upgrade-to-pass-cta")).toBeNull();
  });

  it("never shows upgrade CTA when hasPass=true even if SCRIBE_LIMIT_REACHED is returned (page-reload regression)", async () => {
    signedInUser();
    withSpeechRecognition();

    mockUsePass.mockReturnValue({
      ...defaultPassValue(),
      hasPass: true,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            code: "SCRIBE_LIMIT_REACHED",
            error:
              "You have used your free scribe session. Upgrade to the Full Pregnancy Pass for unlimited sessions.",
          }),
      }),
    );

    render(<Scribe />);

    const micButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-primary",
    )!;
    fireEvent.click(micButton);

    simulateSpeech(
      "Doctor said everything looks good and baby is healthy today.",
    );

    const stopButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-red-500",
    )!;
    fireEvent.click(stopButton);

    const generateBtn = await screen.findByRole("button", {
      name: /Generate My Visit Summary/i,
    });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(
        screen.queryByRole("button", { name: /Generate My Visit Summary/i }),
      ).toBeNull();
    });

    expect(screen.queryByTestId("upgrade-to-pass-cta")).toBeNull();
    expect(screen.queryByText(/Upgrade to Full Pass/i)).toBeNull();
  });

  it("does not show upgrade CTA for generic errors", async () => {
    signedInUser();
    withSpeechRecognition();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: "Note generation failed. Please try again.",
          }),
      }),
    );

    render(<Scribe />);

    const micButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-primary",
    )!;
    fireEvent.click(micButton);

    simulateSpeech(
      "Doctor said everything looks good and baby is healthy today.",
    );

    const stopButton = document.querySelector<HTMLButtonElement>(
      "button.rounded-full.bg-red-500",
    )!;
    fireEvent.click(stopButton);

    const generateBtn = await screen.findByRole("button", {
      name: /Generate My Visit Summary/i,
    });
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText(/Note generation failed/i)).toBeTruthy();
    });

    expect(screen.queryByTestId("upgrade-to-pass-cta")).toBeNull();
  });
});
