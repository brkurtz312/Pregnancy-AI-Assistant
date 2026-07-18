/**
 * Confirms that the no-restricted-syntax rule for jest.setTimeout fires on
 * non-mobile test files.  The rule globs were broadened to cover all test
 * file patterns (`**\/__tests__/**`, `**\/*.test.*`, `**\/*.spec.*`), but
 * there was no automated check that the broadened globs actually matched files
 * outside the mobile package.
 *
 * Strategy: use ESLint's programmatic lintText() API so that:
 *  - no fixture files need to live on disk (no risk of them being linted
 *    during a normal `pnpm run lint` run)
 *  - the filePath argument controls which config block's `files` globs apply,
 *    letting us simulate any path we want
 *  - the test is self-contained and fast (no subprocesses)
 */

import { describe, it, expect } from "vitest";
import { ESLint } from "eslint";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_ROOT = path.resolve(__dirname, "../..");
const CONFIG_FILE = path.join(WORKSPACE_ROOT, "eslint.config.mjs");

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

async function lintAs(
  code: string,
  workspaceRelativePath: string,
): Promise<ESLint.LintResult> {
  const eslint = new ESLint({
    overrideConfigFile: CONFIG_FILE,
    // cwd must match the workspace root so that the files globs in the
    // flat config (e.g. "**/*.test.{ts,tsx}") resolve correctly against
    // the absolute filePath we pass to lintText().
    cwd: WORKSPACE_ROOT,
  });
  const results = await eslint.lintText(code, {
    filePath: path.join(WORKSPACE_ROOT, workspaceRelativePath),
    warnIgnored: false,
  });
  return results[0];
}

function timeoutViolations(result: ESLint.LintResult) {
  return result.messages.filter((m) =>
    m.message.includes("jest.setTimeout()"),
  );
}

// ---------------------------------------------------------------------------
// Violation fixtures — jest.setTimeout() nested inside callbacks
// ---------------------------------------------------------------------------

const INSIDE_DESCRIBE = `
describe('suite', () => {
  jest.setTimeout(30000);
  it('passes', () => {});
});
`;

const INSIDE_IT = `
it('slow test', () => {
  jest.setTimeout(30000);
  expect(true).toBe(true);
});
`;

const INSIDE_BEFORE_EACH = `
beforeEach(() => {
  jest.setTimeout(10000);
});

it('test', () => {});
`;

const INSIDE_AFTER_ALL = `
afterAll(() => {
  jest.setTimeout(10000);
});

it('test', () => {});
`;

const INSIDE_NESTED_DESCRIBE_IT = `
describe('outer', () => {
  describe('inner', () => {
    it('deeply nested', () => {
      jest.setTimeout(5000);
    });
  });
});
`;

// ---------------------------------------------------------------------------
// Valid fixture — jest.setTimeout() at the file top level (allowed)
// ---------------------------------------------------------------------------

const TOP_LEVEL_VALID = `
jest.setTimeout(10000);

describe('suite', () => {
  it('passes', () => {
    expect(true).toBe(true);
  });
});
`;

// ---------------------------------------------------------------------------
// Tests: .test.ts glob (non-mobile lib package path)
// ---------------------------------------------------------------------------

describe("eslint timeout-guard rule — *.test.ts files in lib/ package", () => {
  it("flags jest.setTimeout() inside describe()", async () => {
    const result = await lintAs(
      INSIDE_DESCRIBE,
      "lib/db/__tests__/connection.test.ts",
    );
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain(
      "jest.setTimeout() must be at the file top level",
    );
  });

  it("flags jest.setTimeout() inside it()", async () => {
    const result = await lintAs(INSIDE_IT, "lib/db/src/helpers.test.ts");
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain(
      "jest.setTimeout() must be at the file top level",
    );
  });

  it("flags jest.setTimeout() inside beforeEach()", async () => {
    const result = await lintAs(
      INSIDE_BEFORE_EACH,
      "lib/api-zod/src/utils.test.ts",
    );
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(1);
  });

  it("flags jest.setTimeout() inside afterAll()", async () => {
    const result = await lintAs(
      INSIDE_AFTER_ALL,
      "lib/api-spec/src/codegen.test.ts",
    );
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(1);
  });

  it("flags jest.setTimeout() deeply nested inside describe > it", async () => {
    const result = await lintAs(
      INSIDE_NESTED_DESCRIBE_IT,
      "lib/db/src/schema.test.ts",
    );
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(1);
  });

  it("does NOT flag jest.setTimeout() at the file top level", async () => {
    const result = await lintAs(
      TOP_LEVEL_VALID,
      "lib/db/src/connection.test.ts",
    );
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: .spec.ts glob (non-mobile scripts package path)
// ---------------------------------------------------------------------------

describe("eslint timeout-guard rule — *.spec.ts files in scripts/ package", () => {
  it("flags jest.setTimeout() inside describe() in a .spec.ts file", async () => {
    const result = await lintAs(
      INSIDE_DESCRIBE,
      "scripts/src/helpers.spec.ts",
    );
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(1);
    expect(violations[0].message).toContain(
      "jest.setTimeout() must be at the file top level",
    );
  });

  it("flags jest.setTimeout() inside it() in a .spec.ts file", async () => {
    const result = await lintAs(INSIDE_IT, "scripts/src/seed.spec.ts");
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(1);
  });

  it("does NOT flag a top-level jest.setTimeout() in a .spec.ts file", async () => {
    const result = await lintAs(TOP_LEVEL_VALID, "scripts/src/seed.spec.ts");
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: __tests__/ directory glob
// ---------------------------------------------------------------------------

describe("eslint timeout-guard rule — __tests__/ directory glob", () => {
  it("flags jest.setTimeout() inside describe() in a __tests__/ dir .ts file", async () => {
    const result = await lintAs(
      INSIDE_DESCRIBE,
      "lib/api-client-react/__tests__/hooks.ts",
    );
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(1);
  });

  it("flags jest.setTimeout() inside beforeEach() in a __tests__/ dir .tsx file", async () => {
    const result = await lintAs(
      INSIDE_BEFORE_EACH,
      "lib/api-client-react/__tests__/setup.tsx",
    );
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: plain .ts file (no glob match) must NOT be flagged
// ---------------------------------------------------------------------------

describe("eslint timeout-guard rule — plain .ts files are exempt", () => {
  it("does NOT flag jest.setTimeout() inside describe() in a plain .ts source file", async () => {
    const result = await lintAs(INSIDE_DESCRIBE, "lib/db/src/helpers.ts");
    const violations = timeoutViolations(result);
    expect(violations).toHaveLength(0);
  });
});
