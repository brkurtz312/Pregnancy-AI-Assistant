import { db, aiUsageTable } from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";

/** ISO-8601 week key, e.g. "2026-W23". Weeks start Monday, UTC. */
export function currentPeriodKey(d = new Date()): string {
  const date = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function getUsage(
  identifier: string,
  periodKey: string,
): Promise<number> {
  const [row] = await db
    .select({ count: aiUsageTable.count })
    .from(aiUsageTable)
    .where(
      and(
        eq(aiUsageTable.identifier, identifier),
        eq(aiUsageTable.periodKey, periodKey),
      ),
    );
  return row?.count ?? 0;
}

export async function incrementUsage(
  identifier: string,
  periodKey: string,
): Promise<number> {
  const [row] = await db
    .insert(aiUsageTable)
    .values({ identifier, periodKey, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsageTable.identifier, aiUsageTable.periodKey],
      set: { count: sql`${aiUsageTable.count} + 1`, updatedAt: sql`now()` },
    })
    .returning({ count: aiUsageTable.count });
  return row?.count ?? 0;
}

/**
 * Atomically reserve one unit of the free weekly allowance.
 *
 * The counter is incremented only when it is still below `limit`, in a single
 * statement. A read-then-check-then-increment flow lets concurrent requests all
 * observe the same pre-increment count and slip past the cap (each then makes
 * its own paid model call); reserving up front in one atomic upsert closes that
 * race. Returns whether the reservation succeeded along with the new count.
 *
 * Callers should refund (see {@link refundUsage}) if the work the reservation
 * was paying for ultimately fails.
 */
export async function reserveUsage(
  identifier: string,
  periodKey: string,
  limit: number,
): Promise<{ reserved: boolean; count: number }> {
  if (limit <= 0) return { reserved: false, count: 0 };
  const [row] = await db
    .insert(aiUsageTable)
    .values({ identifier, periodKey, count: 1 })
    .onConflictDoUpdate({
      target: [aiUsageTable.identifier, aiUsageTable.periodKey],
      set: { count: sql`${aiUsageTable.count} + 1`, updatedAt: sql`now()` },
      // Only consume quota while still under the limit. When the row already
      // sits at/above the limit this WHERE is false, the UPDATE is skipped, no
      // row is returned, and the reservation is denied.
      setWhere: sql`${aiUsageTable.count} < ${limit}`,
    })
    .returning({ count: aiUsageTable.count });
  if (row) return { reserved: true, count: row.count };
  return { reserved: false, count: limit };
}

/**
 * Return one previously reserved unit, e.g. when a reserved paid model call
 * failed and never produced an answer. Never drops below zero.
 */
export async function refundUsage(
  identifier: string,
  periodKey: string,
): Promise<void> {
  await db
    .update(aiUsageTable)
    .set({
      count: sql`greatest(${aiUsageTable.count} - 1, 0)`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(aiUsageTable.identifier, identifier),
        eq(aiUsageTable.periodKey, periodKey),
      ),
    );
}
