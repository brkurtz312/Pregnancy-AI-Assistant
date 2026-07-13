import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import { writeFileSync, rmSync, mkdtempSync } from "fs";
import { tmpdir } from "os";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { checkWhatsNew } from "./check-whats-new.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

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

// ── CLI integration tests ─────────────────────────────────────────────────────
// Spawns the real script entry point as a child process with temp fixture files
// so that a refactor of the file-reading plumbing or the isMain guard is caught.

const tsxBin = resolve(__dirname, "../../node_modules/.bin/tsx");
const scriptPath = resolve(__dirname, "./check-whats-new.ts");

function runCli(
  appJsonContent: string,
  whatsNewContent: string,
): { exitCode: number; stdout: string; stderr: string } {
  const dir = mkdtempSync(join(tmpdir(), "check-whats-new-"));
  const appJsonPath = join(dir, "app.json");
  const whatsNewPath = join(dir, "whatsNew.ts");

  try {
    writeFileSync(appJsonPath, appJsonContent, "utf8");
    writeFileSync(whatsNewPath, whatsNewContent, "utf8");

    const result = spawnSync(tsxBin, [scriptPath], {
      env: {
        ...process.env,
        CHECK_WHATS_NEW_APP_JSON_PATH: appJsonPath,
        CHECK_WHATS_NEW_WHATS_NEW_PATH: whatsNewPath,
      },
      encoding: "utf8",
    });

    return {
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("check-whats-new CLI — integration", () => {
  it("exits 0 and prints a success message when the version key is present", () => {
    const { exitCode, stdout } = runCli(
      appJson("1.5.0"),
      whatsNewWith("1.4.0", "1.5.0"),
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("1.5.0");
  });

  it("exits 1 and prints the missing-version message when the key is absent", () => {
    const { exitCode, stderr } = runCli(
      appJson("2.1.0"),
      whatsNewWith("2.0.0"),
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("2.1.0");
    expect(stderr).toContain("What's New entry missing");
  });

  it("exits 1 when app.json is invalid JSON", () => {
    const { exitCode, stderr } = runCli("{bad json}", whatsNewWith("1.0.0"));
    expect(exitCode).toBe(1);
    expect(stderr).toContain("not valid JSON");
  });

  it("exits 1 when expo.version is absent from app.json", () => {
    const { exitCode, stderr } = runCli(
      JSON.stringify({ expo: {} }),
      whatsNewWith("1.0.0"),
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("missing or empty");
  });
});
