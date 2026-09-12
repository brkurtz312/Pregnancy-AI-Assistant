/**
 * withWatchExtension-embedScript.test.ts
 *
 * Verifies the 'Embed Watch App' PBXShellScriptBuildPhase injected by
 * addEmbedWatchShellScript() in withWatchExtension.js.
 *
 * EAS archive builds cannot run inside this environment (no macOS / Xcode),
 * so this suite provides the next best thing:
 *
 *   1. Content checks     — the exported EMBED_WATCH_SHELL_SCRIPT_LINES has
 *                           the correct OBJROOT path, fallback find, dest path,
 *                           and error-exit guard.
 *   2. Bash syntax check  — `bash -n` validates the script is parse-clean.
 *   3. Simulation tests   — run the real bash script on Linux against a mock
 *                           archive filesystem; confirm Watch app lands at the
 *                           expected Payload/…/Watch/ path in all cases:
 *                             a) primary path (OBJROOT/UninstalledProducts/watchos/)
 *                             b) fallback path (find(1) locates it elsewhere)
 *                             c) error path  (no Watch app → exit 1)
 *   4. Static pbxproj     — the committed ios/ pbxproj contains the phase
 *                           with the correct script content and output path
 *                           declaration.
 */

import fs from "fs";
import os from "os";
import path from "path";
import { execFileSync } from "child_process";

// The EAS IPA describe group may download ~46 MB — allow up to 3 minutes.
jest.setTimeout(180_000);

// ─── Plugin under test ───────────────────────────────────────────────────────

const plugin = require("../withWatchExtension");
const {
  EMBED_WATCH_SHELL_SCRIPT_LINES,
  addEmbedWatchShellScript,
} = plugin._internals as {
  EMBED_WATCH_SHELL_SCRIPT_LINES: string[];
  addEmbedWatchShellScript: (project: MinimalProject) => void;
};

// ─── Minimal project fixture type ────────────────────────────────────────────

/**
 * Minimal shape that addEmbedWatchShellScript() accesses.
 * Mirrors the xcode library's PBXProject interface at the call sites used
 * by the function, without depending on a real .xcodeproj file.
 */
interface MinimalTarget {
  productType: string;
  name: string;
  buildPhases: Array<{ value: string; comment: string }>;
}

interface MinimalProject {
  pbxNativeTargetSection: () => Record<string, MinimalTarget | string>;
  hash: { project: { objects: Record<string, unknown> } };
  generateUuid: () => string;
}

/**
 * Build a minimal project fixture that satisfies addEmbedWatchShellScript.
 * The main app target is identified by its productType, matching the real
 * findMainAppTargetUuid() logic inside withWatchExtension.js.
 */
function makeMinimalProject(): MinimalProject {
  let counter = 0;
  const objects: Record<string, unknown> = {};
  const mainTargetUuid = "AAAA000000000001";
  const mainTarget: MinimalTarget = {
    productType: '"com.apple.product-type.application"',
    name: '"TestApp"',
    buildPhases: [],
  };
  // NativeTargetSection must include both the target and its _comment entry.
  const nts: Record<string, MinimalTarget | string> = {
    [mainTargetUuid]: mainTarget,
    [`${mainTargetUuid}_comment`]: "TestApp",
  };
  return {
    pbxNativeTargetSection: () => nts,
    hash: { project: { objects } },
    generateUuid: () => `FIXTURE${String(++counter).padStart(10, "0")}`,
  };
}

// ─── Paths ───────────────────────────────────────────────────────────────────

const PBXPROJ_PATH = path.resolve(
  __dirname,
  "../../ios/PregnancyAIAssistant.xcodeproj/project.pbxproj",
);

// ─── Helper ──────────────────────────────────────────────────────────────────

/** Reconstruct the actual bash script the way addEmbedWatchShellScript does. */
function buildScript(lines: string[]): string {
  return lines.join("\n");
}

// ─── 1. Content checks ───────────────────────────────────────────────────────

describe("EMBED_WATCH_SHELL_SCRIPT_LINES — content checks", () => {
  let script: string;

  beforeAll(() => {
    script = buildScript(EMBED_WATCH_SHELL_SCRIPT_LINES);
  });

  it("is exported as a non-empty array from _internals", () => {
    expect(Array.isArray(EMBED_WATCH_SHELL_SCRIPT_LINES)).toBe(true);
    expect(EMBED_WATCH_SHELL_SCRIPT_LINES.length).toBeGreaterThan(0);
  });

  it("starts with #!/bin/bash and set -e (errors stop the script)", () => {
    expect(EMBED_WATCH_SHELL_SCRIPT_LINES[0]).toBe("#!/bin/bash");
    expect(EMBED_WATCH_SHELL_SCRIPT_LINES[1]).toBe("set -e");
  });

  it("sets WATCH_APP_NAME to PregnancyWatchApp", () => {
    expect(script).toContain("WATCH_APP_NAME=PregnancyWatchApp");
  });

  it("looks for Watch app in OBJROOT/UninstalledProducts/watchos/ (SKIP_INSTALL=YES path)", () => {
    // This is the critical path: SKIP_INSTALL=YES targets land here during
    // an archive build — NOT in BUILT_PRODUCTS_DIR.
    expect(script).toContain(
      "WATCH_SRC=${OBJROOT}/UninstalledProducts/watchos/${WATCH_APP_NAME}.app",
    );
  });

  it("has a fallback find command that searches under dirname(OBJROOT)", () => {
    // If the primary path doesn't exist the script falls back to find(1).
    // dirname(OBJROOT) covers sibling build directories Xcode may use.
    expect(script).toMatch(
      /find \$\(dirname \$\{OBJROOT\}\).*-name \$\{WATCH_APP_NAME\}\.app/,
    );
  });

  it("fallback find excludes paths inside the main app bundle (avoids re-embedding)", () => {
    // Shell concatenation '*/'${WRAPPER_NAME}'/*' lets bash expand ${WRAPPER_NAME}
    // while keeping the glob characters literal — single-quoting '*/${WRAPPER_NAME}/*'
    // would prevent expansion and the exclusion would never fire.
    expect(script).toContain("-not -path '*/'${WRAPPER_NAME}'/*'");
  });

  it("exits with error if Watch app cannot be located", () => {
    // Both empty-string and missing-directory cases must bail out.
    expect(script).toContain(
      "if [ -z ${WATCH_SRC} ] || [ ! -d ${WATCH_SRC} ]; then",
    );
    expect(script).toContain("exit 1");
  });

  it("copies Watch app to BUILT_PRODUCTS_DIR/WRAPPER_NAME/Watch/ (correct embed destination)", () => {
    expect(script).toContain(
      "WATCH_DEST=${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}/Watch",
    );
    expect(script).toContain("cp -R ${WATCH_SRC} ${WATCH_DEST}/");
  });

  it("injects icon PNGs from SRCROOT/PregnancyWatchApp into the embedded bundle", () => {
    expect(script).toContain("ICON_SRC=${SRCROOT}/PregnancyWatchApp");
    expect(script).toContain(
      "ICON_DEST=${WATCH_DEST}/${WATCH_APP_NAME}.app",
    );
    // Spot-check a few icon sizes
    expect(script).toContain("AppIcon-58.png");
    expect(script).toContain("AppIcon-1024.png");
  });

  it("does not contain literal double-quote characters inside the script body", () => {
    // Double-quotes inside pbxproj string values require escaping.  The script
    // body intentionally avoids them; if one is introduced it will corrupt
    // the pbxproj string value when written by addEmbedWatchShellScript.
    const bodyLines = EMBED_WATCH_SHELL_SCRIPT_LINES.slice(1); // skip shebang
    for (const line of bodyLines) {
      expect(line).not.toContain('"');
    }
  });
});

// ─── 2. Bash syntax check ────────────────────────────────────────────────────

describe("bash syntax validation", () => {
  it("passes bash -n (no parse errors)", () => {
    const tmpFile = path.join(os.tmpdir(), "embed-watch-app-syntax-check.sh");
    const script = buildScript(EMBED_WATCH_SHELL_SCRIPT_LINES);
    fs.writeFileSync(tmpFile, script, "utf8");
    try {
      execFileSync("bash", ["-n", tmpFile], { stdio: "pipe" });
    } catch (err: unknown) {
      const e = err as { stderr?: Buffer; message?: string };
      throw new Error(
        `bash -n reported syntax error:\n${e.stderr?.toString() ?? e.message ?? String(err)}`,
      );
    } finally {
      fs.rmSync(tmpFile, { force: true });
    }
  });
});

// ─── 3. Simulation tests (Linux mock archive filesystem) ─────────────────────

/**
 * Run the embed script in a controlled temp directory.
 *
 * Sets the Xcode env vars (OBJROOT, BUILT_PRODUCTS_DIR, WRAPPER_NAME, SRCROOT)
 * to paths inside tmpDir, then runs the script and returns its exit code plus
 * stdout/stderr.
 */
function runScript(
  tmpDir: string,
  env: Record<string, string>,
): { exitCode: number; stdout: string; stderr: string } {
  const scriptPath = path.join(tmpDir, "embed-watch.sh");
  const script = buildScript(EMBED_WATCH_SHELL_SCRIPT_LINES);
  fs.writeFileSync(scriptPath, script, { mode: 0o755 });

  try {
    const stdout = execFileSync("bash", [scriptPath], {
      env: { ...process.env, ...env },
      stdio: "pipe",
    }).toString();
    return { exitCode: 0, stdout, stderr: "" };
  } catch (err: unknown) {
    const e = err as { status?: number; stdout?: Buffer; stderr?: Buffer };
    return {
      exitCode: e.status ?? 1,
      stdout: e.stdout?.toString() ?? "",
      stderr: e.stderr?.toString() ?? "",
    };
  }
}

describe("simulation — primary OBJROOT path (SKIP_INSTALL=YES archive layout)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eas-archive-sim-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies PregnancyWatchApp.app to BUILT_PRODUCTS_DIR/WRAPPER_NAME/Watch/", () => {
    // Mock the OBJROOT/UninstalledProducts/watchos/PregnancyWatchApp.app directory
    const watchAppSrc = path.join(
      tmpDir,
      "OBJROOT/UninstalledProducts/watchos/PregnancyWatchApp.app",
    );
    fs.mkdirSync(watchAppSrc, { recursive: true });
    fs.writeFileSync(path.join(watchAppSrc, "Info.plist"), "<plist/>");

    const builtProductsDir = path.join(tmpDir, "BUILT_PRODUCTS_DIR");
    const wrapperName = "PregnancyAIAssistant.app";
    const srcroot = path.join(tmpDir, "SRCROOT");
    // No icons in SRCROOT — script should warn but not fail (set -e applies to
    // cp, not to echo-warning path)
    fs.mkdirSync(srcroot, { recursive: true });

    const result = runScript(tmpDir, {
      OBJROOT: path.join(tmpDir, "OBJROOT"),
      BUILT_PRODUCTS_DIR: builtProductsDir,
      WRAPPER_NAME: wrapperName,
      SRCROOT: srcroot,
    });

    expect(result.exitCode).toBe(0);

    const expectedDest = path.join(
      builtProductsDir,
      wrapperName,
      "Watch",
      "PregnancyWatchApp.app",
    );
    expect(fs.existsSync(expectedDest)).toBe(true);
    // Confirm the content was copied, not just the directory created
    expect(fs.existsSync(path.join(expectedDest, "Info.plist"))).toBe(true);
  });

  it("injects icon PNGs into the embedded Watch bundle when they exist in SRCROOT", () => {
    const watchAppSrc = path.join(
      tmpDir,
      "OBJROOT/UninstalledProducts/watchos/PregnancyWatchApp.app",
    );
    fs.mkdirSync(watchAppSrc, { recursive: true });

    const builtProductsDir = path.join(tmpDir, "BUILT_PRODUCTS_DIR");
    const wrapperName = "PregnancyAIAssistant.app";
    const srcroot = path.join(tmpDir, "SRCROOT");
    const iconSrc = path.join(srcroot, "PregnancyWatchApp");
    fs.mkdirSync(iconSrc, { recursive: true });
    // Seed a couple of icons
    fs.writeFileSync(path.join(iconSrc, "AppIcon-58.png"), "PNG58");
    fs.writeFileSync(path.join(iconSrc, "AppIcon-1024.png"), "PNG1024");

    const result = runScript(tmpDir, {
      OBJROOT: path.join(tmpDir, "OBJROOT"),
      BUILT_PRODUCTS_DIR: builtProductsDir,
      WRAPPER_NAME: wrapperName,
      SRCROOT: srcroot,
    });

    expect(result.exitCode).toBe(0);

    const iconDest = path.join(
      builtProductsDir,
      wrapperName,
      "Watch",
      "PregnancyWatchApp.app",
    );
    expect(
      fs.readFileSync(path.join(iconDest, "AppIcon-58.png"), "utf8"),
    ).toBe("PNG58");
    expect(
      fs.readFileSync(path.join(iconDest, "AppIcon-1024.png"), "utf8"),
    ).toBe("PNG1024");
  });
});

describe("simulation — fallback find path", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eas-archive-sim-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("falls back to find(1) when primary OBJROOT path is absent", () => {
    // Primary path does NOT exist — the script must use find(1).
    // Place the Watch app somewhere else under dirname(OBJROOT).
    const objroot = path.join(tmpDir, "OBJROOT");
    fs.mkdirSync(objroot, { recursive: true }); // exists, but no UninstalledProducts/

    // Xcode sometimes puts build products in a sibling dir.
    const altPath = path.join(
      tmpDir,
      "OBJROOT/Build/Products/Release-watchos/PregnancyWatchApp.app",
    );
    fs.mkdirSync(altPath, { recursive: true });
    fs.writeFileSync(path.join(altPath, "Info.plist"), "<plist/>");

    const builtProductsDir = path.join(tmpDir, "BUILT_PRODUCTS_DIR");
    const wrapperName = "PregnancyAIAssistant.app";
    const srcroot = path.join(tmpDir, "SRCROOT");
    fs.mkdirSync(srcroot, { recursive: true });

    const result = runScript(tmpDir, {
      OBJROOT: objroot,
      BUILT_PRODUCTS_DIR: builtProductsDir,
      WRAPPER_NAME: wrapperName,
      SRCROOT: srcroot,
    });

    expect(result.exitCode).toBe(0);

    const expectedDest = path.join(
      builtProductsDir,
      wrapperName,
      "Watch",
      "PregnancyWatchApp.app",
    );
    expect(fs.existsSync(expectedDest)).toBe(true);
  });
});

describe("simulation — fallback find exclusion (re-embed prevention)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eas-archive-sim-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("copies from the original source, not from the already-embedded copy inside WRAPPER_NAME", () => {
    // Simulate a second build where the Watch app was already embedded in the
    // iOS app bundle from the first build.  The fallback find must NOT pick up
    // the already-embedded copy (which lives under WRAPPER_NAME/) and must
    // always use the real build-product source instead.

    const objroot = path.join(tmpDir, "OBJROOT");
    fs.mkdirSync(objroot, { recursive: true }); // exists, but no UninstalledProducts/

    // Real source — Xcode put the Watch app here for this build.
    const realSrc = path.join(
      tmpDir,
      "OBJROOT/Build/Products/Release-watchos/PregnancyWatchApp.app",
    );
    fs.mkdirSync(realSrc, { recursive: true });
    fs.writeFileSync(path.join(realSrc, "Info.plist"), "REAL-SOURCE");

    const builtProductsDir = path.join(tmpDir, "BUILT_PRODUCTS_DIR");
    const wrapperName = "PregnancyAIAssistant.app";
    const srcroot = path.join(tmpDir, "SRCROOT");
    fs.mkdirSync(srcroot, { recursive: true });

    // Pre-existing embedded copy from the first build — lives under WRAPPER_NAME/.
    // The -not -path '*/${WRAPPER_NAME}/*' exclusion must prevent find from
    // returning this path.  If it did, cp would overwrite the destination with
    // itself (or fail with a self-copy error).
    const embeddedCopy = path.join(
      builtProductsDir,
      wrapperName,
      "Watch",
      "PregnancyWatchApp.app",
    );
    fs.mkdirSync(embeddedCopy, { recursive: true });
    fs.writeFileSync(path.join(embeddedCopy, "Info.plist"), "ALREADY-EMBEDDED");

    const result = runScript(tmpDir, {
      OBJROOT: objroot,
      BUILT_PRODUCTS_DIR: builtProductsDir,
      WRAPPER_NAME: wrapperName,
      SRCROOT: srcroot,
    });

    expect(result.exitCode).toBe(0);

    // The Info.plist in the final destination must come from the real source,
    // not from the stale already-embedded copy.
    const destInfoPlist = path.join(embeddedCopy, "Info.plist");
    expect(fs.readFileSync(destInfoPlist, "utf8")).toBe("REAL-SOURCE");
  });

  it("exits with code 1 when only the already-embedded copy exists under WRAPPER_NAME (exclusion fires, no valid source found)", () => {
    // If the real source is gone but the already-embedded copy is still present,
    // the -not -path exclusion should filter it out entirely — leaving find
    // with zero matches — so the script bails out with exit 1 rather than
    // accidentally re-embedding from the already-embedded copy.

    const objroot = path.join(tmpDir, "OBJROOT");
    fs.mkdirSync(objroot, { recursive: true }); // no UninstalledProducts/

    const builtProductsDir = path.join(tmpDir, "BUILT_PRODUCTS_DIR");
    const wrapperName = "PregnancyAIAssistant.app";
    const srcroot = path.join(tmpDir, "SRCROOT");
    fs.mkdirSync(srcroot, { recursive: true });

    // Seed ONLY the already-embedded copy — the real source does not exist.
    const embeddedCopy = path.join(
      builtProductsDir,
      wrapperName,
      "Watch",
      "PregnancyWatchApp.app",
    );
    fs.mkdirSync(embeddedCopy, { recursive: true });
    fs.writeFileSync(path.join(embeddedCopy, "Info.plist"), "ALREADY-EMBEDDED");

    const result = runScript(tmpDir, {
      OBJROOT: objroot,
      BUILT_PRODUCTS_DIR: builtProductsDir,
      WRAPPER_NAME: wrapperName,
      SRCROOT: srcroot,
    });

    // The exclusion must filter out the embedded copy — no valid source found.
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Cannot locate PregnancyWatchApp.app");
  });
});

describe("simulation — error path (Watch app not found)", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "eas-archive-sim-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("exits with code 1 when PregnancyWatchApp.app cannot be located", () => {
    const objroot = path.join(tmpDir, "OBJROOT");
    fs.mkdirSync(objroot, { recursive: true });
    // No Watch app anywhere

    const builtProductsDir = path.join(tmpDir, "BUILT_PRODUCTS_DIR");
    const srcroot = path.join(tmpDir, "SRCROOT");
    fs.mkdirSync(srcroot, { recursive: true });

    const result = runScript(tmpDir, {
      OBJROOT: objroot,
      BUILT_PRODUCTS_DIR: builtProductsDir,
      WRAPPER_NAME: "PregnancyAIAssistant.app",
      SRCROOT: srcroot,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("Cannot locate PregnancyWatchApp.app");
  });

  it("does not create the Watch destination directory on failure", () => {
    const objroot = path.join(tmpDir, "OBJROOT");
    fs.mkdirSync(objroot, { recursive: true });

    const builtProductsDir = path.join(tmpDir, "BUILT_PRODUCTS_DIR");
    const wrapperName = "PregnancyAIAssistant.app";
    const srcroot = path.join(tmpDir, "SRCROOT");
    fs.mkdirSync(srcroot, { recursive: true });

    runScript(tmpDir, {
      OBJROOT: objroot,
      BUILT_PRODUCTS_DIR: builtProductsDir,
      WRAPPER_NAME: wrapperName,
      SRCROOT: srcroot,
    });

    // mkdir -p runs AFTER the guard, so Watch/ must not exist on error exit
    const watchDir = path.join(builtProductsDir, wrapperName, "Watch");
    expect(fs.existsSync(watchDir)).toBe(false);
  });
});

// ─── 3b. Plugin unit — generated phase fields (deterministic, no ios/ needed) ─

describe("addEmbedWatchShellScript — generated phase fields", () => {
  let project: MinimalProject;
  let generatedPhase: Record<string, unknown> | undefined;

  beforeAll(() => {
    project = makeMinimalProject();
    addEmbedWatchShellScript(project);
    const section = project.hash.project.objects[
      "PBXShellScriptBuildPhase"
    ] as Record<string, Record<string, unknown>> | undefined;
    // Find the Embed Watch App phase (first non-comment entry).
    generatedPhase = section
      ? Object.entries(section)
          .filter(([k]) => !k.endsWith("_comment"))
          .map(([, v]) => v)[0]
      : undefined;
  });

  it("addEmbedWatchShellScript is exported from _internals", () => {
    expect(typeof addEmbedWatchShellScript).toBe("function");
  });

  it("creates a PBXShellScriptBuildPhase on the project", () => {
    expect(generatedPhase).toBeDefined();
  });

  it("phase name is 'Embed Watch App'", () => {
    expect(generatedPhase?.name).toBe('"Embed Watch App"');
  });

  it("inputPaths contains the Watch app's OBJROOT/UninstalledProducts/watchos/ location", () => {
    // This entry lets Xcode skip the phase on incremental builds when
    // the Watch app hasn't changed.
    const inputPaths = generatedPhase?.inputPaths as string[] | undefined;
    expect(Array.isArray(inputPaths)).toBe(true);
    expect(inputPaths).toContain(
      '"$(OBJROOT)/UninstalledProducts/watchos/PregnancyWatchApp.app"',
    );
  });

  it("outputPaths contains the embedded Watch app destination", () => {
    const outputPaths = generatedPhase?.outputPaths as string[] | undefined;
    expect(Array.isArray(outputPaths)).toBe(true);
    expect(outputPaths).toContain(
      '"$(BUILT_PRODUCTS_DIR)/$(WRAPPER_NAME)/Watch/PregnancyWatchApp.app"',
    );
  });

  it("does not set alwaysOutOfDate (omitted means Xcode uses dependency tracking)", () => {
    // alwaysOutOfDate = 1 would force the phase to re-run on every build,
    // defeating the inputPaths/outputPaths optimisation.
    expect(Object.prototype.hasOwnProperty.call(generatedPhase, "alwaysOutOfDate")).toBe(false);
  });

  it("shellPath is /bin/bash", () => {
    expect(generatedPhase?.shellPath).toBe("/bin/bash");
  });

  it("phase is registered on the main app target's buildPhases", () => {
    // The main app target must reference the phase uuid so Xcode runs it.
    const nts = project.pbxNativeTargetSection();
    const mainTarget = Object.values(nts).find(
      (v): v is MinimalTarget =>
        typeof v === "object" &&
        (v as MinimalTarget).productType ===
          '"com.apple.product-type.application"',
    )!;
    expect(mainTarget.buildPhases.length).toBeGreaterThan(0);
    expect(
      mainTarget.buildPhases.some((ref) => ref.comment === "Embed Watch App"),
    ).toBe(true);
  });
});

// ─── 4. Static pbxproj check ─────────────────────────────────────────────────

// ios/ is a gitignored `expo prebuild` artifact, so it is absent on every clean
// checkout, including CI — there is no pbxproj to read. Skipping the block is
// what the tests below already intended ("a fresh clone without ios/ should not
// block CI"); the presence assertion hard-failed anyway. When someone has run
// `expo prebuild`, every check here runs exactly as before.
const describeIfPrebuilt = fs.existsSync(PBXPROJ_PATH) ? describe : describe.skip;

describeIfPrebuilt("committed ios/ pbxproj — Embed Watch App phase", () => {
  let pbxprojContent: string;
  let pbxprojExists: boolean;

  beforeAll(() => {
    pbxprojExists = fs.existsSync(PBXPROJ_PATH);
    pbxprojContent = pbxprojExists
      ? fs.readFileSync(PBXPROJ_PATH, "utf8")
      : "";
  });

  it("pbxproj is present (ios/ directory has been prebuilt)", () => {
    if (!pbxprojExists) {
      console.warn(
        `[WARN] ${PBXPROJ_PATH} not found — static pbxproj checks skipped.`,
      );
    }
    expect(pbxprojExists).toBe(true);
  });

  it("contains 'Embed Watch App' shell script phase", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    expect(pbxprojContent).toContain("Embed Watch App");
  });

  it("script references OBJROOT/UninstalledProducts/watchos/ path", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    expect(pbxprojContent).toContain(
      "WATCH_SRC=${OBJROOT}/UninstalledProducts/watchos/${WATCH_APP_NAME}.app",
    );
  });

  it("script references BUILT_PRODUCTS_DIR/WRAPPER_NAME/Watch destination", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    expect(pbxprojContent).toContain(
      "WATCH_DEST=${BUILT_PRODUCTS_DIR}/${WRAPPER_NAME}/Watch",
    );
  });

  it("declares the Watch app as an outputPath for incremental build correctness", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    // The PBXShellScriptBuildPhase outputPaths entry tells Xcode what the
    // script produces so it can skip the phase when the output is up-to-date.
    expect(pbxprojContent).toContain(
      "$(BUILT_PRODUCTS_DIR)/$(WRAPPER_NAME)/Watch/PregnancyWatchApp.app",
    );
  });

  it("script contains the fallback find command", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    expect(pbxprojContent).toMatch(
      /find \$\(dirname \$\{OBJROOT\}\).*-name \$\{WATCH_APP_NAME\}\.app/,
    );
  });

  it("fallback find uses shell concatenation so WRAPPER_NAME expands and the exclusion actually fires", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    // The exclusion '*/'${WRAPPER_NAME}'/*' lets bash expand ${WRAPPER_NAME}
    // at runtime.  The old form '*/${WRAPPER_NAME}/*' (fully single-quoted)
    // kept WRAPPER_NAME as a literal and the exclusion never matched anything.
    expect(pbxprojContent).toContain(
      "-not -path '*/'${WRAPPER_NAME}'/*'",
    );
  });

  it("script contains exit 1 guard for missing Watch app", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    expect(pbxprojContent).toContain("exit 1");
  });

  it("shellPath is /bin/bash", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    // pbxproj writes bare paths without string quotes: shellPath = /bin/bash;
    expect(pbxprojContent).toMatch(/shellPath = \/bin\/bash;/);
  });

  it("declares the Watch app source as an inputPath so Xcode can skip the phase when unchanged", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    // inputPaths + outputPaths let Xcode's dependency tracker skip the phase
    // on incremental builds when the Watch app hasn't changed.
    expect(pbxprojContent).toContain(
      "$(OBJROOT)/UninstalledProducts/watchos/PregnancyWatchApp.app",
    );
  });

  it("does not set alwaysOutOfDate = 1 on the Embed Watch App phase (would force the phase to run on every build)", () => {
    if (!pbxprojExists) { expect(true).toBe(true); return; }
    // alwaysOutOfDate = 1 defeats the inputPaths/outputPaths optimisation.
    // The phase must rely on Xcode's normal dependency tracking instead.
    // Scope the check to the Embed Watch App phase block only, since other
    // phases (e.g. Bundle React Native) legitimately use alwaysOutOfDate = 1.
    const embedBlockMatch = pbxprojContent.match(
      /\/\* Embed Watch App \*\/ = \{[\s\S]*?\};/,
    );
    expect(embedBlockMatch).not.toBeNull();
    const embedBlock = embedBlockMatch![0];
    expect(embedBlock).not.toMatch(/alwaysOutOfDate = 1/);
  });
});

// ─── 5. EAS archive IPA verification ─────────────────────────────────────────
//
// Uses scripts/verify-eas-archive.js to obtain and inspect a real IPA.
//
// Credential strategy:
//   • EXPO_TOKEN set  → script downloads the latest FINISHED production IPA
//     from EAS automatically, caches it at /tmp/eas-verify-app.ipa.
//     The test FAILS if the Watch app is missing — no soft skip.
//   • EXPO_TOKEN unset + cached /tmp/eas-verify-app.ipa exists → use cache.
//   • Neither available → single informational warning, tests are skipped
//     (pure offline dev environment with no archive artifact at hand).
//
// Confirmed structure from EAS production build b12839a5 (2026-08-16):
//   Payload/PregnancyAIAssistant.app/Watch/PregnancyWatchApp.app/
//   Payload/PregnancyAIAssistant.app/Watch/PregnancyWatchApp.app/PregnancyWatchApp  (612 KB)
//   Payload/PregnancyAIAssistant.app/Watch/PregnancyWatchApp.app/Assets.car         (732 KB)
//   Payload/PregnancyAIAssistant.app/Watch/PregnancyWatchApp.app/AppIcon-{58..1024}.png (12 files)
//   Payload/PregnancyAIAssistant.app/Watch/PregnancyWatchApp.app/_CodeSignature/
//   Payload/PregnancyAIAssistant.app/Watch/PregnancyWatchApp.app/Info.plist

const CACHED_IPA_PATH = "/tmp/eas-verify-app.ipa";
const VERIFY_SCRIPT   = path.resolve(__dirname, "../../scripts/verify-eas-archive.js");

const WATCH_APP_NAME = "PregnancyWatchApp";
const IOS_APP_NAME   = "PregnancyAIAssistant";
const WATCH_BASE     = `Payload/${IOS_APP_NAME}.app/Watch/${WATCH_APP_NAME}.app/`;

/**
 * Resolve the IPA to inspect:
 *  1. If EXPO_TOKEN is set, call verify-eas-archive.js which downloads the
 *     latest build's IPA and caches it. Throw on failure (no soft skip).
 *  2. If the cached path exists (prior download), use it.
 *  3. Otherwise return null → skip gracefully (offline, no credentials).
 */
function resolveIpa(): string | null {
  const hasToken = !!process.env.EXPO_TOKEN;

  if (hasToken) {
    // Authenticated path: download + verify via the script (hard-fail on error)
    execFileSync("node", [VERIFY_SCRIPT], {
      stdio: "inherit",
      env: { ...process.env },
      timeout: 120_000, // 2 min — IPA download may take time
    });
    // Script exits 0 = verified; any other exit throws above.
    return CACHED_IPA_PATH;
  }

  if (fs.existsSync(CACHED_IPA_PATH)) {
    console.info(`[IPA] Using cached IPA: ${CACHED_IPA_PATH}`);
    return CACHED_IPA_PATH;
  }

  return null; // no credentials, no cache → skip
}

function listIpaEntries(ipaPath: string): string[] {
  const output = execFileSync("unzip", ["-l", ipaPath], {
    stdio: "pipe",
  }).toString();
  return output
    .split("\n")
    .map((l) => {
      const parts = l.trim().split(/\s+/);
      return parts[parts.length - 1] ?? "";
    })
    .filter(Boolean);
}

describe("EAS archive IPA verification — Watch bundle structure", () => {
  let ipaEntries: string[] = [];
  let ipaResolved = false;

  beforeAll(() => {
    const ipaPath = resolveIpa();
    if (!ipaPath) {
      console.warn(
        "[IPA] EXPO_TOKEN not set and no cached IPA at /tmp/eas-verify-app.ipa.\n" +
        "      IPA inspection skipped — set EXPO_TOKEN to enable authenticated\n" +
        "      download, or run: node scripts/verify-eas-archive.js --ipa <path>",
      );
      return;
    }
    ipaEntries  = listIpaEntries(ipaPath);
    ipaResolved = true;
  });

  it("IPA obtained and contains entries (hard-fail when EXPO_TOKEN is set)", () => {
    if (!ipaResolved) {
      // Only reaches here when EXPO_TOKEN is unset and no cached IPA —
      // resolveIpa() would have thrown for any authenticated failure.
      console.warn("[IPA] Skipping: no IPA available in this environment.");
      expect(true).toBe(true);
      return;
    }
    expect(ipaEntries.length).toBeGreaterThan(0);
  });

  it("PregnancyWatchApp.app is embedded at Payload/<app>/Watch/", () => {
    if (!ipaResolved) { expect(true).toBe(true); return; }
    expect(ipaEntries).toContain(WATCH_BASE);
  });

  it("Watch binary is present inside the embedded bundle", () => {
    if (!ipaResolved) { expect(true).toBe(true); return; }
    expect(ipaEntries).toContain(`${WATCH_BASE}${WATCH_APP_NAME}`);
  });

  it("all 12 AppIcon-*.png files injected by the shell script are in the Watch bundle", () => {
    if (!ipaResolved) { expect(true).toBe(true); return; }
    const icons = [
      "AppIcon-58.png","AppIcon-80.png","AppIcon-87.png","AppIcon-88.png",
      "AppIcon-100.png","AppIcon-102.png","AppIcon-108.png","AppIcon-172.png",
      "AppIcon-196.png","AppIcon-216.png","AppIcon-234.png","AppIcon-1024.png",
    ];
    for (const icon of icons) {
      expect(ipaEntries).toContain(`${WATCH_BASE}${icon}`);
    }
  });

  it("Watch bundle is code-signed (_CodeSignature present)", () => {
    if (!ipaResolved) { expect(true).toBe(true); return; }
    const hasSig = ipaEntries.some((e) =>
      e.startsWith(`${WATCH_BASE}_CodeSignature/`),
    );
    expect(hasSig).toBe(true);
  });
});
