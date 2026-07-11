import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { birthPlanAnswersTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../../middlewares/auth";
import { z } from "zod/v4";

const router: IRouter = Router();

const BirthPlanValueSchema = z.union([
  z.string(),
  z.array(z.string()),
  z.boolean(),
]);

const SaveBirthPlanBody = z.object({
  answers: z.record(z.string(), BirthPlanValueSchema.nullable().optional()),
});

router.get(
  "/tools/birth-plan",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const rows = await db
      .select()
      .from(birthPlanAnswersTable)
      .where(eq(birthPlanAnswersTable.userId, userId))
      .limit(1);

    if (!rows.length) {
      res.json({ answers: null });
      return;
    }

    res.json({ answers: rows[0].answers });
  },
);

router.post(
  "/tools/birth-plan",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = SaveBirthPlanBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.userId!;
    const { answers } = parsed.data;

    const existing = await db
      .select({ id: birthPlanAnswersTable.id })
      .from(birthPlanAnswersTable)
      .where(eq(birthPlanAnswersTable.userId, userId))
      .limit(1);

    if (existing.length) {
      await db
        .update(birthPlanAnswersTable)
        .set({ answers, updatedAt: new Date() })
        .where(eq(birthPlanAnswersTable.userId, userId));
    } else {
      await db.insert(birthPlanAnswersTable).values({ userId, answers });
    }

    res.json({ ok: true });
  },
);

router.delete(
  "/tools/birth-plan",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    await db
      .delete(birthPlanAnswersTable)
      .where(eq(birthPlanAnswersTable.userId, userId));
    res.status(204).end();
  },
);

export default router;
