/**
 * Unit tests for scripts/check-native-imports.js
 *
 * Verifies that the AST-based checker correctly identifies (or ignores) all
 * relevant import/re-export forms without relying on the file system.  Each
 * test calls findViolations() directly with a source string.
 */

"use strict";

const {
  findViolations,
  RESTRICTED,
  ALLOWLISTED,
  SCAN_DIRS,
} = require("../scripts/check-native-imports");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return the violation pkg names for a snippet, for concise assertions. */
function violations(source) {
  return findViolations(source, "test.tsx").map((v) => v.pkg);
}

/** Return the violation kinds for a snippet. */
function violationKinds(source) {
  return findViolations(source, "test.tsx").map((v) => v.kind);
}

// ---------------------------------------------------------------------------
// Should catch — value imports of the restricted package
// ---------------------------------------------------------------------------

describe("catches restricted value imports", () => {
  test("default import", () => {
    expect(
      violations(
        "import DateTimePicker from '@react-native-community/datetimepicker';",
      ),
    ).toEqual(["@react-native-community/datetimepicker"]);
  });

  test("named import", () => {
    expect(
      violations(
        "import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';",
      ),
    ).toEqual(["@react-native-community/datetimepicker"]);
  });

  test("namespace import", () => {
    expect(
      violations(
        "import * as DTP from '@react-native-community/datetimepicker';",
      ),
    ).toEqual(["@react-native-community/datetimepicker"]);
  });

  test("side-effect import", () => {
    expect(
      violations("import '@react-native-community/datetimepicker';"),
    ).toEqual(["@react-native-community/datetimepicker"]);
  });

  test("multiline named import", () => {
    const src = `
import {
  DateTimePickerAndroid,
  DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
    `.trim();
    expect(violations(src)).toEqual(["@react-native-community/datetimepicker"]);
  });

  test("sub-path import resolves to package name", () => {
    expect(
      violations(
        "import Foo from '@react-native-community/datetimepicker/src/index';",
      ),
    ).toEqual(["@react-native-community/datetimepicker"]);
  });

  test("reports correct line numbers", () => {
    const src = [
      "// line 1 comment",
      "import DTP from '@react-native-community/datetimepicker';",
    ].join("\n");
    const vs = findViolations(src, "test.tsx");
    expect(vs).toHaveLength(1);
    expect(vs[0].line).toBe(2);
  });

  test("mixed default + inline-type specifiers is still a value import", () => {
    // `Purchases` is a value; the `type` specifiers are erased but the whole
    // import still pulls in the native module.
    const src =
      "import DTP, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';";
    expect(violations(src)).toEqual(["@react-native-community/datetimepicker"]);
  });
});

// ---------------------------------------------------------------------------
// Should catch — re-exports of the restricted package
// ---------------------------------------------------------------------------

describe("catches restricted re-exports", () => {
  test("named re-export", () => {
    const src =
      "export { DateTimePicker } from '@react-native-community/datetimepicker';";
    expect(violations(src)).toEqual(["@react-native-community/datetimepicker"]);
    expect(violationKinds(src)).toEqual(["re-export"]);
  });

  test("star re-export", () => {
    const src = "export * from '@react-native-community/datetimepicker';";
    expect(violations(src)).toEqual(["@react-native-community/datetimepicker"]);
    expect(violationKinds(src)).toEqual(["re-export"]);
  });

  test("type re-export at declaration level is safe", () => {
    expect(
      violations(
        "export type { DateTimePickerEvent } from '@react-native-community/datetimepicker';",
      ),
    ).toEqual([]);
  });

  test("all-type specifier re-export is safe", () => {
    // export { type Foo, type Bar } from '...' — all specifiers are type-only
    expect(
      violations(
        "export { type DateTimePickerEvent } from '@react-native-community/datetimepicker';",
      ),
    ).toEqual([]);
  });

  test("mixed value+type specifier re-export is caught", () => {
    const src =
      "export { DateTimePicker, type DateTimePickerEvent } from '@react-native-community/datetimepicker';";
    expect(violations(src)).toEqual(["@react-native-community/datetimepicker"]);
  });
});

// ---------------------------------------------------------------------------
// Should pass — type-only imports (TypeScript erases these)
// ---------------------------------------------------------------------------

describe("allows type-only imports", () => {
  test("declaration-level: import type { Foo }", () => {
    expect(
      violations(
        "import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';",
      ),
    ).toEqual([]);
  });

  test("declaration-level: import type * as Foo", () => {
    expect(
      violations(
        "import type * as DTP from '@react-native-community/datetimepicker';",
      ),
    ).toEqual([]);
  });

  test("declaration-level: import type Foo (default)", () => {
    expect(
      violations(
        "import type DateTimePicker from '@react-native-community/datetimepicker';",
      ),
    ).toEqual([]);
  });

  test("specifier-level: import { type Foo } — all specifiers are type", () => {
    expect(
      violations(
        "import { type DateTimePickerEvent } from '@react-native-community/datetimepicker';",
      ),
    ).toEqual([]);
  });

  test("specifier-level: import { type Foo, type Bar } — all types", () => {
    expect(
      violations(
        "import { type DateTimePickerEvent, type DateTimePickerAndroid } from '@react-native-community/datetimepicker';",
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Should pass — allowlisted and non-restricted packages
// ---------------------------------------------------------------------------

describe("allows safe / allowlisted imports", () => {
  test("@react-native-community/netinfo is allowlisted", () => {
    expect(
      violations("import NetInfo from '@react-native-community/netinfo';"),
    ).toEqual([]);
  });

  test("react-native-purchases is allowlisted (confirmed in binary)", () => {
    expect(
      violations("import Purchases from 'react-native-purchases';"),
    ).toEqual([]);
  });

  test("react-native-purchases named import is allowlisted", () => {
    expect(
      violations("import { PurchasesOffering } from 'react-native-purchases';"),
    ).toEqual([]);
  });

  test("react-native-purchases with mixed inline types is allowlisted", () => {
    const src = `
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
} from 'react-native-purchases';
    `.trim();
    expect(violations(src)).toEqual([]);
  });

  test("expo-* package (not restricted)", () => {
    expect(violations("import { useFont } from 'expo-font';")).toEqual([]);
  });

  test("react-native built-in (not restricted)", () => {
    expect(violations("import { View, Text } from 'react-native';")).toEqual(
      [],
    );
  });

  test("workspace-internal package (not restricted)", () => {
    expect(
      violations("import { foo } from '@workspace/learn-content-ids';"),
    ).toEqual([]);
  });

  test("relative import (not restricted)", () => {
    expect(violations("import { bar } from '../lib/utils';")).toEqual([]);
  });

  test("require() call is not caught (safe-require pattern)", () => {
    const src = `
const DateTimePicker = (() => {
  try { return require('@react-native-community/datetimepicker').default; }
  catch { return null; }
})();
    `.trim();
    expect(violations(src)).toEqual([]);
  });

  test("empty file", () => {
    expect(violations("")).toEqual([]);
  });

  test("file with no imports", () => {
    expect(violations("const x = 42;")).toEqual([]);
  });

  test("allowlisted netinfo re-export is not flagged", () => {
    expect(
      violations(
        "export { useNetInfo } from '@react-native-community/netinfo';",
      ),
    ).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Real-world regression: lib/revenuecat.tsx pattern
// ---------------------------------------------------------------------------

describe("real-world patterns", () => {
  test("lib/revenuecat.tsx import pattern does not trigger (react-native-purchases is allowlisted)", () => {
    const src = `
import Purchases, {
  type CustomerInfo,
  type PurchasesOfferings,
  type PurchasesPackage,
} from 'react-native-purchases';
    `.trim();
    // react-native-purchases is in ALLOWLISTED because it is compiled into
    // every EAS binary as a declared dependency.
    expect(violations(src)).toEqual([]);
  });

  test("app/(tabs)/index.tsx type-only pattern does not trigger", () => {
    const src =
      "import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';";
    expect(violations(src)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Parse error handling
// ---------------------------------------------------------------------------

describe("parse error handling", () => {
  test("returns a parse-error sentinel for unparseable source", () => {
    const vs = findViolations("this is not valid typescript }{{{", "bad.tsx");
    expect(vs).toHaveLength(1);
    expect(vs[0].kind).toBe("parse-error");
    expect(vs[0].pkg).toBe("__parse_error__");
    expect(vs[0].parseError).toBeDefined();
  });

  test("parse-error sentinel carries the file path", () => {
    const vs = findViolations("}{", "app/broken.tsx");
    expect(vs[0].file).toBe("app/broken.tsx");
  });
});

// ---------------------------------------------------------------------------
// Coverage across scanned directories
// ---------------------------------------------------------------------------

describe("detection in every scanned runtime directory", () => {
  // Each test shows that findViolations works for a file notionally in that dir.
  const dirs = [
    "app",
    "lib",
    "components",
    "hooks",
    "contexts",
    "constants",
    "modules",
    "types",
    "plugins",
  ];
  const badImport = "import DTP from '@react-native-community/datetimepicker';";

  for (const dir of dirs) {
    test(`catches violation in ${dir}/example.ts`, () => {
      const vs = findViolations(badImport, `${dir}/example.ts`);
      expect(vs).toHaveLength(1);
      expect(vs[0].pkg).toBe("@react-native-community/datetimepicker");
    });
  }
});

// ---------------------------------------------------------------------------
// Configuration sanity
// ---------------------------------------------------------------------------

describe("RESTRICTED / ALLOWLISTED / SCAN_DIRS sets", () => {
  test("RESTRICTED is non-empty", () => {
    expect(RESTRICTED.size).toBeGreaterThan(0);
  });

  test("datetimepicker is in RESTRICTED", () => {
    expect(RESTRICTED.has("@react-native-community/datetimepicker")).toBe(true);
  });

  test("netinfo is in ALLOWLISTED (not RESTRICTED)", () => {
    expect(ALLOWLISTED.has("@react-native-community/netinfo")).toBe(true);
    expect(RESTRICTED.has("@react-native-community/netinfo")).toBe(false);
  });

  test("react-native-purchases is in ALLOWLISTED (not RESTRICTED)", () => {
    expect(ALLOWLISTED.has("react-native-purchases")).toBe(true);
    expect(RESTRICTED.has("react-native-purchases")).toBe(false);
  });

  test("no overlap between RESTRICTED and ALLOWLISTED", () => {
    for (const pkg of RESTRICTED) {
      expect(ALLOWLISTED.has(pkg)).toBe(false);
    }
  });

  test("SCAN_DIRS includes app, lib, components, hooks, contexts", () => {
    expect(SCAN_DIRS).toContain("app");
    expect(SCAN_DIRS).toContain("lib");
    expect(SCAN_DIRS).toContain("components");
    expect(SCAN_DIRS).toContain("hooks");
    expect(SCAN_DIRS).toContain("contexts");
  });
});
