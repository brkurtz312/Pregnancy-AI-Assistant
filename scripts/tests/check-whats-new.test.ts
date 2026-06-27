import { describe, it, expect } from "vitest";
import { spawnSync } from "child_process";
import * as path from "path";
import { fileURLToPath } from "url";
import { checkWhatsNew } from "../src/check-whats-new";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURES = path.join(__dirname, "fixtures/check-whats-new");
const SCRIPT = path.join(__dirname, "../src/check-whats-new.ts");
const TSX = path.join(__dirname, "../node_modules/.bin/tsx");

// ---------------------------------------------------------------------------
// Fixtures (for unit tests)
// ---------------------------------------------------------------------------

const WHATS_NEW_WITH_1_0_1 = `
export const WHATS_NEW = {
  "1.0.1": {
    headline: "What's new in this update",
    items: [
      {
        icon: "flash-outline",
        title: "Sign-in is now faster",
        body: "Fixed a timing issue.",
      },
    ],
  },
};
`;

const WHATS_NEW_WITHOUT_1_0_2 = `
export const WHATS_NEW = {
  "1.0.1": {
    headline: "What's new in this update",
    items: [],
  },
};
`;

function makeAppJson(version: string): string {
  return JSON.stringify({ expo: { version } });
}

// ---------------------------------------------------------------------------
// Helper: run the script as a child process against fixture files
// ---------------------------------------------------------------------------

function runScript(
  appJsonFile: string,
  whatsNewFile: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(TSX, [SCRIPT], {
    encoding: "utf8",
    env: {
      ...process.env,
      CHECK_WHATS_NEW_APP_JSON_PATH: path.join(FIXTURES, appJsonFile),
      CHECK_WHATS_NEW_WHATS_NEW_PATH: path.join(FIXTURES, whatsNewFile),
    },
  });
  return {
    status: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
  };
}

// ---------------------------------------------------------------------------
// Integration tests — exercise the script as a real process
// ---------------------------------------------------------------------------

// tsx subprocess startup can take a few seconds — allow up to 20s per test.
const CLI_TIMEOUT = 20_000;

describe("check-whats-new script — CLI exit codes", () => {
  it(
    "exits 0 when the version in app.json has a matching entry in whatsNew.ts",
    () => {
      const { status, stdout } = runScript(
        "app-covered.json",
        "whatsNew-with-1-0-1.ts",
      );
      expect(status).toBe(0);
      expect(stdout).toContain("good to ship");
    },
    CLI_TIMEOUT,
  );

  it(
    "exits 1 when the version in app.json has no matching entry in whatsNew.ts",
    () => {
      const { status, stderr } = runScript(
        "app-missing.json",
        "whatsNew-with-1-0-1.ts",
      );
      expect(status).toBe(1);
      expect(stderr).toContain("9.9.9");
      expect(stderr).toContain("whatsNew.ts");
    },
    CLI_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// Unit tests — pure validation logic (fast, no subprocess)
// ---------------------------------------------------------------------------

describe("checkWhatsNew — passing cases", () => {
  it("returns ok=true when the version key exists with double quotes", () => {
    const result = checkWhatsNew(makeAppJson("1.0.1"), WHATS_NEW_WITH_1_0_1);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("1.0.1");
    expect(result.message).toContain("good to ship");
  });

  it("returns ok=true when the key uses single quotes in the source file", () => {
    const whatsNewSingleQuote = `
export const WHATS_NEW = {
  '2.0.0': {
    headline: "Two point oh",
    items: [],
  },
};
`;
    const result = checkWhatsNew(makeAppJson("2.0.0"), whatsNewSingleQuote);
    expect(result.ok).toBe(true);
  });

  it("returns ok=true when there is extra whitespace around the key", () => {
    const whatsNewSpaced = `
export const WHATS_NEW = {
  " 3.1.4 " : {
    headline: "Padded key",
    items: [],
  },
};
`;
    const result = checkWhatsNew(makeAppJson("3.1.4"), whatsNewSpaced);
    expect(result.ok).toBe(true);
  });
});

describe("checkWhatsNew — failing cases", () => {
  it("returns ok=false when the version has no matching key", () => {
    const result = checkWhatsNew(makeAppJson("1.0.2"), WHATS_NEW_WITHOUT_1_0_2);
    expect(result.ok).toBe(false);
  });

  it("includes the missing version number in the error message", () => {
    const result = checkWhatsNew(makeAppJson("1.0.2"), WHATS_NEW_WITHOUT_1_0_2);
    expect(result.message).toContain("1.0.2");
  });

  it("includes actionable fix instructions in the error message", () => {
    const result = checkWhatsNew(makeAppJson("1.0.2"), WHATS_NEW_WITHOUT_1_0_2);
    expect(result.message).toContain("whatsNew.ts");
    expect(result.message).toContain("check-whats-new");
  });

  it("returns ok=false when expo.version is absent from app.json", () => {
    const noVersion = JSON.stringify({ expo: {} });
    const result = checkWhatsNew(noVersion, WHATS_NEW_WITH_1_0_1);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("expo.version");
  });

  it("returns ok=false when app.json is invalid JSON", () => {
    const result = checkWhatsNew("not-json", WHATS_NEW_WITH_1_0_1);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("not valid JSON");
  });

  it("does not false-positive on a version that is only a substring of an existing key", () => {
    const result = checkWhatsNew(makeAppJson("1.0"), WHATS_NEW_WITH_1_0_1);
    expect(result.ok).toBe(false);
  });
});
