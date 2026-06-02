import { db } from "@workspace/db";
import { sql } from "drizzle-orm";
import { getUser, grantPass } from "./users";

/**
 * Whether a user owns the Full Pregnancy Pass.
 *
 * Fast path: the denormalized `has_pass` flag. Fallback: query the synced
 * `stripe.payment_intents` for a succeeded payment by this customer — the pass
 * is the only purchasable item, so any succeeded payment grants it. When found,
 * the flag is persisted so subsequent checks skip the query.
 */
export async function userHasPass(userId: string): Promise<boolean> {
  const user = await getUser(userId);
  if (!user) return false;
  if (user.hasPass) return true;
  if (!user.stripeCustomerId) return false;

  try {
    const result = await db.execute(sql`
      SELECT 1 FROM stripe.payment_intents
      WHERE customer = ${user.stripeCustomerId} AND status = 'succeeded'
      LIMIT 1
    `);
    if (result.rows.length > 0) {
      await grantPass(userId);
      return true;
    }
  } catch {
    // The stripe schema may not exist yet (integration not connected).
  }
  return false;
}
