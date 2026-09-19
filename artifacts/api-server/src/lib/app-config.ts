/**
 * Reads of the `app_config` key-value table, and the settings resolved from it.
 *
 * Two modules had grown byte-identical private copies of `getConfig` and the
 * redeem endpoint never grew one at all — it read the environment directly,
 * while `rotate-reviewer-code` wrote the database row. The code that made it
 * to App Store Connect and the code the server would accept were resolved by
 * two different rules, and nothing compared them.
 */

import { db, appConfigTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * A missing row and an unreachable database are both `null`: every caller
 * treats config as optional and has a defined behaviour without it, and a
 * request path should not fail because an optional lookup could not be made.
 */
export async function getConfig(key: string): Promise<string | null> {
  try {
    const [row] = await db
      .select()
      .from(appConfigTable)
      .where(eq(appConfigTable.key, key));
    return row?.value ?? null;
  } catch {
    return null;
  }
}

/**
 * The code a signed-in reviewer enters on the Profile tab to unlock the Full
 * Pregnancy Pass. It is not a password and never goes in App Store Connect's
 * demo-account fields.
 *
 * The database row wins so `rotate-reviewer-code` takes effect without a
 * redeploy, which is what it has always claimed to do. The env vars are the
 * fallback, in the order the reviewer scripts have always resolved them, so a
 * deployment that sets only DEV_ACCESS_CODE keeps working untouched.
 *
 * `check-reviewer-pass` resolves the same chain to decide whether a reviewer
 * can unlock the pass. Both must agree, or the health check reports on a code
 * the server would refuse.
 *
 * Returns the source alongside the code: when redemption fails, which of the
 * three supplied the code is the first thing worth knowing.
 */
export async function reviewerAccessCode(
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ code: string | null; source: string | null }> {
  const fromDb = await getConfig("reviewer_access_code");
  if (fromDb) return { code: fromDb, source: "app_config" };
  if (env.REVIEWER_ACCESS_CODE)
    return { code: env.REVIEWER_ACCESS_CODE, source: "REVIEWER_ACCESS_CODE" };
  if (env.DEV_ACCESS_CODE)
    return { code: env.DEV_ACCESS_CODE, source: "DEV_ACCESS_CODE" };
  return { code: null, source: null };
}
