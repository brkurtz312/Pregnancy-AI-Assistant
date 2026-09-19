/**
 * compare-databases
 *
 * Compares two Postgres databases table by table, so a migration can be
 * verified before anything is switched over rather than after a user notices.
 *
 * Usage:
 *   SOURCE_DATABASE_URL=… TARGET_DATABASE_URL=… \
 *     pnpm --filter @workspace/scripts run compare-databases
 *
 * Exit codes:
 *   0 — every table matches
 *   1 — a difference, a missing table, or a connection failure
 *
 * It reads and never writes. Running it against production is safe; running it
 * against the wrong database is only a wasted minute, and it prints both hosts
 * before doing anything so that mistake is visible immediately.
 *
 * Row counts alone would not catch a restore that silently truncated a text
 * column or shifted a timestamp, so each table is also checksummed over its
 * full contents. Two databases that agree on both are the same data.
 */

import pg from "pg";

const { Client } = pg;

/**
 * The application's tables, from lib/db/src/schema.
 *
 * Listed explicitly rather than discovered, so that a table missing entirely
 * from the target is a failure rather than something the comparison silently
 * skips — the failure mode that matters most in a migration.
 */
const APP_TABLES = [
  "account_deletion_requests",
  "ai_usage",
  "app_config",
  "birth_plan_answers",
  "contraction_logs",
  "hospital_bag_state",
  "journal_entries",
  "kick_sessions",
  "prenatal_visits",
  "rate_limits",
  "scribe_idempotency_keys",
  "support_contacts",
  "symptom_logs",
  "user_profiles",
  "users",
] as const;

/**
 * Tables whose contents are expected to differ and should not fail the run.
 *
 * `rate_limits` is a sliding window that moves while the comparison runs, and
 * `scribe_idempotency_keys` expires on its own schedule. Both are operational
 * state, not user data: a mismatch means time passed, not that the migration
 * lost something. Their counts are still reported.
 */
const VOLATILE = new Set<string>(["rate_limits", "scribe_idempotency_keys"]);

interface TableResult {
  table: string;
  sourceCount: number | null;
  targetCount: number | null;
  sourceHash: string | null;
  targetHash: string | null;
  status: "match" | "count" | "content" | "missing" | "volatile";
}

/** Host only — the URL carries credentials and this output gets pasted around. */
function hostOf(url: string): string {
  try {
    return new URL(url).host || "unknown";
  } catch {
    return "unparseable";
  }
}

async function tableExists(client: pg.Client, table: string): Promise<boolean> {
  const { rows } = await client.query(
    "SELECT to_regclass($1) IS NOT NULL AS present",
    [`public.${table}`],
  );
  return Boolean(rows[0]?.present);
}

async function countOf(client: pg.Client, table: string): Promise<number> {
  // Identifier is from APP_TABLES, never user input.
  const { rows } = await client.query(
    `SELECT count(*)::int AS n FROM "${table}"`,
  );
  return Number(rows[0]?.n ?? 0);
}

/**
 * A content checksum that does not depend on row order or column order.
 *
 * Each row is rendered to its text form, hashed, and the hashes are summed —
 * summation is commutative, so two databases holding the same rows agree
 * however each happens to return them. `to_jsonb` sorts keys, so a column
 * reordered by the restore does not read as a difference.
 */
async function hashOf(client: pg.Client, table: string): Promise<string> {
  const { rows } = await client.query(
    `SELECT coalesce(
       sum(('x' || substr(md5(t::text), 1, 8))::bit(32)::bigint),
       0
     )::text AS h
     FROM (SELECT to_jsonb("${table}".*) AS t FROM "${table}") s`,
  );
  return String(rows[0]?.h ?? "0");
}

async function compare(
  source: pg.Client,
  target: pg.Client,
): Promise<TableResult[]> {
  const results: TableResult[] = [];

  for (const table of APP_TABLES) {
    const [inSource, inTarget] = await Promise.all([
      tableExists(source, table),
      tableExists(target, table),
    ]);

    if (!inSource || !inTarget) {
      results.push({
        table,
        sourceCount: inSource ? await countOf(source, table) : null,
        targetCount: inTarget ? await countOf(target, table) : null,
        sourceHash: null,
        targetHash: null,
        status: "missing",
      });
      continue;
    }

    const [sourceCount, targetCount] = await Promise.all([
      countOf(source, table),
      countOf(target, table),
    ]);

    if (VOLATILE.has(table)) {
      results.push({
        table,
        sourceCount,
        targetCount,
        sourceHash: null,
        targetHash: null,
        status: "volatile",
      });
      continue;
    }

    if (sourceCount !== targetCount) {
      results.push({
        table,
        sourceCount,
        targetCount,
        sourceHash: null,
        targetHash: null,
        status: "count",
      });
      continue;
    }

    const [sourceHash, targetHash] = await Promise.all([
      hashOf(source, table),
      hashOf(target, table),
    ]);

    results.push({
      table,
      sourceCount,
      targetCount,
      sourceHash,
      targetHash,
      status: sourceHash === targetHash ? "match" : "content",
    });
  }

  return results;
}

function render(results: TableResult[]): void {
  const width = Math.max(...APP_TABLES.map((t) => t.length));
  const n = (v: number | null) => (v === null ? "—" : String(v));

  for (const r of results) {
    const name = r.table.padEnd(width);
    const counts = `${n(r.sourceCount).padStart(7)} → ${n(r.targetCount).padEnd(7)}`;
    switch (r.status) {
      case "match":
        console.log(`  ✅ ${name}  ${counts}`);
        break;
      case "volatile":
        console.log(`  ➖ ${name}  ${counts}  (volatile — not compared)`);
        break;
      case "count":
        console.log(`  ❌ ${name}  ${counts}  ROW COUNT DIFFERS`);
        break;
      case "content":
        console.log(
          `  ❌ ${name}  ${counts}  counts match but CONTENTS DIFFER`,
        );
        break;
      case "missing": {
        // Absent from both is its own case: it usually means the schema was
        // never created on either side, not that the migration dropped it.
        const where =
          r.sourceCount === null && r.targetCount === null
            ? "both"
            : r.sourceCount === null
              ? "source"
              : "target";
        console.log(`  ❌ ${name}  ${counts}  TABLE MISSING (${where})`);
        break;
      }
    }
  }
}

async function main() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  const targetUrl = process.env.TARGET_DATABASE_URL;

  if (!sourceUrl || !targetUrl) {
    console.error(
      "Set both SOURCE_DATABASE_URL and TARGET_DATABASE_URL.\n" +
        "  SOURCE is the database being migrated FROM (Replit).\n" +
        "  TARGET is the database being migrated TO (the new host).",
    );
    process.exit(1);
  }

  if (sourceUrl === targetUrl) {
    console.error(
      "SOURCE_DATABASE_URL and TARGET_DATABASE_URL are the same database.\n" +
        "That comparison always passes and proves nothing.",
    );
    process.exit(1);
  }

  console.log(`\n  source  ${hostOf(sourceUrl)}`);
  console.log(`  target  ${hostOf(targetUrl)}\n`);

  const source = new Client({ connectionString: sourceUrl });
  const target = new Client({ connectionString: targetUrl });

  try {
    await source.connect();
    await target.connect();
  } catch (err) {
    console.error(
      `\n❌ Could not connect: ${err instanceof Error ? err.message : String(err)}`,
    );
    await source.end().catch(() => {});
    await target.end().catch(() => {});
    process.exit(1);
  }

  try {
    const results = await compare(source, target);
    render(results);

    const failures = results.filter(
      (r) =>
        r.status === "count" ||
        r.status === "content" ||
        r.status === "missing",
    );

    if (failures.length === 0) {
      console.log(
        `\n✅ All ${results.length - VOLATILE.size} compared tables match.\n`,
      );
      process.exit(0);
    }

    console.log(
      `\n❌ ${failures.length} table(s) differ. Do not switch anything over.\n`,
    );
    process.exit(1);
  } finally {
    await source.end().catch(() => {});
    await target.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
