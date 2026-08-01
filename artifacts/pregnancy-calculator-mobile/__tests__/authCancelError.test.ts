import { isCancelError } from "../lib/auth-cancel";

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
});
