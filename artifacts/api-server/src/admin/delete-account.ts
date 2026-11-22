/**
 * Deletes an account on request, for people who no longer have the app.
 *
 * pregnancy-assistant.com/delete-account promises that an emailed request is
 * handled within 30 days. This runs the same deletion as the in-app Delete
 * Account button (lib/account-deletion.ts): app data is purged and the Clerk
 * account removed, with the same tombstone and retry. Optionally it also
 * deletes the person's RevenueCat customer record.
 *
 * Usage (from the repo root; dry run unless --yes is given):
 *
 *   pnpm --filter @workspace/api-server run admin:delete-account -- --email person@example.com
 *   pnpm --filter @workspace/api-server run admin:delete-account -- --email person@example.com --revenuecat --yes
 *   pnpm --filter @workspace/api-server run admin:delete-account -- --user user_abc123 --revenuecat --yes
 *
 * Options:
 *   --email <address>  Find the account by its sign-in email.
 *   --user <id>        Use a Clerk user ID directly (also for re-running after
 *                      the account itself is gone, e.g. to retry RevenueCat).
 *   --revenuecat       Also delete the RevenueCat customer (purchase history
 *                      held by RevenueCat). Apple and Google keep their own
 *                      store records regardless.
 *   --yes              Actually delete. Without it, only shows what would go.
 *
 * Environment (production values, from Railway):
 *   DATABASE_URL              The Postgres service's DATABASE_PUBLIC_URL when
 *                             run from a laptop (see docs/db-migration.md).
 *   CLERK_SECRET_KEY          Production Clerk secret key.
 *   REVENUECAT_PROJECT_ID     Only with --revenuecat.
 *   REVENUECAT_ADMIN_API_KEY  Only with --revenuecat: a RevenueCat v2 secret
 *                             key with customer read/write permission. The
 *                             server's own key is read-only on purpose, so this
 *                             is a separate key; keep it off Railway.
 */

import { clerkClient } from "@clerk/express";
import { createClient } from "@replit/revenuecat-sdk/client";
import { deleteCustomer } from "@replit/revenuecat-sdk";

export type AdminDeletionOptions = {
  email?: string;
  userId?: string;
  revenueCat: boolean;
  confirm: boolean;
};

export type AdminDeletionDeps = {
  /** Clerk user IDs whose account has this email address. */
  findUserIdsByEmail: (email: string) => Promise<string[]>;
  /** The in-app deletion: purge app data, then remove the Clerk account. */
  deleteAccount: (userId: string) => Promise<void>;
  /** Deletes the RevenueCat customer; resolves false if there was none. */
  deleteRevenueCatCustomer: (userId: string) => Promise<boolean>;
  log: (line: string) => void;
};

export function parseArgs(argv: string[]): AdminDeletionOptions {
  const options: AdminDeletionOptions = { revenueCat: false, confirm: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--") continue;
    if (arg === "--email" || arg === "--user") {
      const value = argv[++i];
      if (!value || value.startsWith("--")) {
        throw new Error(`${arg} needs a value.`);
      }
      if (arg === "--email") options.email = value.trim().toLowerCase();
      else options.userId = value.trim();
    } else if (arg === "--revenuecat") {
      options.revenueCat = true;
    } else if (arg === "--yes") {
      options.confirm = true;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }
  if (!options.email === !options.userId) {
    throw new Error("Give exactly one of --email or --user.");
  }
  if (options.userId && !options.userId.startsWith("user_")) {
    throw new Error(`"${options.userId}" is not a Clerk user ID (user_...).`);
  }
  return options;
}

/**
 * Resolves the account and deletes it. Returns the Clerk user ID acted on, or
 * null when nothing was found. Stops before deleting anything if the email
 * matches more than one account.
 */
export async function runAdminDeletion(
  options: AdminDeletionOptions,
  deps: AdminDeletionDeps,
): Promise<string | null> {
  let userId = options.userId ?? null;

  if (options.email) {
    const ids = await deps.findUserIdsByEmail(options.email);
    if (ids.length === 0) {
      deps.log(`No account uses ${options.email}. Nothing to delete.`);
      return null;
    }
    if (ids.length > 1) {
      throw new Error(
        `${options.email} matches ${ids.length} accounts (${ids.join(", ")}). ` +
          "Re-run with --user for the right one.",
      );
    }
    userId = ids[0];
    deps.log(`${options.email} is Clerk user ${userId}.`);
  }

  const id = userId!;
  const steps = [
    `delete app data and the sign-in account for ${id}`,
    ...(options.revenueCat ? [`delete RevenueCat customer ${id}`] : []),
  ];

  if (!options.confirm) {
    deps.log("Dry run. With --yes this would:");
    for (const step of steps) deps.log(`  - ${step}`);
    return id;
  }

  await deps.deleteAccount(id);
  deps.log(`Deleted app data and sign-in account for ${id}.`);

  if (options.revenueCat) {
    const existed = await deps.deleteRevenueCatCustomer(id);
    deps.log(
      existed
        ? `Deleted RevenueCat customer ${id}.`
        : `RevenueCat had no customer ${id}; nothing to delete there.`,
    );
  }

  deps.log("Done. Reply to the person to confirm their account was deleted.");
  return id;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} must be set.`);
  return value;
}

async function findUserIdsByEmail(email: string): Promise<string[]> {
  const { data } = await clerkClient.users.getUserList({
    emailAddress: [email],
  });
  return data.map((user) => user.id);
}

async function deleteRevenueCatCustomer(userId: string): Promise<boolean> {
  const client = createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    headers: {
      Authorization: `Bearer ${requireEnv("REVENUECAT_ADMIN_API_KEY")}`,
    },
  });
  const { error, response } = await deleteCustomer({
    client,
    path: {
      project_id: requireEnv("REVENUECAT_PROJECT_ID"),
      customer_id: userId,
    },
  });
  if (response?.status === 404) return false;
  if (error) {
    throw new Error(
      `RevenueCat refused to delete customer ${userId} ` +
        `(${response?.status}): ${JSON.stringify(error)}. ` +
        "Check that REVENUECAT_ADMIN_API_KEY has customer read/write permission.",
    );
  }
  return true;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  requireEnv("DATABASE_URL");
  requireEnv("CLERK_SECRET_KEY");
  if (options.revenueCat && options.confirm) {
    requireEnv("REVENUECAT_PROJECT_ID");
    requireEnv("REVENUECAT_ADMIN_API_KEY");
  }

  // Loaded here so --help-style mistakes fail before touching the database.
  const { deleteAccount } = await import("../lib/account-deletion");
  await runAdminDeletion(options, {
    findUserIdsByEmail,
    deleteAccount,
    deleteRevenueCatCustomer,
    log: (line) => console.log(line),
  });
}

const isEntryPoint =
  process.argv[1]?.replace(/\\/g, "/").endsWith("admin/delete-account.ts") ??
  false;

if (isEntryPoint) {
  main().then(
    () => process.exit(0),
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : error);
      process.exit(1);
    },
  );
}
