/**
 * withValidateIOSIconCatalog.test.ts
 *
 * Verifies the validation logic inside plugins/withValidateIOSIconCatalog.js.
 *
 * The plugin exports `validateCatalog`, `isWatchOSCatalog`, and
 * `findIOSAppIconCatalogs` so tests can exercise the real production code
 * without spinning up a full Expo mod chain or needing a prebuilt ios/
 * directory.
 *
 * Additionally, a smoke test confirms the plugin function itself returns a
 * wrapped config object when called (the mod finalizer only runs during
 * `expo prebuild` — exercising the full mod chain in Jest would require a
 * real Expo project, which is intentionally out of scope here).
 */

import fs from "fs";
import os from "os";
import path from "path";

// Import the real production helpers from the plugin.
// validateCatalog, isWatchOSCatalog, and findIOSAppIconCatalogs are all
// exported explicitly from withValidateIOSIconCatalog.js for testability.
const plugin = require("../plugins/withValidateIOSIconCatalog");
const validateCatalog: (catalogPath: string) => string[] =
  plugin.validateCatalog;
const isWatchOSCatalog: (contentsPath: string, contents: object) => boolean =
  plugin.isWatchOSCatalog;
const findIOSAppIconCatalogs: (dir: string) => string[] =
  plugin.findIOSAppIconCatalogs;

// ── fixture helpers ───────────────────────────────────────────────────────────

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "with-validate-ios-icon-test-"));
}

/**
 * Write Contents.json at a given sub-path inside a fresh temp directory
 * and return the absolute path to the Contents.json file.
 */
function writeFixture(
  contents: object,
  subPath = "ios/PregnancyAIAssistant/Images.xcassets/AppIcon.appiconset",
): { catalogPath: string; tmpDir: string } {
  const tmpDir = makeTempDir();
  const dir = path.join(tmpDir, subPath);
  fs.mkdirSync(dir, { recursive: true });
  const catalogPath = path.join(dir, "Contents.json");
  fs.writeFileSync(catalogPath, JSON.stringify(contents, null, 2));
  return { catalogPath, tmpDir };
}

// ── fixture data ───────────────────────────────────────────────────────────────

const MODERN_CONTENTS = {
  images: [
    {
      filename: "App-Icon-1024x1024@1x.png",
      idiom: "universal",
      platform: "ios",
      size: "1024x1024",
    },
  ],
  info: { author: "xcode", version: 1 },
};

const LEGACY_CONTENTS = {
  images: [
    { idiom: "iphone", scale: "2x", size: "20x20" },
    { idiom: "iphone", scale: "3x", size: "20x20" },
    { idiom: "ipad", scale: "1x", size: "20x20" },
    { idiom: "ios-marketing", scale: "1x", size: "1024x1024" },
  ],
  info: { author: "xcode", version: 1 },
};

const MISSING_1024_CONTENTS = {
  images: [
    { filename: "AppIcon-60@2x.png", idiom: "universal", size: "60x60" },
  ],
  info: { author: "xcode", version: 1 },
};

const WATCHOS_CONTENTS = {
  images: [
    {
      filename: "AppIcon.png",
      idiom: "universal",
      platform: "watchos",
      size: "1024x1024",
    },
  ],
  info: { author: "xcode", version: 1 },
};

// ── validateCatalog — happy path ──────────────────────────────────────────────

describe("validateCatalog — happy path", () => {
  afterEach(() => {
    // temp dirs are cleaned up per-test via try/finally in writeFixture callers
  });

  it("returns no errors for the modern single-image format", () => {
    const { catalogPath, tmpDir } = writeFixture(MODERN_CONTENTS);
    try {
      expect(validateCatalog(catalogPath)).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns no errors when multiple universal entries are present and 1024×1024 is included", () => {
    const multiUniversal = {
      images: [
        { filename: "AppIcon-60@2x.png", idiom: "universal", size: "60x60" },
        {
          filename: "AppIcon.png",
          idiom: "universal",
          platform: "ios",
          size: "1024x1024",
        },
      ],
      info: { author: "xcode", version: 1 },
    };
    const { catalogPath, tmpDir } = writeFixture(multiUniversal);
    try {
      expect(validateCatalog(catalogPath)).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── validateCatalog — legacy per-size format ──────────────────────────────────

describe("validateCatalog — legacy per-size slot format", () => {
  it("returns at least one error for legacy idiom entries", () => {
    const { catalogPath, tmpDir } = writeFixture(LEGACY_CONTENTS);
    try {
      expect(validateCatalog(catalogPath).length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("error message names the offending legacy idioms", () => {
    const { catalogPath, tmpDir } = writeFixture(LEGACY_CONTENTS);
    try {
      const errors = validateCatalog(catalogPath);
      expect(errors.join(" ")).toMatch(/iphone|ipad|ios-marketing/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("error message instructs the developer to use the modern format", () => {
    const { catalogPath, tmpDir } = writeFixture(LEGACY_CONTENTS);
    try {
      const errors = validateCatalog(catalogPath);
      expect(errors.join(" ")).toMatch(
        /modern single-image format|idiom.*universal|universal.*idiom/i,
      );
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── validateCatalog — missing 1024×1024 ──────────────────────────────────────

describe("validateCatalog — missing 1024×1024 marketing icon", () => {
  it("returns an error when no 1024×1024 entry is present", () => {
    const { catalogPath, tmpDir } = writeFixture(MISSING_1024_CONTENTS);
    try {
      expect(validateCatalog(catalogPath).length).toBeGreaterThan(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("error message references 1024×1024 and App Store submission", () => {
    const { catalogPath, tmpDir } = writeFixture(MISSING_1024_CONTENTS);
    try {
      const combined = validateCatalog(catalogPath).join(" ");
      expect(combined).toMatch(/1024/);
      expect(combined).toMatch(/App Store submission|marketing icon/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── validateCatalog — watchOS catalog exclusion ───────────────────────────────

describe("validateCatalog — watchOS catalog exclusion", () => {
  it("returns no errors for a catalog placed in PregnancyWatchApp/ (path-based skip)", () => {
    const { catalogPath, tmpDir } = writeFixture(
      WATCHOS_CONTENTS,
      "ios/PregnancyWatchApp/Assets.xcassets/AppIcon.appiconset",
    );
    try {
      expect(validateCatalog(catalogPath)).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns no errors for a catalog whose images declare platform=watchos (content-based skip)", () => {
    // Even outside a PregnancyWatchApp/ path, if images say platform=watchos,
    // validateCatalog must skip it (same rule as isWatchOSCatalog).
    const { catalogPath, tmpDir } = writeFixture(WATCHOS_CONTENTS);
    try {
      expect(validateCatalog(catalogPath)).toHaveLength(0);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── validateCatalog — edge cases ──────────────────────────────────────────────

describe("validateCatalog — edge cases", () => {
  it("returns an error when the images array is empty", () => {
    const { catalogPath, tmpDir } = writeFixture({
      images: [],
      info: { author: "xcode", version: 1 },
    });
    try {
      const errors = validateCatalog(catalogPath);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join(" ")).toMatch(/missing or empty/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns an error when Contents.json is not valid JSON", () => {
    const tmpDir = makeTempDir();
    try {
      const dir = path.join(
        tmpDir,
        "ios/PregnancyAIAssistant/Images.xcassets/AppIcon.appiconset",
      );
      fs.mkdirSync(dir, { recursive: true });
      const catalogPath = path.join(dir, "Contents.json");
      fs.writeFileSync(catalogPath, "{ not valid json ,,");

      const errors = validateCatalog(catalogPath);
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.join(" ")).toMatch(/Failed to parse/i);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── isWatchOSCatalog ──────────────────────────────────────────────────────────

describe("isWatchOSCatalog", () => {
  it("returns true for a path containing /PregnancyWatchApp/", () => {
    expect(
      isWatchOSCatalog(
        "/ios/PregnancyWatchApp/Assets.xcassets/AppIcon.appiconset/Contents.json",
        {},
      ),
    ).toBe(true);
  });

  it("returns true for a path containing /watchapp/", () => {
    expect(
      isWatchOSCatalog(
        "/watchapp/Assets.xcassets/AppIcon.appiconset/Contents.json",
        {},
      ),
    ).toBe(true);
  });

  it("returns true when images contain platform=watchos (content-based detection)", () => {
    expect(
      isWatchOSCatalog("/ios/SomeApp/AppIcon.appiconset/Contents.json", {
        images: [
          { idiom: "universal", platform: "watchos", size: "1024x1024" },
        ],
      }),
    ).toBe(true);
  });

  it("returns false for a standard iOS path with iOS images", () => {
    expect(
      isWatchOSCatalog(
        "/ios/PregnancyAIAssistant/Images.xcassets/AppIcon.appiconset/Contents.json",
        {
          images: [{ idiom: "universal", platform: "ios", size: "1024x1024" }],
        },
      ),
    ).toBe(false);
  });
});

// ── findIOSAppIconCatalogs ────────────────────────────────────────────────────

describe("findIOSAppIconCatalogs", () => {
  it("returns an empty array when the directory does not exist", () => {
    expect(findIOSAppIconCatalogs("/tmp/__nonexistent_dir__")).toHaveLength(0);
  });

  it("finds a Contents.json nested inside an AppIcon.appiconset", () => {
    const tmpDir = makeTempDir();
    try {
      const iconsetDir = path.join(
        tmpDir,
        "PregnancyAIAssistant/Images.xcassets/AppIcon.appiconset",
      );
      fs.mkdirSync(iconsetDir, { recursive: true });
      fs.writeFileSync(path.join(iconsetDir, "Contents.json"), "{}");

      const results = findIOSAppIconCatalogs(tmpDir);
      expect(results).toHaveLength(1);
      expect(results[0]).toContain("AppIcon.appiconset");
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("finds both iOS and watchOS catalogs (filtering is validateCatalog's job)", () => {
    const tmpDir = makeTempDir();
    try {
      for (const subPath of [
        "PregnancyAIAssistant/Images.xcassets/AppIcon.appiconset",
        "PregnancyWatchApp/Assets.xcassets/AppIcon.appiconset",
      ]) {
        const d = path.join(tmpDir, subPath);
        fs.mkdirSync(d, { recursive: true });
        fs.writeFileSync(path.join(d, "Contents.json"), "{}");
      }
      expect(findIOSAppIconCatalogs(tmpDir)).toHaveLength(2);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});

// ── plugin export smoke test ──────────────────────────────────────────────────

describe("withValidateIOSIconCatalog — plugin export", () => {
  it("exports a function (the config plugin)", () => {
    expect(typeof plugin).toBe("function");
  });

  it("exports validateCatalog as a named export", () => {
    expect(typeof plugin.validateCatalog).toBe("function");
  });

  it("exports isWatchOSCatalog as a named export", () => {
    expect(typeof plugin.isWatchOSCatalog).toBe("function");
  });

  it("exports findIOSAppIconCatalogs as a named export", () => {
    expect(typeof plugin.findIOSAppIconCatalogs).toBe("function");
  });

  it("plugin function returns a config object when called with a minimal config", () => {
    // withFinalizedMod wraps the config, registering the finalizer for later.
    // Calling the plugin function should not throw; the finalizer runs only
    // during expo prebuild (not in Jest).
    const fakeConfig = { name: "test", slug: "test", mods: {} };
    const result = plugin(fakeConfig);
    expect(result).toBeDefined();
    expect(typeof result).toBe("object");
  });
});
