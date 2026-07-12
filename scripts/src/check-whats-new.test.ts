import { describe, it, expect } from "vitest";
import { checkWhatsNew } from "./check-whats-new.js";

const appJson = (version: string) => JSON.stringify({ expo: { version } });

const whatsNewWith = (...versions: string[]) =>
  `export const WHATS_NEW = {\n${versions.map((v) => `  "${v}": { headline: "h", items: [] },`).join("\n")}\n};`;

describe("checkWhatsNew — passing cases", () => {
  it("returns ok when the version key is present (double-quoted)", () => {
    const result = checkWhatsNew(appJson("1.2.3"), whatsNewWith("1.2.3"));
    expect(result.ok).toBe(true);
    expect(result.message).toContain("1.2.3");
  });

  it("returns ok when the version key is present (single-quoted)", () => {
    const whatsNew = `export const WHATS_NEW = {\n  '1.2.3': { headline: "h", items: [] },\n};`;
    const result = checkWhatsNew(appJson("1.2.3"), whatsNew);
    expect(result.ok).toBe(true);
  });

  it("returns ok when there are multiple versions and the target is present", () => {
    const result = checkWhatsNew(
      appJson("2.0.0"),
      whatsNewWith("1.0.0", "1.1.0", "2.0.0"),
    );
    expect(result.ok).toBe(true);
  });
});

describe("checkWhatsNew — blocking cases", () => {
  it("returns not-ok and names the missing version when key is absent", () => {
    const result = checkWhatsNew(appJson("1.3.0"), whatsNewWith("1.2.0"));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("1.3.0");
  });

  it("does not false-positive on a version that is a prefix of an existing key", () => {
    const result = checkWhatsNew(appJson("1.0"), whatsNewWith("1.0.0"));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("1.0");
  });

  it("does not false-positive on a version that is a substring in a value string", () => {
    const whatsNew = `export const WHATS_NEW = {\n  "1.1.0": { headline: "adds 1.0 improvements", items: [] },\n};`;
    const result = checkWhatsNew(appJson("1.0"), whatsNew);
    expect(result.ok).toBe(false);
  });

  it("returns not-ok when the whatsNew file is empty", () => {
    const result = checkWhatsNew(appJson("1.0.0"), "");
    expect(result.ok).toBe(false);
    expect(result.message).toContain("1.0.0");
  });
});

describe("checkWhatsNew — malformed input", () => {
  it("returns not-ok when app.json is invalid JSON", () => {
    const result = checkWhatsNew("{not json}", whatsNewWith("1.0.0"));
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not valid JSON");
  });

  it("returns not-ok when expo.version is missing", () => {
    const result = checkWhatsNew(
      JSON.stringify({ expo: {} }),
      whatsNewWith("1.0.0"),
    );
    expect(result.ok).toBe(false);
    expect(result.message).toContain("missing or empty");
  });
});
