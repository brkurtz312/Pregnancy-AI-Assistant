import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db } from "@workspace/db";
import { journalEntriesTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../../middlewares/auth";
import { z } from "zod/v4";

const router: IRouter = Router();

const JournalMoodSchema = z
  .enum(["happy", "grateful", "excited", "tired", "anxious", "overwhelmed"])
  .nullable()
  .optional();

const UpsertJournalEntryBody = z.object({
  id: z.string().uuid().optional(),
  text: z.string().default(""),
  mood: JournalMoodSchema,
  gestationalWeeks: z.number().int().min(0).nullable().optional(),
  gestationalDays: z.number().int().min(0).nullable().optional(),
  postpartumDays: z.number().int().min(0).nullable().optional(),
  createdAt: z.string().datetime().optional(),
});

function rowToEntry(row: typeof journalEntriesTable.$inferSelect) {
  return {
    id: row.id,
    text: row.text,
    mood: row.mood ?? undefined,
    gestationalWeeks: row.gestationalWeeks ?? undefined,
    gestationalDays: row.gestationalDays ?? undefined,
    postpartumDays: row.postpartumDays ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

router.get("/tools/journal", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(journalEntriesTable)
    .where(eq(journalEntriesTable.userId, userId))
    .orderBy(desc(journalEntriesTable.createdAt));
  res.json({ entries: rows.map(rowToEntry) });
});

router.post("/tools/journal", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = UpsertJournalEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.userId!;
  const {
    id,
    text,
    mood,
    gestationalWeeks,
    gestationalDays,
    postpartumDays,
    createdAt,
  } = parsed.data;

  if (id) {
    const existing = await db
      .select()
      .from(journalEntriesTable)
      .where(
        and(
          eq(journalEntriesTable.id, id),
          eq(journalEntriesTable.userId, userId),
        ),
      )
      .limit(1);

    if (existing.length) {
      const [row] = await db
        .update(journalEntriesTable)
        .set({
          text,
          mood: mood ?? null,
          gestationalWeeks: gestationalWeeks ?? null,
          gestationalDays: gestationalDays ?? null,
          postpartumDays: postpartumDays ?? null,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(journalEntriesTable.id, id),
            eq(journalEntriesTable.userId, userId),
          ),
        )
        .returning();
      res.json(rowToEntry(row));
      return;
    }
  }

  const [row] = await db
    .insert(journalEntriesTable)
    .values({
      id: id ?? undefined,
      userId,
      text,
      mood: mood ?? null,
      gestationalWeeks: gestationalWeeks ?? null,
      gestationalDays: gestationalDays ?? null,
      postpartumDays: postpartumDays ?? null,
      createdAt: createdAt ? new Date(createdAt) : undefined,
    })
    .returning();

  res.status(201).json(rowToEntry(row));
});

router.delete(
  "/tools/journal/:id",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const id = String(req.params.id);
    const userId = req.userId!;
    const deleted = await db
      .delete(journalEntriesTable)
      .where(
        and(
          eq(journalEntriesTable.id, id),
          eq(journalEntriesTable.userId, userId),
        ),
      )
      .returning();

    if (!deleted.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).end();
  },
);

export default router;
