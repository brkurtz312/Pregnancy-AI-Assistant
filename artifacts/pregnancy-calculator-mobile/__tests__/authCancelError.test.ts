import { isCancelError, logAuthFailure } from "../lib/auth-cancel";

describe("isCancelError", () => {
  it("returns false for null / undefined", () => {
    expect(isCancelError(null)).toBe(false);
    expect(isCancelError(undefined)).toBe(false);
    expect(isCancelError(false)).toBe(false);
  });

  // ── Apple Sign-In ──────────────────────────────────────────────────────────
  it("returns true for Apple ERR_CANCELED code object", () => {
    expect(isCancelError({ code: "ERR_CANCELED" })).toBe(true);
  });

  it("returns false for other Apple error codes", () => {
    expect(isCancelError({ code: "ERR_FAILED" })).toBe(false);
    expect(isCancelError({ code: "ERR_INVALID_OPERATION" })).toBe(false);
  });

  // ── Google / WebBrowser dismissal ─────────────────────────────────────────
  it("returns true for Error with 'cancel' in the message", () => {
    expect(isCancelError(new Error("user_cancel"))).toBe(true);
    expect(isCancelError(new Error("The operation was cancelled."))).toBe(true);
  });

  it("returns true for Error with 'dismiss' in the message", () => {
    expect(isCancelError(new Error("Browser dismissed by user"))).toBe(true);
  });

  it("returns true for plain string cancel messages", () => {
    expect(isCancelError("cancel")).toBe(true);
    expect(isCancelError("user_cancel")).toBe(true);
  });

  // ── Genuine failures that must NOT be swallowed ───────────────────────────
  it("returns false for genuine auth errors", () => {
    expect(isCancelError(new Error("Network request failed"))).toBe(false);
    expect(isCancelError(new Error("Invalid credentials"))).toBe(false);
    expect(
      isCancelError({ code: "ERR_FAILED", message: "Something broke" }),
    ).toBe(false);
    expect(isCancelError("unexpected error")).toBe(false);
  });

  // ── Only the message decides, not the whole payload ───────────────────────
  // A Clerk failure carries longMessage, provider detail and assorted flags.
  // Matching against a JSON dump of all of it let one stray "dismissed" or
  // "cancelled" classify a real error as a user dismissal.
  it("ignores cancel words outside the message", () => {
    expect(
      isCancelError({
        code: "oauth_identifier_exists",
        message: "Account could not be linked",
        longMessage:
          "The verification was dismissed before the account could be linked.",
      }),
    ).toBe(false);
    expect(
      isCancelError({ code: "ERR_FAILED", dismissable: true, retry: "cancel" }),
    ).toBe(false);
  });

  it("reads the message out of a Clerk-shaped error", () => {
    expect(
      isCancelError({ errors: [{ message: "user_cancel", code: "x" }] }),
    ).toBe(true);
    expect(
      isCancelError({ errors: [{ message: "Identifier already exists" }] }),
    ).toBe(false);
  });
});

describe("logAuthFailure", () => {
  let spy: jest.SpyInstance;

  beforeEach(() => {
    spy = jest.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    spy.mockRestore();
  });

  // The point of the helper: a failure shaped like a dismissal is still a
  // failure, and used to leave no trace anywhere.
  it("logs errors it classifies as a cancellation, and says so", () => {
    logAuthFailure("Google sign-in", new Error("Browser dismissed by user"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe(
      "Google sign-in failed (treated as user cancellation):",
    );
  });

  it("logs genuine failures without the cancellation note", () => {
    logAuthFailure("Apple sign-in", new Error("Network request failed"));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0]).toBe("Apple sign-in failed:");
    expect(spy.mock.calls[0][1]).toBe("Network request failed");
  });

  it("survives an error that cannot be serialized", () => {
    const circular: Record<string, unknown> = { message: "boom" };
    circular.self = circular;
    expect(() => logAuthFailure("Google sign-in", circular)).not.toThrow();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
