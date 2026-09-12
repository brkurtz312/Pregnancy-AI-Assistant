# Pregnancy AI Assistant — working notes

Monorepo: pnpm workspaces, TypeScript. Web (React/Vite), mobile (Expo SDK 54 +
watchOS), API (Express 5), Postgres + Drizzle.

**Status:** live on the App Store as of 11 Sep 2026, version 1.0.12 (build
1.0.58). Currently migrating off Replit.

## Before you change anything

- `.agents/memory/*.md` is a hard-won record of this project's traps. **Read the
  relevant note before touching an area.** Several of them cost days to learn.
  `MEMORY.md` is the index.
- Bryan is a physician, not a developer. Explain decisions in plain terms and
  give copy-pasteable commands rather than asking him to read diffs.
- He runs **Windows/PowerShell**. No `&&` between commands.

## Environment gotchas

- `pnpm install --ignore-scripts` — the root `preinstall` shells to `sh`, absent
  on Windows.
- `pnpm run typecheck` fails for the mobile package on any clean checkout:
  `check-watch-sync.js` compares `watchapp/` against `ios/`, which is a
  gitignored `expo prebuild` artifact. Bypass with
  `pnpm exec tsc -p tsconfig.json --noEmit` from the package. **Worth fixing so
  it skips when `ios/` is absent.**
- 65 typecheck errors in `__tests__/`, `plugins/__tests__/` and `test-helpers/`
  are pre-existing `@types/node` resolution noise. Judge changes by errors in
  `app/`, `components/`, `hooks/`, `contexts/`, `lib/`.
- Pre-existing test failures, unrelated to current work:
  `contractionHistoryDeleteSession` (date-label assertions — a real bug) and the
  two `withWatchExtension` suites (assert a prebuilt `ios/`).
- `git-lfs` is not installed; LFS files stay as pointers.
- EAS builds from GitHub `main`, not the laptop. `appVersionSource: remote`.

## Auth architecture — read this first

`hooks/useAppAuth.ts` is the **single source of truth** for "is this session
authenticated", who it is, and how to get a bearer token. Screens must use it,
never Clerk's `useAuth`/`useUser` directly.

Clerk is imported in exactly five places, and it should stay that way:
`app/(auth)/*`, `app/_layout.tsx` (ClerkProvider), `components/AccountSheet.tsx`,
`components/AuthTokenBridge.tsx`, and `useAppAuth.ts` itself.

**Why:** demo mode authenticates without Clerk. A first pass converted five
files and looked complete; twenty more screens were still gating on Clerk
directly, including six calling `getToken()` for manual fetches — those fail
_even where the UI unlocks_, so features load and then quietly fail to save.
Found only by testing on a device. If you add a screen that needs auth, use
`useAppAuth`.

## Demo mode (App Review)

`api-server/src/lib/demo-token.ts` + `routes/demo.ts` + the demo branch in
`middlewares/auth.ts`; mobile side in `lib/demo-session.ts` and
`app/(auth)/demo-access.tsx`.

`requireAuth` accepts a Clerk session **or** an HMAC-signed demo token whose
subject is always `demo:`-prefixed. Bounded three ways: unsetting
`DEMO_SESSION_SECRET` disables it entirely, subjects can't leave the demo
namespace, tokens expire with no refresh. 46 tests cover it.

**Now that the app is approved, `DEMO_SESSION_SECRET` can be unset on production
to close this path.** Do that deliberately, not as a side effect.

## Testing

```
pnpm install --ignore-scripts
pnpm --filter @workspace/api-server run test
pnpm --filter @workspace/pregnancy-calculator-mobile run test
pnpm run lint
```

CI runs lint, format, typecheck and tests on every pull request and every push
to `main` (`.github/workflows/ci.yml`). The mobile app is **not** covered — the
comment at the bottom of that file says why and what it would take. Run its
tests by hand until then.

Six api-server suites need `DATABASE_URL` and skip without it:
`account-deletion-schema`, `kick-sessions-watch-id-schema`,
`postgres-rate-limit-store`, `rate-limits-table-schema`,
`scribe-concurrent-limit` and `scribe-idempotency-db-persist`. They are real
integration tests — set `DATABASE_URL` and re-run to exercise them, and do run
them before anything that changes the schema.

`duplicate-prefix-guard` no longer needs a database; it only ever imported the
db module. It exists to catch a bad rate-limit prefix addition, so run it if
you add one.

## Known landmines

- **`sync-to-github.sh` exits 0 when `GITHUB_TOKEN` is unset.** The push no-ops
  silently. 354 commits once existed only in Replit because of this. Make it
  exit non-zero, or delete it once hosting moves.
- **`migrate-deletion-integrity.ts`** was in the Replit deploy build and never
  once succeeded — it runs `drizzle-kit push`, which prompts interactively, and
  Replit surfaces that prompt in the UI rather than the build log, so the build
  just hangs for 20 minutes and retries. Removed from `.replit`. It still needs
  a deliberate run.
- **Schema mismatch behind that:** the script's `CREATE TABLE` creates
  `created_at`/`updated_at`, but `lib/db/src/schema/account-deletion.ts`
  declares `requested_at`. Any fresh database hits the same prompt.
- **Bundle id is `app.replit.pregnancycalculator` and the app has shipped.** It
  is permanent now. A `com.pregnancyassistant.app` identifier exists in EAS
  credentials from an abandoned migration; it can't be used for this app.
