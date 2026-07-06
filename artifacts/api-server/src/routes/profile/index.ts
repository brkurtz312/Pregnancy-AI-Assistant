import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db";
import { userProfilesTable } from "@workspace/db";
import { UpdateProfileBody } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

router.get("/profile", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.userId, userId))
    .limit(1);

  const row = rows[0];
  res.json({
    firstName: row?.firstName ?? null,
    zipCode: row?.zipCode ?? null,
    dueDate: row?.dueDate ?? null,
    providerName: row?.providerName ?? null,
    providerPhone: row?.providerPhone ?? null,
    providerAddress: row?.providerAddress ?? null,
    deliveryCenterType: row?.deliveryCenterType ?? null,
    hospitalName: row?.hospitalName ?? null,
    hospitalPhone: row?.hospitalPhone ?? null,
    hospitalAddress: row?.hospitalAddress ?? null,
  });
});

router.put("/profile", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.userId!;
  const {
    firstName,
    zipCode,
    dueDate,
    providerName,
    providerPhone,
    providerAddress,
    deliveryCenterType,
    hospitalName,
    hospitalPhone,
    hospitalAddress,
  } = parsed.data;

  const [row] = await db
    .insert(userProfilesTable)
    .values({
      userId,
      firstName: firstName ?? null,
      zipCode: zipCode ?? null,
      dueDate: dueDate ?? null,
      providerName: providerName ?? null,
      providerPhone: providerPhone ?? null,
      providerAddress: providerAddress ?? null,
      deliveryCenterType: deliveryCenterType ?? null,
      hospitalName: hospitalName ?? null,
      hospitalPhone: hospitalPhone ?? null,
      hospitalAddress: hospitalAddress ?? null,
    })
    .onConflictDoUpdate({
      target: userProfilesTable.userId,
      set: {
        ...(firstName !== undefined && { firstName: firstName ?? null }),
        ...(zipCode !== undefined && { zipCode: zipCode ?? null }),
        ...(dueDate !== undefined && { dueDate: dueDate ?? null }),
        ...(providerName !== undefined && {
          providerName: providerName ?? null,
        }),
        ...(providerPhone !== undefined && {
          providerPhone: providerPhone ?? null,
        }),
        ...(providerAddress !== undefined && {
          providerAddress: providerAddress ?? null,
        }),
        ...(deliveryCenterType !== undefined && {
          deliveryCenterType: deliveryCenterType ?? null,
        }),
        ...(hospitalName !== undefined && {
          hospitalName: hospitalName ?? null,
        }),
        ...(hospitalPhone !== undefined && {
          hospitalPhone: hospitalPhone ?? null,
        }),
        ...(hospitalAddress !== undefined && {
          hospitalAddress: hospitalAddress ?? null,
        }),
        updatedAt: new Date(),
      },
    })
    .returning();

  res.json({
    firstName: row.firstName ?? null,
    zipCode: row.zipCode ?? null,
    dueDate: row.dueDate ?? null,
    providerName: row.providerName ?? null,
    providerPhone: row.providerPhone ?? null,
    providerAddress: row.providerAddress ?? null,
    deliveryCenterType: row.deliveryCenterType ?? null,
    hospitalName: row.hospitalName ?? null,
    hospitalPhone: row.hospitalPhone ?? null,
    hospitalAddress: row.hospitalAddress ?? null,
  });
});

export default router;
