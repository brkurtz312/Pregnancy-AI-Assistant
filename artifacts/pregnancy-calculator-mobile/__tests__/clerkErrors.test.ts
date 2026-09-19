import {
  clerkErrorMessage,
  globalClerkErrorText,
  logClerkFailure,
} from "@/lib/clerk-errors";

const FALLBACK = "Something went wrong.";

describe("clerkErrorMessage", () => {
  // longMessage is the one Clerk writes for a person to read; message is
  // often the machine code.
  it("prefers longMessage over message", () => {
    expect(
      clerkErrorMessage(
        {
          errors: [
            {
              longMessage: "You're already signed in.",
              message: "session_exists",
            },
          ],
        },
        FALLBACK,
      ),
    ).toBe("You're already signed in.");
  });

  it("falls back through the shapes Clerk actually returns", () => {
    expect(
      clerkErrorMessage({ errors: [{ message: "session_exists" }] }, FALLBACK),
    ).toBe("session_exists");
    expect(
      clerkErrorMessage({ message: "Network request failed" }, FALLBACK),
    ).toBe("Network request failed");
    expect(clerkErrorMessage("plain string", FALLBACK)).toBe("plain string");
  });

  // The point of the fallback: the caller always has something to show, so no
  // code path can leave the screen blank.
  it("never returns nothing", () => {
    expect(clerkErrorMessage(null, FALLBACK)).toBe(FALLBACK);
    expect(clerkErrorMessage(undefined, FALLBACK)).toBe(FALLBACK);
    expect(clerkErrorMessage({}, FALLBACK)).toBe(FALLBACK);
    expect(clerkErrorMessage({ code: "session_exists" }, FALLBACK)).toBe(
      FALLBACK,
    );
    expect(clerkErrorMessage({ message: "   " }, FALLBACK)).toBe(FALLBACK);
  });
});

describe("globalClerkErrorText", () => {
  it("reads the first global error, which the screens previously dropped", () => {
    expect(
      globalClerkErrorText({ global: [{ message: "Too many requests." }] }),
    ).toBe("Too many requests.");
  });

  it("is null when there is nothing to say", () => {
    expect(globalClerkErrorText({ global: null })).toBeNull();
    expect(globalClerkErrorText({})).toBeNull();
    expect(globalClerkErrorText({ global: [] })).toBeNull();
    expect(globalClerkErrorText({ global: [{ message: "  " }] })).toBeNull();
  });
});

describe("logClerkFailure", () => {
  it("records the failure and survives a payload that cannot be serialised", () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const circular: Record<string, unknown> = { message: "boom" };
    circular.self = circular;

    expect(() => logClerkFailure("Email sign-in", circular)).not.toThrow();
    expect(spy).toHaveBeenCalled();
    expect(String(spy.mock.calls[0][0])).toContain("Email sign-in failed");
    spy.mockRestore();
  });
});
