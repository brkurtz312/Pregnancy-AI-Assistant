#!/usr/bin/env node
/**
 * cancel-stale-eas-builds.js
 *
 * Cancels queued / in-progress EAS builds that:
 *   1. Belong to the specified git branch (--branch <name>), AND
 *   2. Have a commit hash that does NOT match the given HEAD sha (--head <sha>).
 *
 * Builds on OTHER branches are never touched, so parallel release/preview work
 * is safe.
 *
 * Usage (typically invoked by the GitHub Actions workflow):
 *   node scripts/cancel-stale-eas-builds.js \
 *     --branch main \
 *     --head abc1234def5678 \
 *     [--dry-run]
 *
 * Without explicit flags the script falls back to the local git state:
 *   node scripts/cancel-stale-eas-builds.js [--dry-run]
 *
 * Requires eas-cli (npx eas) and EXPO_TOKEN set in the environment.
 *
 * Exit codes:
 *   0  — completed successfully (including "nothing to cancel")
 *   1  — could not query EAS (auth, network, parse error) → explicit failure
 *   2  — one or more cancellation requests failed
 */

const { execSync, spawnSync } = require("child_process");
const path = require("path");

const PROJECT_ROOT = path.resolve(__dirname, "..");

// ─── Argument parsing ────────────────────────────────────────────────────────

/**
 * @param {string[]} argv  process.argv slice (everything after the script name)
 * @returns {{ branch: string|null, head: string|null, dryRun: boolean }}
 */
function parseArgs(argv) {
  const result = { branch: null, head: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--branch" && argv[i + 1]) result.branch = argv[++i];
    else if (argv[i] === "--head" && argv[i + 1]) result.head = argv[++i];
    else if (argv[i] === "--dry-run") result.dryRun = true;
  }
  return result;
}

// ─── Git helpers ─────────────────────────────────────────────────────────────

/**
 * Verify that `headSha` is still the remote tip of `branch`.
 *
 * This is the "latest-push guard": after collecting active EAS builds (a
 * network call that takes time), another push may have landed and created a
 * newer build. Without this check an older, delayed workflow run would
 * incorrectly classify the newer build's SHA as stale and cancel it.
 *
 * Returns `true` if HEAD is still the branch tip (safe to proceed).
 * Returns `false` if the branch has advanced (abort, do not cancel anything).
 * Returns `null` if the tip cannot be determined (e.g. no remote), in which
 * case the caller decides whether to proceed or abort conservatively.
 *
 * @param {string} branch   Branch name (without refs/heads/)
 * @param {string} headSha  The SHA this run was triggered for
 * @returns {boolean|null}
 */
function verifyBranchTip(branch, headSha) {
  if (!branch) return null; // No branch info — cannot verify
  try {
    // Use spawnSync (not execSync with a shell string) so the branch name is
    // passed as a literal argv element — never evaluated by a shell.  A branch
    // like `x$(command)` would be executed if embedded in a shell command string.
    const result = spawnSync(
      "git",
      ["ls-remote", "origin", `refs/heads/${branch}`],
      { encoding: "utf8" },
    );
    if (result.error || result.status !== 0) return null;
    const output = (result.stdout || "").trim();
    if (!output) return null; // Branch not found on remote
    const remoteSha = output.split(/\s+/)[0].toLowerCase();
    const head = headSha.toLowerCase();
    return remoteSha.startsWith(head) || head.startsWith(remoteSha);
  } catch {
    return null; // git unavailable or failed
  }
}

/**
 * Resolve HEAD commit and current branch from the local git repo.
 * Returns `{ head: string, branch: string }` or throws.
 */
function resolveGitState() {
  const head = execSync("git rev-parse HEAD", { encoding: "utf8" }).trim();
  let branch;
  try {
    branch = execSync("git rev-parse --abbrev-ref HEAD", {
      encoding: "utf8",
    }).trim();
    // Detached HEAD → EAS sends the commit hash as the ref; treat as empty
    if (branch === "HEAD") branch = "";
  } catch {
    branch = "";
  }
  return { head, branch };
}

// ─── EAS CLI helpers ─────────────────────────────────────────────────────────

const CANCELLABLE_STATUSES = ["new", "in-queue", "in-progress"];

/**
 * Resolve the EAS CLI binary and its argument prefix.
 *
 * In CI the `expo/expo-github-action` step installs `eas-cli` globally, so we
 * must invoke it as `eas` directly — using `npx eas` would resolve a *different*
 * (potentially un-authenticated) version from the npm registry.
 *
 * Set `EAS_CLI=eas` in the environment to use the globally installed binary.
 * When `EAS_CLI` is not set (local development), fall back to `npx eas-cli`
 * (the correct npm package name for the Expo EAS CLI; `npx eas` would invoke
 * an unrelated package of the same short name).
 *
 * @param {Record<string,string>} env
 * @returns {{ bin: string, prefix: string[] }}
 */
function resolveEasCli(env) {
  const cli = env.EAS_CLI || "";
  if (cli) return { bin: cli, prefix: [] };
  return { bin: "npx", prefix: ["eas-cli"] };
}

/**
 * Invoke `eas build:list` for one status and return the parsed JSON array.
 * Throws (with a descriptive message) on any CLI or parse error.
 *
 * @param {string} status  One of CANCELLABLE_STATUSES
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {Record<string,string>} opts.env
 * @returns {object[]}
 */
function listBuilds(status, { projectRoot, env }) {
  const { bin, prefix } = resolveEasCli(env);
  const result = spawnSync(
    bin,
    [
      ...prefix,
      "build:list",
      "--status",
      status,
      "--limit",
      "50",
      "--json",
      "--non-interactive",
    ],
    { cwd: projectRoot, encoding: "utf8", env },
  );

  if (result.error) {
    throw new Error(`eas build:list spawn error: ${result.error.message}`);
  }

  const stdout = (result.stdout || "").trim();
  const stderr = (result.stderr || "").trim();

  if (result.status !== 0) {
    throw new Error(
      `eas build:list --status ${status} exited ${result.status}.\n${stderr}`,
    );
  }

  // EAS CLI may prepend non-JSON upgrade notices; find the JSON array start.
  const arrayStart = stdout.indexOf("[");
  if (arrayStart === -1) {
    // If stdout is truly empty, EAS returned no data — treat as empty list.
    // If stdout has content but no "[", it's an unexpected non-JSON response.
    if (stdout.length > 0) {
      throw new Error(
        `eas build:list --status ${status} returned non-JSON output: ${stdout.slice(0, 200)}`,
      );
    }
    return [];
  }

  let parsed;
  try {
    parsed = JSON.parse(stdout.slice(arrayStart));
  } catch (err) {
    throw new Error(
      `eas build:list --status ${status} returned non-JSON output: ${err.message}\nstdout: ${stdout.slice(0, 200)}`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `eas build:list --status ${status} returned unexpected shape (expected array)`,
    );
  }

  return parsed;
}

/**
 * Cancel a single EAS build by ID.
 * Returns true on success, false on failure (logs the error).
 *
 * @param {string} buildId
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {Record<string,string>} opts.env
 * @returns {boolean}
 */
function cancelBuild(buildId, { projectRoot, env }) {
  const { bin, prefix } = resolveEasCli(env);
  const result = spawnSync(
    bin,
    [...prefix, "build:cancel", buildId, "--non-interactive"],
    { cwd: projectRoot, encoding: "utf8", env },
  );

  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || "").trim();
    console.error(`  ✗ Failed to cancel ${buildId}: ${stderr}`);
    return false;
  }

  return true;
}

// ─── Core logic ──────────────────────────────────────────────────────────────

/**
 * Collect all active builds across every cancellable status.
 * Throws if ANY status query fails — we must not assume "no builds" when the
 * query errored; that would make the safety net silently ineffective.
 *
 * @param {object} opts
 * @param {string} opts.projectRoot
 * @param {Record<string,string>} opts.env
 * @returns {object[]}
 */
function collectActiveBuilds({ projectRoot, env }) {
  const all = [];
  for (const status of CANCELLABLE_STATUSES) {
    // Throws on any failure; caller decides whether to surface/exit.
    const builds = listBuilds(status, { projectRoot, env });
    all.push(...builds);
  }
  return all;
}

/**
 * Filter to builds that should be cancelled:
 *   - On the target branch (gitCommitRef matches, case-insensitive)
 *   - Commit hash is known AND differs from HEAD
 *
 * Builds with no gitCommitHash are skipped (not cancellable safely).
 * Builds on a different branch are always skipped.
 *
 * @param {object[]} builds    Raw EAS build objects
 * @param {string}   branch    Target branch name (e.g. "main")
 * @param {string}   headSha   Current HEAD commit hash (full or short)
 * @returns {object[]}
 */
function filterStaleBuilds(builds, branch, headSha) {
  return builds.filter((b) => {
    if (!b.gitCommitHash) return false;
    // Normalise: some EAS fields use full refs like "refs/heads/main"
    const buildBranch = (b.gitRef || b.gitCommitRef || "")
      .replace(/^refs\/heads\//, "")
      .trim();

    // Only touch builds whose branch matches exactly (case-sensitive — git refs
    // are case-sensitive, so "main" and "Main" are different branches).
    // If branch is empty (detached HEAD / unknown), return false as a
    // defence-in-depth: the caller already aborts before reaching here, but
    // keep this safe by design so callers can never accidentally cancel
    // builds across every branch.
    if (!branch || !buildBranch || buildBranch !== branch) {
      return false;
    }

    // Cancel if the commit doesn't match HEAD
    const commitFull = b.gitCommitHash.toLowerCase();
    const headFull = headSha.toLowerCase();
    return !commitFull.startsWith(headFull) && !headFull.startsWith(commitFull);
  });
}

// ─── Entry point ─────────────────────────────────────────────────────────────

/**
 * Main function — separated from the module so it can be tested.
 *
 * @param {string[]} argv     CLI arguments (process.argv.slice(2))
 * @param {object}   overrides
 * @param {string}   [overrides.projectRoot]
 * @param {Record<string,string>} [overrides.env]
 * @returns {Promise<{ cancelled: number, skipped: number }>}
 */
async function run(argv, overrides = {}) {
  const args = parseArgs(argv);
  const isDryRun = args.dryRun;
  const projectRoot = overrides.projectRoot || PROJECT_ROOT;
  const env = overrides.env || process.env;

  if (isDryRun) {
    console.log("DRY RUN — no builds will actually be cancelled.\n");
  }

  // Resolve branch + head from CLI flags or local git
  let branch = args.branch || "";
  let headSha = args.head || "";

  if (!headSha || !branch) {
    const gitState = resolveGitState();
    if (!headSha) headSha = gitState.head;
    if (!branch) branch = gitState.branch;
  }

  if (!headSha) {
    throw new Error(
      "Could not determine HEAD commit SHA. Pass --head <sha> or run inside a git repository.",
    );
  }

  if (!branch) {
    // A detached HEAD (e.g. during a rebase, tag checkout, or certain CI
    // shallow clones) yields an empty branch.  Without a branch we cannot
    // scope the filter to just this branch's builds — cancelling every
    // build whose commit differs from HEAD would be destructive.
    throw new Error(
      "Could not determine the current branch name. " +
        "Pass --branch <name> or ensure git is not in detached-HEAD state.",
    );
  }

  console.log(`Branch      : ${branch}`);
  console.log(`HEAD commit : ${headSha}`);
  console.log("Querying active EAS builds…\n");

  // Collect — throws on any query failure so we never silently no-op
  const activeBuilds = collectActiveBuilds({ projectRoot, env });

  if (activeBuilds.length === 0) {
    console.log("No active builds found. Nothing to do.");
    return { cancelled: 0, skipped: 0 };
  }

  console.log(`Found ${activeBuilds.length} active build(s):`);
  for (const b of activeBuilds) {
    const commitShort = (b.gitCommitHash || "unknown").slice(0, 8);
    const buildBranch = (b.gitRef || b.gitCommitRef || "").replace(
      /^refs\/heads\//,
      "",
    );
    const stale = filterStaleBuilds([b], branch, headSha).length > 0;
    const marker = stale ? "STALE" : "keep";
    console.log(
      `  ${b.id}  platform=${b.platform}  status=${b.status}  branch=${buildBranch || "?"}  commit=${commitShort}  [${marker}]`,
    );
  }

  // Latest-push guard: verify the branch tip hasn't advanced since this
  // workflow run started. If another push landed while we were querying EAS,
  // the remote HEAD is now a newer SHA — our headSha is itself stale, so
  // any build we'd "cancel" may belong to the newer push. Abort safely.
  if (branch && !isDryRun) {
    const tipMatch = verifyBranchTip(branch, headSha);
    if (tipMatch === false) {
      console.log(
        `\nBranch "${branch}" has advanced beyond ${headSha.slice(0, 8)} since this run started.`,
      );
      console.log(
        "Aborting — a newer push is in control; do not cancel its builds.",
      );
      return { cancelled: 0, skipped: 0 };
    }
    if (tipMatch === null) {
      // Could not confirm whether the branch tip still matches (network error,
      // missing remote, git unavailable, etc.). Fail CLOSED: do not cancel any
      // builds when we cannot guarantee this is still the latest run for the
      // branch. A false cancellation is worse than a skipped one.
      console.log(
        `\nCould not verify remote tip for "${branch}" — aborting to avoid cancelling a newer build.`,
      );
      console.log(
        "Ensure git remote 'origin' is reachable and EXPO_TOKEN is valid.",
      );
      return { cancelled: 0, skipped: 0 };
    }
  }

  const staleBuilds = filterStaleBuilds(activeBuilds, branch, headSha);

  if (staleBuilds.length === 0) {
    console.log("\nNo stale builds on this branch. Nothing to cancel.");
    return { cancelled: 0, skipped: 0 };
  }

  console.log(
    `\nCancelling ${staleBuilds.length} stale build(s) on branch "${branch}"…`,
  );
  let cancelled = 0;
  let failed = 0;

  for (const build of staleBuilds) {
    const commitShort = build.gitCommitHash.slice(0, 8);
    process.stdout.write(
      `  Cancelling ${build.id} (${build.platform}, commit ${commitShort})… `,
    );

    if (isDryRun) {
      console.log("[skipped — dry run]");
      continue;
    }

    const ok = cancelBuild(build.id, { projectRoot, env });
    if (ok) {
      console.log("✓ cancelled");
      cancelled++;
    } else {
      failed++;
    }
  }

  if (isDryRun) {
    console.log(
      `\nDry run complete. Would have cancelled ${staleBuilds.length} build(s).`,
    );
    return { cancelled: 0, skipped: staleBuilds.length };
  }

  console.log(`\nDone. Cancelled: ${cancelled}  Failed: ${failed}`);

  if (failed > 0) {
    const err = new Error(`${failed} build(s) could not be cancelled`);
    err.exitCode = 2;
    throw err;
  }

  return { cancelled, skipped: 0 };
}

// Only run as a CLI — skip when required by tests
if (require.main === module) {
  run(process.argv.slice(2)).catch((err) => {
    console.error("\nError:", err.message);
    process.exit(err.exitCode || 1);
  });
}

// Exports for unit tests
module.exports = {
  parseArgs,
  resolveEasCli,
  verifyBranchTip,
  filterStaleBuilds,
  collectActiveBuilds,
  listBuilds,
  cancelBuild,
  run,
  CANCELLABLE_STATUSES,
};
