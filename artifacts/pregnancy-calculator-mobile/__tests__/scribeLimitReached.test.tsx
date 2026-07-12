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
