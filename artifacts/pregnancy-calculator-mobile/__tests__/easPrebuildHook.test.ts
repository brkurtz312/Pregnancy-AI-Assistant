/**
 * easPrebuildHook.test.ts
 *
 * Confirms that the `eas-build-pre-install` npm lifecycle hook correctly
 * propagates a non-zero exit code to EAS when provisioning is misconfigured.
 *
 * ## Strategy
 *
 * 1. Read the `eas-build-pre-install` script value directly from package.json.
 * 2. Assert it is EXACTLY the expected direct-node command with no shell
 *    constructs that could swallow a non-zero exit code.
 * 3. Execute that exact command string (parsed from package.json, not
 *    hard-coded here) in a temp directory that contains:
 *      - fixture app.json / eas.json files
 *      - the real scripts/validate-eas-provisioning.js copied verbatim
 *    Because __dirname inside the script resolves to <tmpDir>/scripts/ and
 *    path.resolve(__dirname, "..") resolves to <tmpDir>/, the script
 *    naturally picks up the fixture config files without any source patching.
 *
 * This means:
 *  - If the hook command were changed to `node scripts/... || :` or wrapped
 *    in any exit-code-swallowing shell construct, the wiring assertions would
 *    catch it before the runtime tests even run.
 *  - The runtime tests run the identical command that EAS runs, so they
 *    faithfully prove hook → exit-code propagation.
 *
 * ## How EAS lifecycle hooks propagate exit codes
 *
 * EAS calls `eas-build-pre-install` exactly like `pnpm run eas-build-pre-install`.
 * pnpm propagates the exit code of the underlying process verbatim: if it exits
 * non-zero, pnpm exits non-zero and EAS aborts the build immediately.
 */

import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

const MOBILE_ROOT = path.resolve(__dirname, "..");
const PACKAGE_JSON_PATH = path.join(MOBILE_ROOT, "package.json");
const REAL_SCRIPT_PATH = path.join(
  MOBILE_ROOT,
  "scripts",
  "validate-eas-provisioning.js",
);

/** The only form the hook command is allowed to take. */
const SAFE_HOOK_COMMAND = "node scripts/validate-eas-provisioning.js";

// ── fixtures ──────────────────────────────────────────────────────────────────

const VALID_APP_JSON = {
  expo: {
    name: "Test App",
    slug: "test-app",
    version: "1.0.0",
    ios: { bundleIdentifier: "com.example.testapp" },
    plugins: ["./plugins/withWatchExtension"],
    extra: {
      eas: {
        projectId: "test-project-id",
        build: {
          experimental: {
            ios: {
              appExtensions: [
                {
                  targetName: "TestWatchApp",
                  bundleIdentifier: "com.example.testapp.watchapp",
                  entitlements: {
                    "com.apple.security.application-groups": [
                      "group.com.example.testapp",
                    ],
                  },
                },
              ],
            },
          },
        },
      },
    },
  },
};

const VALID_EAS_JSON = {
  cli: { version: ">= 21.4.0" },
  build: {
    production: {
      channel: "production",
      ios: { credentialsSource: "remote" },
    },
  },
};

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Run the hook command (read verbatim from package.json) in a temp directory
 * that contains the given fixture files and the real validator script.
 *
 * The temp directory layout mirrors the mobile package root:
 *   <tmpDir>/app.json          ← fixture
 *   <tmpDir>/eas.json          ← fixture
 *   <tmpDir>/scripts/validate-eas-provisioning.js  ← real script (copied)
 *
 * Running `node scripts/validate-eas-provisioning.js` from <tmpDir> means:
 *   __dirname  === <tmpDir>/scripts
 *   ROOT       === path.resolve(__dirname, "..") === <tmpDir>
 * so the script reads the fixture files naturally, with no source patching.
 */
function runHookCommandFromPackageJson(
  appJson: object,
  easJson: object,
): { hookCommand: string; exitCode: number; stdout: string; stderr: string } {
  // Read the command the hook actually declares — this is what EAS runs.
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
  const hookCommand: string = pkg.scripts["eas-build-pre-install"];

  const tmpDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "eas-prebuild-hook-test-"),
  );

  try {
    // Fixture config files at the package root level.
    fs.writeFileSync(
      path.join(tmpDir, "app.json"),
      JSON.stringify(appJson, null, 2),
    );
    fs.writeFileSync(
      path.join(tmpDir, "eas.json"),
      JSON.stringify(easJson, null, 2),
    );

    // Real script at scripts/ so `node scripts/validate-eas-provisioning.js`
    // resolves and __dirname points at <tmpDir>/scripts/.
    const scriptsDir = path.join(tmpDir, "scripts");
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(
      REAL_SCRIPT_PATH,
      path.join(scriptsDir, "validate-eas-provisioning.js"),
    );

    // Execute the exact command string declared in package.json.
    const [cmd, ...args] = hookCommand.split(/\s+/);
    const result = spawnSync(cmd, args, {
      cwd: tmpDir,
      encoding: "utf8",
      timeout: 10_000,
    });

    return {
      hookCommand,
      exitCode: result.status ?? 1,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
    };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// ── hook wiring tests ─────────────────────────────────────────────────────────

describe("eas-build-pre-install hook wiring", () => {
  let pkg: Record<string, unknown>;
  let hookCommand: string;

  beforeAll(() => {
    pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, "utf8"));
    hookCommand = (pkg.scripts as Record<string, string>)[
      "eas-build-pre-install"
    ];
  });

  it("package.json declares the eas-build-pre-install hook", () => {
    expect(hookCommand).toBeDefined();
    expect(typeof hookCommand).toBe("string");
  });

  it(`hook command is exactly "${SAFE_HOOK_COMMAND}" — no exit-code-swallowing constructs`, () => {
    // Exact equality: any change to add `|| :`, `|| true`, `; true`,
    // `&& exit 0`, `2>/dev/null`, or a wrapper script would be caught here.
    expect(hookCommand).toBe(SAFE_HOOK_COMMAND);
  });

  it("validate-eas-provisioning.js exists at the path the hook references", () => {
    expect(fs.existsSync(REAL_SCRIPT_PATH)).toBe(true);
  });
});

// ── exit-code propagation tests ───────────────────────────────────────────────
//
// Each test runs the exact hook command from package.json in a temp directory
// with the real script copied in place.  This proves the hook → exit-code
// propagation path end-to-end.

describe("exit-code propagation — hook command exits non-zero on misconfiguration", () => {
  it("exits 0 for a fully valid configuration (baseline)", () => {
    const { exitCode, stdout } = runHookCommandFromPackageJson(
      VALID_APP_JSON,
      VALID_EAS_JSON,
    );
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/All \d+ checks passed/);
  });

  it("exits 1 when appExtensions is empty (Watch profile not provisioned)", () => {
    const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
    appJson.expo.extra.eas.build.experimental.ios.appExtensions = [];

    const { exitCode, stderr } = runHookCommandFromPackageJson(
      appJson,
      VALID_EAS_JSON,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/appExtensions is empty/i);
  });

  it("exits 1 when ios.bundleIdentifier is missing from app.json", () => {
    const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
    delete appJson.expo.ios.bundleIdentifier;

    const { exitCode, stderr } = runHookCommandFromPackageJson(
      appJson,
      VALID_EAS_JSON,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/ios\.bundleIdentifier/i);
  });

  it("exits 1 when Watch bundle identifier does not match the expected pattern", () => {
    const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
    appJson.expo.extra.eas.build.experimental.ios.appExtensions[0].bundleIdentifier =
      "com.example.testapp.WRONG";

    const { exitCode, stderr } = runHookCommandFromPackageJson(
      appJson,
      VALID_EAS_JSON,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/No appExtension with bundleIdentifier/i);
  });

  it("exits 1 when credentialsSource is not 'remote'", () => {
    const easJson = JSON.parse(JSON.stringify(VALID_EAS_JSON));
    easJson.build.production.ios.credentialsSource = "local";

    const { exitCode, stderr } = runHookCommandFromPackageJson(
      VALID_APP_JSON,
      easJson,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/credentialsSource/i);
  });

  it("exits 1 when withWatchExtension plugin is not registered", () => {
    const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
    appJson.expo.plugins = [];

    const { exitCode, stderr } = runHookCommandFromPackageJson(
      appJson,
      VALID_EAS_JSON,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/withWatchExtension/i);
  });

  it("exits 1 when the App Group entitlement is absent", () => {
    const appJson = JSON.parse(JSON.stringify(VALID_APP_JSON));
    delete appJson.expo.extra.eas.build.experimental.ios.appExtensions[0]
      .entitlements;

    const { exitCode, stderr } = runHookCommandFromPackageJson(
      appJson,
      VALID_EAS_JSON,
    );
    expect(exitCode).toBe(1);
    expect(stderr).toMatch(/App Group/i);
  });
});
