/**
 * Scribe free-session limit — mobile.
 *
 * Confirms that when the server returns 403 / SCRIBE_LIMIT_REACHED during
 * the note-generation step, the mobile Scribe screen:
 *   1. Shows the PassGate upgrade modal (not a cryptic error).
 *   2. Surfaces the "Free Session Used" title and upgrade description.
 *   3. Displays an "Unlock Full Pregnancy Pass" CTA button.
 *   4. Does NOT surface a generic error box for this specific 403 code.
 *   5. Returns to "transcribed" phase so the transcript remains visible.
 */

import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { act, create } from "react-test-renderer";
import type { ReactTestInstance } from "react-test-renderer";
import { flushAsync } from "../test-helpers/testUtils";

// This file uses fake timers + multiple flushAsync rounds.  Under concurrent
// CI load (all workspace test suites running in parallel) the combined act()
// overhead can exceed Jest's default 5 s per-test limit.  15 s gives
// comfortable headroom without masking genuinely hung tests.
jest.setTimeout(15000);

// ─── Core RN mocks ────────────────────────────────────────────────────────────

jest.mock("react-native-safe-area-context", () => ({
  SafeAreaView: "SafeAreaView",
}));

jest.mock("@expo/vector-icons", () => ({ Ionicons: "Ionicons" }));

jest.mock("@/hooks/useColors", () => ({
  useColors: () => ({
    background: "#fff",
    card: "#f9f9f9",
    border: "#eee",
    primary: "#e86cad",
    primaryForeground: "#fff",
    foreground: "#000",
    mutedForeground: "#666",
    muted: "#f5f5f5",
  }),
}));

// ─── Clerk ────────────────────────────────────────────────────────────────────

jest.mock("@clerk/expo", () => ({
  useAuth: jest.fn(() => ({
    getToken: jest.fn().mockResolvedValue("tok-123"),
  })),
}));

// ─── expo-router ──────────────────────────────────────────────────────────────

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
}));

// ─── expo-clipboard ───────────────────────────────────────────────────────────

jest.mock("expo-clipboard", () => ({
  setStringAsync: jest.fn().mockResolvedValue(undefined),
}));

// ─── expo-av (Audio) ──────────────────────────────────────────────────────────

jest.mock("expo-av", () => ({
  Audio: {
    requestPermissionsAsync: jest.fn().mockResolvedValue({ granted: true }),
    setAudioModeAsync: jest.fn().mockResolvedValue(undefined),
    Recording: {
      createAsync: jest.fn().mockResolvedValue({
        recording: {
          stopAndUnloadAsync: jest.fn().mockResolvedValue(undefined),
          getURI: jest.fn().mockReturnValue("file:///mock-encounter.m4a"),
        },
      }),
    },
    RecordingOptionsPresets: { HIGH_QUALITY: {} },
  },
}));

// ─── scribe-note ──────────────────────────────────────────────────────────────

jest.mock("@/lib/scribe-note", () => ({
  saveScribeNote: jest.fn().mockResolvedValue(undefined),
}));

// ─── usePass (consumed by PassGate) ───────────────────────────────────────────

jest.mock("@/hooks/usePass", () => ({
  usePass: jest.fn(() => ({
    startCheckout: jest.fn(),
    isStartingCheckout: false,
  })),
}));

// ─── Subject ──────────────────────────────────────────────────────────────────

import ScribeScreen from "../app/scribe";

// ─── Helpers (same pattern used across this test suite) ───────────────────────

/** Flatten React children into a plain string. */
function flatText(children: unknown): string {
  if (children == null) return "";
  if (typeof children === "string" || typeof children === "number")
    return String(children);
  if (Array.isArray(children)) return children.map(flatText).join("");
  return "";
}

/** Walk upward from a Text node to the nearest TouchableOpacity ancestor. */
function touchableParent(
  node: ReactTestInstance,
): ReactTestInstance | undefined {
  let cur: ReactTestInstance | null = node.parent;
  while (cur) {
    if (cur.type === TouchableOpacity) return cur;
    cur = cur.parent;
  }
  return undefined;
}

/** Find the first TouchableOpacity whose label text includes the given substring. */
function findBtn(
  root: ReactTestInstance,
  label: string,
): ReactTestInstance | undefined {
  const textNodes = root.findAllByType(Text);
  for (const t of textNodes) {
    if (flatText(t.props.children).includes(label)) {
      const btn = touchableParent(t);
      if (btn) return btn;
    }
  }
  return undefined;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const MOCK_TRANSCRIPT = "Doctor said everything looks great.";

describe("ScribeScreen — SCRIBE_LIMIT_REACHED at transcribe step (mobile)", () => {
  let renderer: ReturnType<typeof create>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // /api/scribe/transcribe → 403 SCRIBE_LIMIT_REACHED (limit hit before upload completes)
    (global.fetch as jest.Mock) = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: jest.fn().mockResolvedValue({
        code: "SCRIBE_LIMIT_REACHED",
        error: "You have used your free scribe session.",
      }),
    });

    act(() => {
      renderer = create(React.createElement(ScribeScreen));
    });
    await flushAsync();
  }, 15000);

  afterEach(() => {
    jest.clearAllMocks();
  });

  /** Drive the screen from idle → recording → transcribe-step 403. */
  async function driveToTranscribeLimitReached() {
    // Step 1 — start recording
    const startBtn = findBtn(renderer.root, "Start Recording");
    expect(startBtn).toBeDefined();
    await act(async () => {
      startBtn!.props.onPress();
    });
    await flushAsync();

    // Step 2 — stop recording (triggers transcribe fetch which returns 403)
    const allTouchables = renderer.root.findAllByType(TouchableOpacity);
    const stopBtn = allTouchables.find((btn) => {
      const style = btn.props.style;
      if (Array.isArray(style)) {
        return style.some(
          (s: Record<string, unknown>) =>
            s && typeof s === "object" && s.backgroundColor === "#ef4444",
        );
      }
      return (
        style &&
        typeof style === "object" &&
        style.backgroundColor === "#ef4444"
      );
    });
    expect(stopBtn).toBeDefined();
    await act(async () => {
      stopBtn!.props.onPress();
    });
    await flushAsync(8);
  }

  it("shows the PassGate upgrade modal when transcribe returns SCRIBE_LIMIT_REACHED", async () => {
    await driveToTranscribeLimitReached();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Free Session Used");
  });

  it("does NOT surface a generic error message when transcribe returns SCRIBE_LIMIT_REACHED", async () => {
    await driveToTranscribeLimitReached();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).not.toContain("You have used your free scribe session");
    expect(json).not.toContain("Transcription failed");
  });

  it("returns to idle phase (no transcript shown) after transcribe limit hit", async () => {
    await driveToTranscribeLimitReached();

    const json = JSON.stringify(renderer.toJSON());
    // No transcript text or generate button — screen is back at idle
    expect(json).not.toContain("Create My Visit Summary");
    expect(json).not.toContain("WHAT WAS RECORDED");
    // Start Recording button should be present (idle phase)
    expect(json).toContain("Start Recording");
  });

  it("shows the Unlock Full Pregnancy Pass CTA in the PassGate", async () => {
    await driveToTranscribeLimitReached();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Unlock Full Pregnancy Pass");
  });
});

describe("ScribeScreen — SCRIBE_LIMIT_REACHED handling (mobile)", () => {
  let renderer: ReturnType<typeof create>;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Call 1: /api/scribe/transcribe → success
    // Call 2: /api/scribe/generate-note → 403 SCRIBE_LIMIT_REACHED
    (global.fetch as jest.Mock) = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ transcript: MOCK_TRANSCRIPT }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: jest.fn().mockResolvedValue({
          code: "SCRIBE_LIMIT_REACHED",
          error: "You have used your free scribe session.",
        }),
      });

    act(() => {
      renderer = create(React.createElement(ScribeScreen));
    });
    await flushAsync();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  /**
   * Drive the screen from idle → recording → transcribed → limit-reached.
   *
   * 1. Press "Start Recording" to start the audio capture.
   * 2. Press the stop button to stop and trigger transcription fetch.
   * 3. Press "Create My Visit Summary" to trigger note generation.
   *    The mocked fetch returns 403 / SCRIBE_LIMIT_REACHED on this call.
   */
  async function driveToLimitReached() {
    // Step 1 — start recording
    const startBtn = findBtn(renderer.root, "Start Recording");
    expect(startBtn).toBeDefined();
    await act(async () => {
      startBtn!.props.onPress();
    });
    await flushAsync();

    // Step 2 — stop recording
    // The stop button has no text label — find it by locating the red stop icon
    // (the only TouchableOpacity that wraps an Ionicons with stopBtn style).
    // We use the "recording" phase text as anchor to scope the search.
    const recordingLabel = renderer.root
      .findAllByType(Text)
      .find((t) => flatText(t.props.children).includes("Recording"));
    expect(recordingLabel).toBeDefined();

    // Find the stop TouchableOpacity — it's the one containing the stop Ionicons
    // immediately visible in the recording phase card.
    const allTouchables = renderer.root.findAllByType(TouchableOpacity);
    // The stop button is the only touchable whose style has backgroundColor "#ef4444"
    const stopBtn = allTouchables.find((btn) => {
      const style = btn.props.style;
      if (Array.isArray(style)) {
        return style.some(
          (s: Record<string, unknown>) =>
            s && typeof s === "object" && s.backgroundColor === "#ef4444",
        );
      }
      return (
        style &&
        typeof style === "object" &&
        style.backgroundColor === "#ef4444"
      );
    });
    expect(stopBtn).toBeDefined();
    await act(async () => {
      stopBtn!.props.onPress();
    });
    await flushAsync(8);

    // Step 3 — trigger note generation (fetch returns 403 on this call)
    const generateBtn = findBtn(renderer.root, "Create My Visit Summary");
    expect(generateBtn).toBeDefined();
    await act(async () => {
      generateBtn!.props.onPress();
    });
    await flushAsync(8);
  }

  it("shows the PassGate upgrade modal when SCRIBE_LIMIT_REACHED is returned", async () => {
    await driveToLimitReached();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Free Session Used");
  });

  it("includes the upgrade description in the PassGate", async () => {
    await driveToLimitReached();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Upgrade to the Full Pregnancy Pass");
  });

  it("shows the 'Unlock Full Pregnancy Pass' CTA button", async () => {
    await driveToLimitReached();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain("Unlock Full Pregnancy Pass");
  });

  it("does NOT surface a generic error message for SCRIBE_LIMIT_REACHED", async () => {
    await driveToLimitReached();

    const json = JSON.stringify(renderer.toJSON());
    // The raw server error string must not leak into the visible UI
    expect(json).not.toContain("You have used your free scribe session");
  });

  it("keeps the transcript visible after limit is hit (returns to transcribed phase)", async () => {
    await driveToLimitReached();

    const json = JSON.stringify(renderer.toJSON());
    expect(json).toContain(MOCK_TRANSCRIPT);
    // "Create My Visit Summary" button still shown — confirms transcribed phase
    expect(json).toContain("Create My Visit Summary");
  });
});

describe("ScribeScreen — network failure mid-recording (mobile)", () => {
  let renderer: ReturnType<typeof create>;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows generic error box and no upgrade CTA when transcribe fetch rejects (network drop)", async () => {
    jest.clearAllMocks();

    (global.fetch as jest.Mock) = jest
      .fn()
      .mockRejectedValueOnce(new Error("Network request failed"));

    act(() => {
      renderer = create(React.createElement(ScribeScreen));
    });
    await flushAsync();

    const startBtn = findBtn(renderer.root, "Start Recording");
    expect(startBtn).toBeDefined();
    await act(async () => {
      startBtn!.props.onPress();
    });
    await flushAsync();

    const allTouchables = renderer.root.findAllByType(TouchableOpacity);
    const stopBtn = allTouchables.find((btn) => {
      const style = btn.props.style;
      if (Array.isArray(style)) {
        return style.some(
          (s: Record<string, unknown>) =>
            s && typeof s === "object" && s.backgroundColor === "#ef4444",
        );
      }
      return (
        style &&
        typeof style === "object" &&
        style.backgroundColor === "#ef4444"
      );
    });
    expect(stopBtn).toBeDefined();
    await act(async () => {
      stopBtn!.props.onPress();
    });
    await flushAsync(8);

    const json = JSON.stringify(renderer.toJSON());

    expect(json).toContain("Network request failed");

    expect(json).not.toContain("Free Session Used");
    expect(json).not.toContain("Unlock Full Pregnancy Pass");
  });

  it("shows generic error box and no upgrade CTA when generate-note fetch rejects (network drop)", async () => {
    jest.clearAllMocks();

    (global.fetch as jest.Mock) = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ transcript: MOCK_TRANSCRIPT }),
      })
      .mockRejectedValueOnce(new Error("Network request failed"));

    act(() => {
      renderer = create(React.createElement(ScribeScreen));
    });
    await flushAsync();

    const startBtn = findBtn(renderer.root, "Start Recording");
    expect(startBtn).toBeDefined();
    await act(async () => {
      startBtn!.props.onPress();
    });
    await flushAsync();

    const allTouchables = renderer.root.findAllByType(TouchableOpacity);
    const stopBtn = allTouchables.find((btn) => {
      const style = btn.props.style;
      if (Array.isArray(style)) {
        return style.some(
          (s: Record<string, unknown>) =>
            s && typeof s === "object" && s.backgroundColor === "#ef4444",
        );
      }
      return (
        style &&
        typeof style === "object" &&
        style.backgroundColor === "#ef4444"
      );
    });
    expect(stopBtn).toBeDefined();
    await act(async () => {
      stopBtn!.props.onPress();
    });
    await flushAsync(8);

    const generateBtn = findBtn(renderer.root, "Create My Visit Summary");
    expect(generateBtn).toBeDefined();
    await act(async () => {
      generateBtn!.props.onPress();
    });
    await flushAsync(8);

    const json = JSON.stringify(renderer.toJSON());

    expect(json).toContain("Network request failed");

    expect(json).not.toContain("Free Session Used");
    expect(json).not.toContain("Unlock Full Pregnancy Pass");
  });
});

describe("ScribeScreen — network recovery after mid-recording drop (mobile)", () => {
  let renderer: ReturnType<typeof create>;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("clears error, starts new recording, and transcribes successfully after a transcribe network failure", async () => {
    jest.clearAllMocks();

    // First recording cycle: transcribe fetch rejects (network drop)
    // Second recording cycle: transcribe fetch succeeds
    (global.fetch as jest.Mock) = jest
      .fn()
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ transcript: MOCK_TRANSCRIPT }),
      });

    act(() => {
      renderer = create(React.createElement(ScribeScreen));
    });
    await flushAsync();

    // ── First cycle: drive to network-failure state ──────────────────────────

    const startBtn1 = findBtn(renderer.root, "Start Recording");
    expect(startBtn1).toBeDefined();
    await act(async () => {
      startBtn1!.props.onPress();
    });
    await flushAsync();

    const allTouchables1 = renderer.root.findAllByType(TouchableOpacity);
    const stopBtn1 = allTouchables1.find((btn) => {
      const style = btn.props.style;
      if (Array.isArray(style)) {
        return style.some(
          (s: Record<string, unknown>) =>
            s && typeof s === "object" && s.backgroundColor === "#ef4444",
        );
      }
      return (
        style &&
        typeof style === "object" &&
        style.backgroundColor === "#ef4444"
      );
    });
    expect(stopBtn1).toBeDefined();
    await act(async () => {
      stopBtn1!.props.onPress();
    });
    await flushAsync(8);

    // Error box must be visible after the first (failed) cycle
    const jsonAfterFailure = JSON.stringify(renderer.toJSON());
    expect(jsonAfterFailure).toContain("Network request failed");
    // And the screen should be back at idle with "Start Recording" available
    expect(jsonAfterFailure).toContain("Start Recording");

    // ── Second cycle: network is restored ────────────────────────────────────

    const startBtn2 = findBtn(renderer.root, "Start Recording");
    expect(startBtn2).toBeDefined();
    await act(async () => {
      startBtn2!.props.onPress();
    });
    await flushAsync();

    // Error box must have cleared as soon as a new recording starts
    const jsonDuringRecording = JSON.stringify(renderer.toJSON());
    expect(jsonDuringRecording).not.toContain("Network request failed");

    const allTouchables2 = renderer.root.findAllByType(TouchableOpacity);
    const stopBtn2 = allTouchables2.find((btn) => {
      const style = btn.props.style;
      if (Array.isArray(style)) {
        return style.some(
          (s: Record<string, unknown>) =>
            s && typeof s === "object" && s.backgroundColor === "#ef4444",
        );
      }
      return (
        style &&
        typeof style === "object" &&
        style.backgroundColor === "#ef4444"
      );
    });
    expect(stopBtn2).toBeDefined();
    await act(async () => {
      stopBtn2!.props.onPress();
    });
    await flushAsync(8);

    // Transcription succeeded — transcript is visible, no error box
    const jsonAfterRecovery = JSON.stringify(renderer.toJSON());
    expect(jsonAfterRecovery).toContain(MOCK_TRANSCRIPT);
    expect(jsonAfterRecovery).toContain("Create My Visit Summary");
    expect(jsonAfterRecovery).not.toContain("Network request failed");
  });

  it("clears error and produces the summary when generate-note succeeds after a prior network failure", async () => {
    jest.clearAllMocks();

    const MOCK_NOTE = {
      headline: "All looking great",
      whatWasDiscussed: "Everything is on track.",
      nextSteps: ["Drink more water"],
      rememberTo: "Rest up",
    };

    // Call 1 (transcribe): always succeeds
    // Call 2 (generate-note first attempt): rejects — network drop
    // Call 3 (generate-note second attempt): succeeds
    (global.fetch as jest.Mock) = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ transcript: MOCK_TRANSCRIPT }),
      })
      .mockRejectedValueOnce(new Error("Network request failed"))
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ note: MOCK_NOTE }),
      });

    act(() => {
      renderer = create(React.createElement(ScribeScreen));
    });
    await flushAsync();

    // ── Drive through recording → transcribed ────────────────────────────────

    const startBtn = findBtn(renderer.root, "Start Recording");
    expect(startBtn).toBeDefined();
    await act(async () => {
      startBtn!.props.onPress();
    });
    await flushAsync();

    const allTouchables = renderer.root.findAllByType(TouchableOpacity);
    const stopBtn = allTouchables.find((btn) => {
      const style = btn.props.style;
      if (Array.isArray(style)) {
        return style.some(
          (s: Record<string, unknown>) =>
            s && typeof s === "object" && s.backgroundColor === "#ef4444",
        );
      }
      return (
        style &&
        typeof style === "object" &&
        style.backgroundColor === "#ef4444"
      );
    });
    expect(stopBtn).toBeDefined();
    await act(async () => {
      stopBtn!.props.onPress();
    });
    await flushAsync(8);

    // ── First generate-note attempt: network drops ───────────────────────────

    const generateBtn1 = findBtn(renderer.root, "Create My Visit Summary");
    expect(generateBtn1).toBeDefined();
    await act(async () => {
      generateBtn1!.props.onPress();
    });
    await flushAsync(8);

    const jsonAfterFailure = JSON.stringify(renderer.toJSON());
    expect(jsonAfterFailure).toContain("Network request failed");
    // Screen stays in transcribed phase — transcript and retry button still visible
    expect(jsonAfterFailure).toContain(MOCK_TRANSCRIPT);
    expect(jsonAfterFailure).toContain("Create My Visit Summary");

    // ── Second generate-note attempt: network restored ───────────────────────

    const generateBtn2 = findBtn(renderer.root, "Create My Visit Summary");
    expect(generateBtn2).toBeDefined();
    await act(async () => {
      generateBtn2!.props.onPress();
    });
    await flushAsync(8);

    // Error must have cleared and summary must be visible
    const jsonAfterRecovery = JSON.stringify(renderer.toJSON());
    expect(jsonAfterRecovery).not.toContain("Network request failed");
    expect(jsonAfterRecovery).toContain("All looking great");
    expect(jsonAfterRecovery).toContain("MY VISIT SUMMARY");
  });
});

describe("ScribeScreen — 503 service unavailable (mobile)", () => {
  let renderer: ReturnType<typeof create>;

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("shows generic error message and no upgrade CTA when transcribe returns 503", async () => {
    jest.clearAllMocks();

    (global.fetch as jest.Mock) = jest.fn().mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: jest.fn().mockResolvedValue({
        error:
          "The scribe service is not available right now. Please try again later.",
      }),
    });

    act(() => {
      renderer = create(React.createElement(ScribeScreen));
    });
    await flushAsync();

    // Start recording
    const startBtn = findBtn(renderer.root, "Start Recording");
    expect(startBtn).toBeDefined();
    await act(async () => {
      startBtn!.props.onPress();
    });
    await flushAsync();

    // Stop recording (triggers transcribe fetch which returns 503)
    const allTouchables = renderer.root.findAllByType(TouchableOpacity);
    const stopBtn = allTouchables.find((btn) => {
      const style = btn.props.style;
      if (Array.isArray(style)) {
        return style.some(
          (s: Record<string, unknown>) =>
            s && typeof s === "object" && s.backgroundColor === "#ef4444",
        );
      }
      return (
        style &&
        typeof style === "object" &&
        style.backgroundColor === "#ef4444"
      );
    });
    expect(stopBtn).toBeDefined();
    await act(async () => {
      stopBtn!.props.onPress();
    });
    await flushAsync(8);

    const json = JSON.stringify(renderer.toJSON());

    // Generic error message is shown
    expect(json).toContain("not available right now");

    // No upgrade prompt — PassGate title must not appear
    expect(json).not.toContain("Free Session Used");
    expect(json).not.toContain("Unlock Full Pregnancy Pass");
  });

  it("shows generic error message and no upgrade CTA when generate-note returns 503", async () => {
    jest.clearAllMocks();

    // Call 1: transcribe → success
    // Call 2: generate-note → 503
    (global.fetch as jest.Mock) = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({ transcript: MOCK_TRANSCRIPT }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: jest.fn().mockResolvedValue({
          error:
            "The scribe service is not available right now. Please try again later.",
        }),
      });

    act(() => {
      renderer = create(React.createElement(ScribeScreen));
    });
    await flushAsync();

    // Start recording
    const startBtn = findBtn(renderer.root, "Start Recording");
    expect(startBtn).toBeDefined();
    await act(async () => {
      startBtn!.props.onPress();
    });
    await flushAsync();

    // Stop recording
    const allTouchables = renderer.root.findAllByType(TouchableOpacity);
    const stopBtn = allTouchables.find((btn) => {
      const style = btn.props.style;
      if (Array.isArray(style)) {
        return style.some(
          (s: Record<string, unknown>) =>
            s && typeof s === "object" && s.backgroundColor === "#ef4444",
        );
      }
      return (
        style &&
        typeof style === "object" &&
        style.backgroundColor === "#ef4444"
      );
    });
    expect(stopBtn).toBeDefined();
    await act(async () => {
      stopBtn!.props.onPress();
    });
    await flushAsync(8);

    // Trigger note generation (returns 503)
    const generateBtn = findBtn(renderer.root, "Create My Visit Summary");
    expect(generateBtn).toBeDefined();
    await act(async () => {
      generateBtn!.props.onPress();
    });
    await flushAsync(8);

    const json = JSON.stringify(renderer.toJSON());

    // Generic error message is shown
    expect(json).toContain("not available right now");

    // No upgrade prompt — PassGate title must not appear
    expect(json).not.toContain("Free Session Used");
    expect(json).not.toContain("Unlock Full Pregnancy Pass");
  });
});
