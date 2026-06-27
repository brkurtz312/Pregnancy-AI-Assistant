import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
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

  it(
    "exits 1 when app.json contains invalid JSON — blocks release",
    () => {
      const { status, stderr } = runScript(
        "app-invalid.txt",
        "whatsNew-with-1-0-1.ts",
      );
      expect(status).toBe(1);
      expect(stderr).toMatch(/not valid JSON/i);
    },
    CLI_TIMEOUT,
  );

  it(
    "exits 1 when expo.version is absent from app.json — blocks release",
    () => {
      const { status, stderr } = runScript(
        "app-no-version.json",
        "whatsNew-with-1-0-1.ts",
      );
      expect(status).toBe(1);
      expect(stderr).toMatch(/missing or empty/i);
    },
    CLI_TIMEOUT,
  );

  it(
    "exits 1 when whatsNew.ts defines no versions at all — blocks release",
    () => {
      const { status, stderr } = runScript(
        "app-covered.json",
        "whatsNew-empty.ts",
      );
      expect(status).toBe(1);
      expect(stderr).toContain("1.0.1");
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

// ---------------------------------------------------------------------------
// Hook command path — exercises the exact command the git hook and EAS use
// ---------------------------------------------------------------------------
// This proves that `pnpm --filter @workspace/scripts run check-whats-new`
// (not just tsx directly) returns a non-zero exit code when the version in
// app.json has no matching WHATS_NEW entry, so the git pre-commit hook and
// the EAS prebuildCommand both block the release as intended.

const PNPM_TIMEOUT = 45_000;
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");

describe("check-whats-new — pnpm script command (hook path)", () => {
  it(
    "exits 1 via `pnpm --filter @workspace/scripts run check-whats-new` when version has no matching whatsNew entry",
    () => {
      const result = spawnSync(
        "pnpm",
        ["--filter", "@workspace/scripts", "run", "check-whats-new"],
        {
          encoding: "utf8",
          cwd: WORKSPACE_ROOT,
          env: {
            ...process.env,
            CHECK_WHATS_NEW_APP_JSON_PATH: path.join(
              FIXTURES,
              "app-missing.json",
            ),
            CHECK_WHATS_NEW_WHATS_NEW_PATH: path.join(
              FIXTURES,
              "whatsNew-with-1-0-1.ts",
            ),
          },
        },
      );
      expect(result.status).toBe(1);
      const combined = (result.stdout ?? "") + (result.stderr ?? "");
      expect(combined).toContain("9.9.9");
    },
    PNPM_TIMEOUT,
  );

  it(
    "exits 0 via `pnpm --filter @workspace/scripts run check-whats-new` when version has a matching whatsNew entry",
    () => {
      const result = spawnSync(
        "pnpm",
        ["--filter", "@workspace/scripts", "run", "check-whats-new"],
        {
          encoding: "utf8",
          cwd: WORKSPACE_ROOT,
          env: {
            ...process.env,
            CHECK_WHATS_NEW_APP_JSON_PATH: path.join(
              FIXTURES,
              "app-covered.json",
            ),
            CHECK_WHATS_NEW_WHATS_NEW_PATH: path.join(
              FIXTURES,
              "whatsNew-with-1-0-1.ts",
            ),
          },
        },
      );
      expect(result.status).toBe(0);
    },
    PNPM_TIMEOUT,
  );
});

// ---------------------------------------------------------------------------
// eas.json regression guard — prebuildCommand must name the correct script
// ---------------------------------------------------------------------------

const EAS_JSON = path.join(
  WORKSPACE_ROOT,
  "artifacts/pregnancy-calculator-mobile/eas.json",
);
const EXPECTED_PREBULD_COMMAND =
  "pnpm --filter @workspace/scripts run check-whats-new";

describe("eas.json — prebuildCommand regression guard", () => {
  it("production build profile defines a prebuildCommand", () => {
    const raw = fs.readFileSync(EAS_JSON, "utf8");
    const eas = JSON.parse(raw);
    expect(eas?.build?.production?.prebuildCommand).toBeDefined();
  });

  it("production prebuildCommand runs the check-whats-new script", () => {
    const raw = fs.readFileSync(EAS_JSON, "utf8");
    const eas = JSON.parse(raw);
    const cmd: string = eas?.build?.production?.prebuildCommand ?? "";
    expect(cmd).toBe(EXPECTED_PREBULD_COMMAND);
  });
});

// ---------------------------------------------------------------------------
// Real-repo integration — validates the actual app.json + whatsNew.ts pair
// ---------------------------------------------------------------------------
// This test is the early-warning gate: if a developer bumps expo.version in
// app.json without adding the matching WHATS_NEW key, this test fails in the
// normal test suite long before EAS build time.

const REPO_ROOT = path.resolve(__dirname, "../..");
const REAL_APP_JSON = path.join(
  REPO_ROOT,
  "artifacts/pregnancy-calculator-mobile/app.json",
);
const REAL_WHATS_NEW = path.join(
  REPO_ROOT,
  "artifacts/pregnancy-calculator-mobile/constants/whatsNew.ts",
);

describe("check-whats-new — real repo files", () => {
  it("app.json version has a matching entry in constants/whatsNew.ts", () => {
    const appJsonContent = fs.readFileSync(REAL_APP_JSON, "utf8");
    const whatsNewContent = fs.readFileSync(REAL_WHATS_NEW, "utf8");
    const result = checkWhatsNew(appJsonContent, whatsNewContent);
    expect(result.ok, result.message).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Git hook smoke test — end-to-end: hook registration + commit blocking
// ---------------------------------------------------------------------------
// Creates a temporary git repo, installs the pre-commit hook via the same
// `git config core.hooksPath` mechanism as `pnpm run install-hooks`, then
// asserts that `git commit` is blocked when the app.json version has no
// matching WHATS_NEW entry, and allowed when the version is covered.
//
// The hook in the temp repo delegates to the real workspace script via pnpm,
// using env vars to redirect it at fixture files — so the test exercises the
// full git → hook → pnpm → check-whats-new chain without modifying the real
// repository.

const HOOK_SMOKE_TIMEOUT = 60_000;

function makeHookScript(appJsonFixture: string, whatsNewFixture: string): string {
  return [
    "#!/usr/bin/env sh",
    `cd "${WORKSPACE_ROOT}"`,
    `export CHECK_WHATS_NEW_APP_JSON_PATH="${path.join(FIXTURES, appJsonFixture)}"`,
    `export CHECK_WHATS_NEW_WHATS_NEW_PATH="${path.join(FIXTURES, whatsNewFixture)}"`,
    `pnpm --filter @workspace/scripts run check-whats-new`,
    "",
  ].join("\n");
}

describe("pre-commit hook — git integration smoke test", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "whats-new-hook-"));

    spawnSync("git", ["init"], { cwd: tmpDir, encoding: "utf8" });
    spawnSync("git", ["config", "user.email", "test@example.com"], {
      cwd: tmpDir,
      encoding: "utf8",
    });
    spawnSync("git", ["config", "user.name", "Test User"], {
      cwd: tmpDir,
      encoding: "utf8",
    });

    // Mirror the real `.githooks/` layout: one directory, one hook file.
    const hooksDir = path.join(tmpDir, ".githooks");
    fs.mkdirSync(hooksDir);
    fs.writeFileSync(
      path.join(hooksDir, "pre-commit"),
      makeHookScript("app-missing.json", "whatsNew-with-1-0-1.ts"),
      { mode: 0o755 },
    );

    // Install via the same mechanism as `pnpm run install-hooks`.
    spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
      cwd: tmpDir,
      encoding: "utf8",
    });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("hook file exists at .githooks/pre-commit after installation", () => {
    const hookPath = path.join(tmpDir, ".githooks", "pre-commit");
    expect(fs.existsSync(hookPath)).toBe(true);
    const stat = fs.statSync(hookPath);
    // verify it is executable by the owner
    expect(stat.mode & 0o100).not.toBe(0);
  });

  it(
    "git commit exits non-zero when app.json version is missing from whatsNew.ts",
    () => {
      fs.writeFileSync(path.join(tmpDir, "dummy.txt"), "test");
      spawnSync("git", ["add", "dummy.txt"], { cwd: tmpDir, encoding: "utf8" });

      const result = spawnSync("git", ["commit", "-m", "bump version"], {
        cwd: tmpDir,
        encoding: "utf8",
      });

      expect(result.status).not.toBe(0);
    },
    HOOK_SMOKE_TIMEOUT,
  );

  it(
    "git commit succeeds when app.json version has a matching whatsNew entry",
    () => {
      // Replace the hook with one that points at the covered fixture.
      fs.writeFileSync(
        path.join(tmpDir, ".githooks", "pre-commit"),
        makeHookScript("app-covered.json", "whatsNew-with-1-0-1.ts"),
        { mode: 0o755 },
      );

      fs.writeFileSync(path.join(tmpDir, "dummy.txt"), "test");
      spawnSync("git", ["add", "dummy.txt"], { cwd: tmpDir, encoding: "utf8" });

      const result = spawnSync("git", ["commit", "-m", "covered version"], {
        cwd: tmpDir,
        encoding: "utf8",
      });

      expect(result.status).toBe(0);
    },
    HOOK_SMOKE_TIMEOUT,
  );
});
