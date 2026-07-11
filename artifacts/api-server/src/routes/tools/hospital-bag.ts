import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { hospitalBagStateTable } from "@workspace/db";
import { requireAuth, type AuthedRequest } from "../../middlewares/auth";
import { z } from "zod/v4";

const router: IRouter = Router();

const HospitalBagItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  note: z.string().optional(),
  checked: z.boolean(),
  custom: z.boolean(),
});

const HospitalBagCategorySchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(HospitalBagItemSchema),
});

const SaveHospitalBagBody = z.object({
  categories: z.array(HospitalBagCategorySchema),
});

router.get(
  "/tools/hospital-bag",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const rows = await db
      .select()
      .from(hospitalBagStateTable)
      .where(eq(hospitalBagStateTable.userId, userId))
      .limit(1);

    if (!rows.length) {
      res.json({ categories: null });
      return;
    }

    res.json({ categories: rows[0].categories });
  },
);

router.post(
  "/tools/hospital-bag",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = SaveHospitalBagBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.userId!;
    const { categories } = parsed.data;

    const existing = await db
      .select({ id: hospitalBagStateTable.id })
      .from(hospitalBagStateTable)
      .where(eq(hospitalBagStateTable.userId, userId))
      .limit(1);

    if (existing.length) {
      await db
        .update(hospitalBagStateTable)
        .set({ categories, updatedAt: new Date() })
        .where(eq(hospitalBagStateTable.userId, userId));
    } else {
      await db.insert(hospitalBagStateTable).values({ userId, categories });
    }

    res.json({ ok: true });
  },
);

router.delete(
  "/tools/hospital-bag",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    await db
      .delete(hospitalBagStateTable)
      .where(eq(hospitalBagStateTable.userId, userId));
    res.status(204).end();
  },
);

export default router;
