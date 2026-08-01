/**
 * Unit tests for scripts/cancel-stale-eas-builds.js
 *
 * Covers:
 *   - Argument parsing
 *   - filterStaleBuilds: branch scoping, commit matching, edge cases
 *   - listBuilds: query failure is a thrown error (never silent)
 *   - collectActiveBuilds: throws when any status query fails
 *   - cancelBuild: returns true/false based on exit code
 *   - run(): dry-run, nothing to cancel, cancellation success/failure
 */

// The script is plain CJS; require() is the correct way to load it in Jest.
const script = require("../scripts/cancel-stale-eas-builds.js");

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParseArgsResult {
  branch: string | null;
  head: string | null;
  dryRun: boolean;
}

interface EasBuild {
  id: string;
  platform: string;
  status: string;
  gitCommitHash?: string;
  gitRef?: string;
  gitCommitRef?: string;
}

interface CliOpts {
  projectRoot: string;
  env: Record<string, string>;
}

interface RunResult {
  cancelled: number;
  skipped: number;
}

const parseArgs: (argv: string[]) => ParseArgsResult = script.parseArgs;
const resolveEasCli: (env: Record<string, string>) => {
  bin: string;
  prefix: string[];
} = script.resolveEasCli;
const verifyBranchTip: (branch: string, headSha: string) => boolean | null =
  script.verifyBranchTip;
const filterStaleBuilds: (
  builds: EasBuild[],
  branch: string,
  headSha: string,
) => EasBuild[] = script.filterStaleBuilds;
const listBuilds: (status: string, opts: CliOpts) => EasBuild[] =
  script.listBuilds;
const collectActiveBuilds: (opts: CliOpts) => EasBuild[] =
  script.collectActiveBuilds;
const cancelBuild: (id: string, opts: CliOpts) => boolean = script.cancelBuild;
const run: (
  argv: string[],
  overrides?: Partial<CliOpts>,
) => Promise<RunResult> = script.run;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Produce a minimal EAS build object */
function makeBuild(overrides: Partial<EasBuild> = {}): EasBuild {
  return {
    id: "build-111",
    platform: "ios",
    status: "in-queue",
    gitCommitHash: "aabbccdd00112233445566778899aabbccddeeff",
    gitRef: "refs/heads/main",
    ...overrides,
  };
}

// Suppress console output during tests
beforeAll(() => {
  jest.spyOn(console, "log").mockImplementation(() => undefined);
  jest.spyOn(console, "error").mockImplementation(() => undefined);
  jest.spyOn(process.stdout, "write").mockImplementation(() => true);
});

afterAll(() => {
  jest.restoreAllMocks();
});

// ─── resolveEasCli ────────────────────────────────────────────────────────────

describe("resolveEasCli", () => {
  it("uses npx + eas-cli prefix when EAS_CLI is not set (correct npm package name)", () => {
    // The npm package for Expo's EAS CLI is `eas-cli`, not `eas` (which is an
    // unrelated package). This test guards against regressing to the wrong name.
    const result = resolveEasCli({});
    expect(result).toEqual({ bin: "npx", prefix: ["eas-cli"] });
  });

  it("uses the EAS_CLI binary directly when set (CI mode)", () => {
    const result = resolveEasCli({ EAS_CLI: "eas" });
    expect(result).toEqual({ bin: "eas", prefix: [] });
  });

  it("accepts a custom path from EAS_CLI (e.g. /usr/local/bin/eas)", () => {
    const result = resolveEasCli({ EAS_CLI: "/usr/local/bin/eas" });
    expect(result).toEqual({ bin: "/usr/local/bin/eas", prefix: [] });
  });
});

// ─── parseArgs ────────────────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("returns nulls and false when no flags given", () => {
    expect(parseArgs([])).toEqual({ branch: null, head: null, dryRun: false });
  });

  it("parses --branch and --head", () => {
    const result = parseArgs(["--branch", "main", "--head", "abc123"]);
    expect(result.branch).toBe("main");
    expect(result.head).toBe("abc123");
    expect(result.dryRun).toBe(false);
  });

  it("parses --dry-run flag", () => {
    expect(parseArgs(["--dry-run"]).dryRun).toBe(true);
  });

  it("parses all flags together", () => {
    const r = parseArgs([
      "--branch",
      "release/1.0",
      "--head",
      "deadbeef",
      "--dry-run",
    ]);
    expect(r).toEqual({
      branch: "release/1.0",
      head: "deadbeef",
      dryRun: true,
    });
  });
});

// ─── filterStaleBuilds ────────────────────────────────────────────────────────

describe("filterStaleBuilds", () => {
  const HEAD = "aabbccdd00112233445566778899aabbccddeeff";
  const OLD = "1111222233334444555566667777888899990000";

  it("returns empty when no builds provided", () => {
    expect(filterStaleBuilds([], "main", HEAD)).toHaveLength(0);
  });

  it("keeps a stale build on the same branch", () => {
    const b = makeBuild({ gitCommitHash: OLD, gitRef: "refs/heads/main" });
    expect(filterStaleBuilds([b], "main", HEAD)).toEqual([b]);
  });

  it("skips a current-commit build on the same branch", () => {
    const b = makeBuild({ gitCommitHash: HEAD, gitRef: "refs/heads/main" });
    expect(filterStaleBuilds([b], "main", HEAD)).toHaveLength(0);
  });

  it("skips a stale build on a DIFFERENT branch", () => {
    const b = makeBuild({
      gitCommitHash: OLD,
      gitRef: "refs/heads/release/2.0",
    });
    expect(filterStaleBuilds([b], "main", HEAD)).toHaveLength(0);
  });

  it("handles branch without refs/heads/ prefix in gitRef", () => {
    const b = makeBuild({ gitCommitHash: OLD, gitRef: "main" });
    expect(filterStaleBuilds([b], "main", HEAD)).toEqual([b]);
  });

  it("is case-SENSITIVE for branch comparison — 'main' does not match 'Main'", () => {
    // Git ref names are case-sensitive; "main" and "Main" are distinct branches.
    const b = makeBuild({ gitCommitHash: OLD, gitRef: "refs/heads/Main" });
    expect(filterStaleBuilds([b], "main", HEAD)).toHaveLength(0);
  });

  it("matches when case is identical", () => {
    const b = makeBuild({ gitCommitHash: OLD, gitRef: "refs/heads/main" });
    expect(filterStaleBuilds([b], "main", HEAD)).toEqual([b]);
  });

  it("skips builds with no gitCommitHash", () => {
    const b: EasBuild = {
      id: "x",
      platform: "ios",
      status: "new",
      gitCommitHash: "",
      gitRef: "refs/heads/main",
    };
    expect(filterStaleBuilds([b], "main", HEAD)).toHaveLength(0);
  });

  it("skips builds with unknown branch when target branch is set", () => {
    // Build has no gitRef at all — we cannot confirm the branch, skip safely
    const b: EasBuild = {
      id: "no-branch",
      platform: "ios",
      status: "in-queue",
      gitCommitHash: OLD,
    };
    expect(filterStaleBuilds([b], "main", HEAD)).toHaveLength(0);
  });

  it("returns NO matches when branch is empty — never cancels cross-branch (detached HEAD guard)", () => {
    // Defence-in-depth: if branch is empty (detached HEAD / run() already throws,
    // but filterStaleBuilds must also be safe when called directly), no build is
    // selected regardless of commit match.
    const stale = makeBuild({ gitCommitHash: OLD, gitRef: "refs/heads/main" });
    const stale2 = makeBuild({
      id: "s2",
      gitCommitHash: OLD,
      gitRef: "refs/heads/release",
    });
    expect(filterStaleBuilds([stale, stale2], "", HEAD)).toHaveLength(0);
  });

  it("matches short HEAD prefix against full stored hash", () => {
    const b = makeBuild({ gitCommitHash: HEAD, gitRef: "refs/heads/main" });
    // Using a short prefix that matches HEAD should NOT mark it stale
    expect(filterStaleBuilds([b], "main", HEAD.slice(0, 7))).toHaveLength(0);
  });

  it("cancels multiple stale builds, keeps current ones", () => {
    const stale1 = makeBuild({
      id: "s1",
      gitCommitHash: OLD,
      gitRef: "refs/heads/main",
    });
    const stale2 = makeBuild({
      id: "s2",
      gitCommitHash: "deadbeef" + OLD.slice(8),
      gitRef: "main",
    });
    const current = makeBuild({
      id: "c1",
      gitCommitHash: HEAD,
      gitRef: "main",
    });
    const other = makeBuild({
      id: "o1",
      gitCommitHash: OLD,
      gitRef: "refs/heads/release",
    });

    const result = filterStaleBuilds(
      [stale1, stale2, current, other],
      "main",
      HEAD,
    );
    expect(result.map((b) => b.id)).toEqual(["s1", "s2"]);
  });
});

// ─── listBuilds ───────────────────────────────────────────────────────────────

// We mock the child_process module at the Jest module level
jest.mock("child_process", () => ({
  execSync: jest.fn(),
  spawnSync: jest.fn(),
}));

const cp = require("child_process") as {
  execSync: jest.Mock;
  spawnSync: jest.Mock;
};

// ─── verifyBranchTip ──────────────────────────────────────────────────────────

describe("verifyBranchTip", () => {
  const HEAD = "aabbccdd00112233445566778899aabbccddeeff";
  const NEWER = "deadbeef11223344556677889900aabbccddeeff";

  afterEach(() => jest.clearAllMocks());

  it("returns true when remote tip matches HEAD", () => {
    cp.spawnSync.mockReturnValue({
      status: 0,
      stdout: `${HEAD}\trefs/heads/main\n`,
      stderr: "",
    });
    expect(verifyBranchTip("main", HEAD)).toBe(true);
  });

  it("returns false when remote tip is a DIFFERENT sha (branch has advanced)", () => {
    // This is the key cross-push race scenario: an older workflow run calls
    // verifyBranchTip after a newer push has already landed. NEWER != HEAD so
    // the run should abort rather than cancel the newest build.
    cp.spawnSync.mockReturnValue({
      status: 0,
      stdout: `${NEWER}\trefs/heads/main\n`,
      stderr: "",
    });
    expect(verifyBranchTip("main", HEAD)).toBe(false);
  });

  it("returns null when branch is empty (no branch info)", () => {
    expect(verifyBranchTip("", HEAD)).toBeNull();
  });

  it("returns null when remote returns empty output (branch not found)", () => {
    cp.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" });
    expect(verifyBranchTip("main", HEAD)).toBeNull();
  });

  it("returns null when git ls-remote exits non-zero (no remote)", () => {
    cp.spawnSync.mockReturnValue({
      status: 128,
      stdout: "",
      stderr: "not a git repository",
    });
    expect(verifyBranchTip("main", HEAD)).toBeNull();
  });

  it("passes branch name as a literal argv element, NOT via shell (injection safety)", () => {
    // A branch name with shell metacharacters must reach git as a literal
    // argument — never be evaluated by a shell (no execSync with a string).
    const hostileBranch = 'x$(echo PWNED)";evil';
    cp.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" });
    verifyBranchTip(hostileBranch, HEAD);

    // Confirm spawnSync was called with the branch as an argv element
    const call = cp.spawnSync.mock.calls[0];
    expect(call[0]).toBe("git");
    expect(call[1]).toContain(`refs/heads/${hostileBranch}`);
    // execSync must NOT have been called (that would mean a shell string)
    expect(cp.execSync).not.toHaveBeenCalled();
  });
});

describe("listBuilds", () => {
  const OPTS: CliOpts = { projectRoot: "/fake/root", env: {} };

  afterEach(() => jest.clearAllMocks());

  it("returns parsed array on success", () => {
    const builds = [makeBuild()];
    cp.spawnSync.mockReturnValue({
      status: 0,
      stdout: JSON.stringify(builds),
      stderr: "",
    });

    const result = listBuilds("in-queue", OPTS);
    expect(result).toEqual(builds);
  });

  it("strips non-JSON preamble (upgrade notices) before parsing", () => {
    const builds = [makeBuild()];
    cp.spawnSync.mockReturnValue({
      status: 0,
      stdout: "★ eas-cli@21.x is now available.\n" + JSON.stringify(builds),
      stderr: "",
    });

    expect(listBuilds("in-queue", OPTS)).toEqual(builds);
  });

  it("returns empty array when stdout is empty and exit code is 0", () => {
    cp.spawnSync.mockReturnValue({ status: 0, stdout: "", stderr: "" });
    expect(listBuilds("new", OPTS)).toEqual([]);
  });

  it("THROWS when the CLI exits non-zero (never silently succeeds)", () => {
    cp.spawnSync.mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "Unauthorized",
    });

    expect(() => listBuilds("in-queue", OPTS)).toThrow(/exited 1/);
  });

  it("THROWS when stdout has content but no JSON array", () => {
    cp.spawnSync.mockReturnValue({
      status: 0,
      stdout: "completely unexpected non-json text",
      stderr: "",
    });

    expect(() => listBuilds("in-progress", OPTS)).toThrow(/non-JSON/);
  });

  it("THROWS when spawnSync itself errors (binary not found)", () => {
    cp.spawnSync.mockReturnValue({
      status: null,
      stdout: "",
      stderr: "",
      error: new Error("ENOENT"),
    });

    expect(() => listBuilds("new", OPTS)).toThrow(/spawn error/);
  });
});

// ─── collectActiveBuilds ─────────────────────────────────────────────────────

describe("collectActiveBuilds", () => {
  const OPTS: CliOpts = { projectRoot: "/fake/root", env: {} };

  afterEach(() => jest.clearAllMocks());

  it("merges results across all three cancellable statuses", () => {
    const build1 = makeBuild({ id: "b1", status: "new" });
    const build2 = makeBuild({ id: "b2", status: "in-queue" });
    const build3 = makeBuild({ id: "b3", status: "in-progress" });

    // Successive spawnSync calls return each batch in order
    cp.spawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([build1]),
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([build2]),
        stderr: "",
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([build3]),
        stderr: "",
      });

    const result = collectActiveBuilds(OPTS);
    expect(result.map((b: EasBuild) => b.id)).toEqual(["b1", "b2", "b3"]);
    expect(cp.spawnSync).toHaveBeenCalledTimes(3);
  });

  it("THROWS if the second status query fails (never silently returns partial list)", () => {
    cp.spawnSync
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "Network error",
      });

    expect(() => collectActiveBuilds(OPTS)).toThrow(/exited 1/);
  });

  it("returns empty array when all queries return empty", () => {
    cp.spawnSync.mockReturnValue({ status: 0, stdout: "[]", stderr: "" });
    expect(collectActiveBuilds(OPTS)).toEqual([]);
  });
});

// ─── cancelBuild ─────────────────────────────────────────────────────────────

describe("cancelBuild", () => {
  const OPTS: CliOpts = { projectRoot: "/fake/root", env: {} };

  afterEach(() => jest.clearAllMocks());

  it("returns true when eas exits 0", () => {
    cp.spawnSync.mockReturnValue({
      status: 0,
      stdout: "Cancelled.",
      stderr: "",
    });
    expect(cancelBuild("build-abc", OPTS)).toBe(true);
  });

  it("returns false when eas exits non-zero", () => {
    cp.spawnSync.mockReturnValue({
      status: 1,
      stdout: "",
      stderr: "Build already finished",
    });
    expect(cancelBuild("build-abc", OPTS)).toBe(false);
  });
});

// ─── run() ───────────────────────────────────────────────────────────────────

describe("run()", () => {
  const HEAD = "aabbccdd00112233445566778899aabbccddeeff";
  const OLD = "1111222233334444555566667777888899990000";
  const OVERRIDES: Partial<CliOpts> = { projectRoot: "/fake/root", env: {} };

  // resetAllMocks (not clearAllMocks) also clears mockReturnValue implementations,
  // preventing a previous test's execSync mock from leaking into the next test.
  afterEach(() => jest.resetAllMocks());

  it("returns { cancelled: 0 } when no active builds exist", async () => {
    cp.spawnSync.mockReturnValue({ status: 0, stdout: "[]", stderr: "" });

    const result = await run(["--branch", "main", "--head", HEAD], OVERRIDES);
    expect(result).toEqual({ cancelled: 0, skipped: 0 });
  });

  it("returns { cancelled: 0 } when all active builds are on HEAD", async () => {
    const currentBuild = makeBuild({
      gitCommitHash: HEAD,
      gitRef: "refs/heads/main",
    });
    // listBuilds × 3, then verifyBranchTip (git ls-remote) → HEAD matches
    cp.spawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([currentBuild]),
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      // verifyBranchTip: git ls-remote returns HEAD → tip still matches
      .mockReturnValueOnce({
        status: 0,
        stdout: `${HEAD}\trefs/heads/main\n`,
        stderr: "",
      });

    const result = await run(["--branch", "main", "--head", HEAD], OVERRIDES);
    expect(result).toEqual({ cancelled: 0, skipped: 0 });
  });

  it("cancels stale builds and returns count", async () => {
    const staleBuild = makeBuild({
      id: "stale-1",
      gitCommitHash: OLD,
      gitRef: "refs/heads/main",
    });

    // listBuilds × 3, verifyBranchTip (git ls-remote), cancelBuild × 1
    cp.spawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([staleBuild]),
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      // verifyBranchTip: tip still matches HEAD — safe to proceed
      .mockReturnValueOnce({
        status: 0,
        stdout: `${HEAD}\trefs/heads/main\n`,
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "Cancelled.", stderr: "" });

    const result = await run(["--branch", "main", "--head", HEAD], OVERRIDES);
    expect(result).toEqual({ cancelled: 1, skipped: 0 });
  });

  it("does NOT cancel builds on a different branch", async () => {
    const otherBuild = makeBuild({
      id: "other-1",
      gitCommitHash: OLD,
      gitRef: "refs/heads/release/2.0",
    });

    // listBuilds × 3, verifyBranchTip — filterStaleBuilds returns empty after
    cp.spawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([otherBuild]),
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      // verifyBranchTip: tip still matches HEAD
      .mockReturnValueOnce({
        status: 0,
        stdout: `${HEAD}\trefs/heads/main\n`,
        stderr: "",
      });

    const result = await run(["--branch", "main", "--head", HEAD], OVERRIDES);
    const cancelCalls = (cp.spawnSync.mock.calls as string[][]).filter((c) =>
      c[1]?.includes("build:cancel"),
    );
    expect(cancelCalls).toHaveLength(0);
    expect(result.cancelled).toBe(0);
  });

  it("dry-run returns skipped count without calling cancel", async () => {
    const staleBuild = makeBuild({
      id: "stale-dry",
      gitCommitHash: OLD,
      gitRef: "refs/heads/main",
    });

    // Three listBuilds calls (new, in-queue, in-progress) — only the first
    // returns a build; the others are empty so we get exactly 1 stale build.
    cp.spawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([staleBuild]),
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" });

    const result = await run(
      ["--branch", "main", "--head", HEAD, "--dry-run"],
      OVERRIDES,
    );

    expect(result).toEqual({ cancelled: 0, skipped: 1 });
    const cancelCalls = (cp.spawnSync.mock.calls as string[][]).filter((c) =>
      c[1]?.includes("build:cancel"),
    );
    expect(cancelCalls).toHaveLength(0);
  });

  it("throws without querying EAS when branch cannot be resolved (detached HEAD / no --branch)", async () => {
    // When branch is empty the script must abort before touching EAS — cancelling
    // all stale builds across every branch would be destructive.
    // Simulate a detached HEAD: git rev-parse HEAD returns a sha, but
    // git rev-parse --abbrev-ref HEAD returns "HEAD" (the sentinel for detached).
    cp.execSync
      .mockReturnValueOnce(`${HEAD}\n`) // git rev-parse HEAD
      .mockReturnValueOnce("HEAD\n"); // git rev-parse --abbrev-ref HEAD → detached

    await expect(run(["--head", HEAD], OVERRIDES)).rejects.toThrow(/branch/i);

    // EAS (spawnSync) must not have been queried at all
    expect(cp.spawnSync).not.toHaveBeenCalled();
  });

  it("aborts without cancelling when verifyBranchTip cannot reach origin (fail-closed)", async () => {
    // When git ls-remote fails (network/auth/missing remote), tipMatch is null.
    // The guard must ABORT rather than proceed — a failed check is not a pass.
    const staleBuild = makeBuild({
      id: "stale-nonet",
      gitCommitHash: OLD,
      gitRef: "refs/heads/main",
    });

    // listBuilds × 3
    cp.spawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([staleBuild]),
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      // verifyBranchTip: git ls-remote fails (no network)
      .mockReturnValueOnce({
        status: 128,
        stdout: "",
        stderr: "fatal: not a git repository",
      });

    const result = await run(["--branch", "main", "--head", HEAD], OVERRIDES);

    // Must NOT call build:cancel — we can't confirm we are still the latest push
    const cancelCalls = (cp.spawnSync.mock.calls as string[][]).filter((c) =>
      c[1]?.includes("build:cancel"),
    );
    expect(cancelCalls).toHaveLength(0);
    expect(result).toEqual({ cancelled: 0, skipped: 0 });
  });

  it("aborts without cancelling when branch has advanced (latest-push guard)", async () => {
    // Scenario: this is an older workflow run triggered by push A. While we were
    // querying EAS, push B landed. The remote branch tip is now B's SHA, not A's.
    // We must NOT cancel B's build. The run should return safely with 0 cancels.
    const NEWER_SHA = "deadbeef11223344556677889900aabbccddeeff";
    const staleBuild = makeBuild({
      id: "stale-a",
      gitCommitHash: OLD,
      gitRef: "refs/heads/main",
    });

    // listBuilds × 3 return the stale build
    cp.spawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([staleBuild]),
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" });

    // verifyBranchTip calls spawnSync("git", ["ls-remote", ...]) and gets a NEWER sha
    cp.spawnSync.mockReturnValueOnce({
      status: 0,
      stdout: `${NEWER_SHA}\trefs/heads/main\n`,
      stderr: "",
    });

    const result = await run(["--branch", "main", "--head", HEAD], OVERRIDES);

    // Must NOT call build:cancel — the branch has advanced
    const cancelCalls = (cp.spawnSync.mock.calls as string[][]).filter((c) =>
      c[1]?.includes("build:cancel"),
    );
    expect(cancelCalls).toHaveLength(0);
    expect(result).toEqual({ cancelled: 0, skipped: 0 });
  });

  it("throws if any status query fails", async () => {
    cp.spawnSync
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "Unauthorized",
      });

    await expect(
      run(["--branch", "main", "--head", HEAD], OVERRIDES),
    ).rejects.toThrow();
  });

  it("throws with exitCode 2 when some cancellations fail", async () => {
    const staleBuild = makeBuild({
      id: "stale-fail",
      gitCommitHash: OLD,
      gitRef: "refs/heads/main",
    });

    cp.spawnSync
      .mockReturnValueOnce({
        status: 0,
        stdout: JSON.stringify([staleBuild]),
        stderr: "",
      })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      .mockReturnValueOnce({ status: 0, stdout: "[]", stderr: "" })
      // verifyBranchTip: tip still matches HEAD — proceed with cancel
      .mockReturnValueOnce({
        status: 0,
        stdout: `${HEAD}\trefs/heads/main\n`,
        stderr: "",
      })
      // cancelBuild → fail
      .mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "Already cancelled",
      });

    const error = await run(
      ["--branch", "main", "--head", HEAD],
      OVERRIDES,
    ).catch((e: Error & { exitCode?: number }) => e);
    expect((error as { exitCode?: number }).exitCode).toBe(2);
  });
});
