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
