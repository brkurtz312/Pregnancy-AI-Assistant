#!/usr/bin/env node
// Guards against static ES imports/re-exports of native modules that can kill
// the app on launch after an OTA update.
//
// Background: expo-router eagerly evaluates every route module (every file
// under app/) when the bundle loads.  A static ES import of a native package
// is evaluated at that point — if the native module is absent from the
// installed binary the entire app crashes on launch, with no error boundary
// to catch it.  The same risk applies to modules transitively reachable from
// any route: lib/, components/, hooks/, and contexts/ are all scanned.
//
// The safe alternative for risky packages is a try/catch require() IIFE so
// the failure is scoped to the component, not the whole app.
//
// Detection is AST-based (@babel/core with babel-preset-expo).  All value
// import/re-export forms are caught:
//   import Foo from 'pkg'               — default
//   import { Foo } from 'pkg'           — named (single or multiline)
//   import * as Foo from 'pkg'          — namespace
//   import 'pkg'                        — side-effect
//   export { Foo } from 'pkg'           — named re-export
//   export * from 'pkg'                 — star re-export
//
// The following are correctly treated as type-only (TypeScript erases them):
//   import type { Foo } from 'pkg'      — declaration-level type import
//   import { type Foo } from 'pkg'      — specifier-level type import
//   import { type Foo, type Bar }       — all specifiers are types
//   export type { Foo } from 'pkg'      — type re-export
//   export { type Foo } from 'pkg'      — specifier-level type re-export
//
// Usage:
//   node scripts/check-native-imports.js    # CI mode, exits 1 on violation
//
// This runs as part of `pnpm run typecheck` for this package.
//
// -----------------------------------------------------------------------
// RESTRICTED packages — must use safe-require pattern (try/catch require())
// -----------------------------------------------------------------------
//
// - @react-native-community/datetimepicker
//     Confirmed crash vector (see datetimepicker-safe-require.md in memory).
//     Previously caused app-wide crash via static import in index.tsx and
//     profile.tsx; now uses safe-require + `import type` only for the TS type.
//
// -----------------------------------------------------------------------
// ALLOWLISTED packages — confirmed present in binary, safe to import
// -----------------------------------------------------------------------
//
// Add a package here when all three are true:
//   1. It is a declared dependency in package.json (not a transitive dep).
//   2. It has been compiled into every EAS build via its native module config.
//   3. It has been manually verified not to throw on import in the simulator.
//
// Currently allowlisted:
//   - @react-native-community/netinfo
//       Direct dependency, compiled into every binary, no launch-time crash.
//   - react-native-purchases
//       RevenueCat's native SDK. Direct dependency in package.json; compiled
//       into every EAS build via the RevenueCat SDK config plugin.  Confirmed
//       safe to import statically — crash risk is absent because the module
//       is always present in the installed binary.
//
// -----------------------------------------------------------------------

"use strict";

const fs = require("fs");
const path = require("path");
const babel = require("@babel/core");

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Packages that MUST NOT be statically value-imported anywhere in the scanned
 * source tree.  Prefer extending ALLOWLISTED over weakening this list.
 */
const RESTRICTED = new Set(["@react-native-community/datetimepicker"]);

/**
 * Packages that are safe to import statically because they are confirmed
 * present in the installed binary for every EAS build.
 * Extend this set (with a comment) when a package meets the three criteria
 * above rather than widening RESTRICTED.
 */
const ALLOWLISTED = new Set([
  "@react-native-community/netinfo",
  "react-native-purchases",
]);

/**
 * Top-level directories (relative to the project root) whose source files
 * are scanned.  This covers app/ itself and every shared module directory
 * that is transitively reachable from a route file at runtime.
 * Excluded intentionally: __tests__/, tests/, test-helpers/ (not bundled),
 * node_modules/ (third-party), ios/watchapp/ (native, not bundled by Metro),
 * server/ (Node.js server, not the mobile bundle), dist/ (build artifact).
 */
const SCAN_DIRS = [
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Walk a directory recursively, yielding file paths. */
function* walkDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkDir(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

/**
 * Normalise a raw import specifier to the top-level package name so that
 * sub-path imports (e.g. `@react-native-community/datetimepicker/something`)
 * still match.
 */
function toPackageName(specifier) {
  if (specifier.startsWith("@")) {
    const parts = specifier.split("/");
    return parts.slice(0, 2).join("/");
  }
  return specifier.split("/")[0];
}

/**
 * Return true when every import specifier in the node carries
 * `importKind: 'type'` (inline `import { type Foo }` syntax).
 * Side-effect imports (`import 'pkg'`) have no specifiers and are value
 * imports, so this returns false for them.
 */
function allSpecifiersAreTypes(specifiers) {
  if (!specifiers || specifiers.length === 0) return false;
  return specifiers.every((s) => s.importKind === "type");
}

/**
 * Return true when every export specifier in a named re-export carries
 * `exportKind: 'type'` (inline `export { type Foo }` syntax).
 */
function allExportSpecifiersAreTypes(specifiers) {
  if (!specifiers || specifiers.length === 0) return false;
  return specifiers.every((s) => s.exportKind === "type");
}

/**
 * Parse a source file with @babel/core (babel-preset-expo covers
 * TypeScript/TSX) and return every restricted static value import or
 * re-export as an array of violation objects.
 *
 * @param {string} source   Raw file contents.
 * @param {string} filePath File path used for babel's filename hint.
 * @returns {{ file: string, line: number, col: number, pkg: string, kind: string }[]}
 */
function findViolations(source, filePath) {
  let ast;
  try {
    ast = babel.parseSync(source, {
      filename: filePath,
      presets: ["babel-preset-expo"],
      configFile: false,
      babelrc: false,
    });
  } catch (err) {
    // Surface parse failures — a file that cannot be parsed may contain a
    // restricted import, so silently skipping it would defeat the check.
    // Return a sentinel violation so the caller can surface the error.
    return [
      {
        file: filePath,
        line: 0,
        col: 0,
        pkg: "__parse_error__",
        kind: "parse-error",
        parseError: err instanceof Error ? err.message : String(err),
      },
    ];
  }

  if (!ast || !ast.program) return [];

  const violations = [];

  for (const node of ast.program.body) {
    let sourceValue = null;
    let kind = null;

    if (node.type === "ImportDeclaration") {
      // Declaration-level: import type { ... }
      if (node.importKind === "type") continue;
      // Specifier-level: import { type Foo, type Bar } from '...'
      if (allSpecifiersAreTypes(node.specifiers)) continue;
      sourceValue = node.source.value;
      kind = "import";
    } else if (node.type === "ExportNamedDeclaration" && node.source != null) {
      // export type { ... } from 'pkg'
      if (node.exportKind === "type") continue;
      // export { type Foo, type Bar } from 'pkg'
      if (allExportSpecifiersAreTypes(node.specifiers)) continue;
      sourceValue = node.source.value;
      kind = "re-export";
    } else if (node.type === "ExportAllDeclaration" && node.source != null) {
      // export type * from 'pkg'
      if (node.exportKind === "type") continue;
      sourceValue = node.source.value;
      kind = "re-export";
    } else {
      continue;
    }

    const pkg = toPackageName(sourceValue);
    if (ALLOWLISTED.has(pkg)) continue;
    if (!RESTRICTED.has(pkg)) continue;

    violations.push({
      file: filePath,
      line: node.loc ? node.loc.start.line : 0,
      col: node.loc ? node.loc.start.column + 1 : 0,
      pkg,
      kind,
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Main (only runs when executed directly, not when require()'d by tests)
// ---------------------------------------------------------------------------

if (require.main === module) {
  const projectRoot = path.join(__dirname, "..");
  const allViolations = [];

  for (const dirName of SCAN_DIRS) {
    const absDir = path.join(projectRoot, dirName);
    if (!fs.existsSync(absDir)) continue;

    for (const filePath of walkDir(absDir)) {
      if (!/\.(tsx?|jsx?)$/.test(filePath)) continue;
      const source = fs.readFileSync(filePath, "utf8");
      const rel = path.relative(projectRoot, filePath);
      const fileViolations = findViolations(source, filePath).map((v) => ({
        ...v,
        file: rel,
      }));
      allViolations.push(...fileViolations);
    }
  }

  const parseErrors = allViolations.filter((v) => v.kind === "parse-error");
  const importViolations = allViolations.filter(
    (v) => v.kind !== "parse-error",
  );

  if (parseErrors.length > 0) {
    console.error("\nFATAL: Failed to parse the following source files:\n");
    for (const v of parseErrors) {
      console.error(`  ${v.file}: ${v.parseError}`);
    }
    console.error(
      "\nFix the syntax errors above before running the native-import check.\n",
    );
    process.exit(1);
  }

  if (importViolations.length === 0) {
    console.log(
      `native-imports OK: scanned ${SCAN_DIRS.join(", ")} — no restricted static imports found`,
    );
    process.exit(0);
  }

  console.error(
    "\nFATAL: Restricted native import(s) detected — these will crash\n" +
      "every user at launch after an OTA update if the native module is\n" +
      "absent from the installed binary.\n" +
      "\n" +
      "Use the safe-require pattern instead:\n" +
      "\n" +
      "  // ✗ BAD — crashes on launch if native module is missing\n" +
      "  import DateTimePicker from '@react-native-community/datetimepicker';\n" +
      "\n" +
      "  // ✓ GOOD — failure is scoped to the component, not the whole app\n" +
      "  const DateTimePicker = (() => {\n" +
      "    try { return require('@react-native-community/datetimepicker').default; }\n" +
      "    catch { return null; }\n" +
      "  })();\n" +
      "\n" +
      "  // ✓ ALSO OK — type-only imports are erased by TypeScript\n" +
      "  import type { DateTimePickerEvent } from '@react-native-community/datetimepicker';\n" +
      "\n" +
      "Violations found:\n",
  );

  for (const v of importViolations) {
    console.error(`  ${v.file}:${v.line}:${v.col}  [${v.pkg}] (${v.kind})`);
  }

  console.error(
    "\nIf this package is confirmed present in the binary and safe to\n" +
      "import statically, add it to the ALLOWLISTED set at the top of\n" +
      "scripts/check-native-imports.js with a comment explaining why.\n",
  );

  process.exit(1);
}

module.exports = { findViolations, RESTRICTED, ALLOWLISTED, SCAN_DIRS };
