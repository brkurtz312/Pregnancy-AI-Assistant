/**
 * Keeps npm and yarn out, and stray lockfiles from accumulating.
 *
 * Written in Node rather than shell because the shell version — `sh -c '…'` —
 * only runs where `sh` exists. On Windows it fails after the install has
 * already succeeded, so every `pnpm install` on a Windows machine ends with a
 * non-zero exit and a "Command failed" that means nothing. Node is running
 * anyway; it is the one interpreter this repository can count on.
 */

import { existsSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

for (const name of ["package-lock.json", "yarn.lock"]) {
  const file = path.join(repoRoot, name);
  if (existsSync(file)) {
    rmSync(file, { force: true });
    console.warn(`Removed ${name} — this repository uses pnpm.`);
  }
}

// npm sets npm_config_user_agent for every package manager that wraps it, so
// this identifies the caller rather than trusting the command that was typed.
const agent = process.env.npm_config_user_agent ?? "";

if (!agent.startsWith("pnpm/")) {
  console.error(
    `\nThis repository uses pnpm. Detected: ${agent || "unknown package manager"}\n\n` +
      `  corepack enable && pnpm install\n`,
  );
  process.exit(1);
}
