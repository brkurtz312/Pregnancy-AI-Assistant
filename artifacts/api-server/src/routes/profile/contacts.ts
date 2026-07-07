import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db } from "@workspace/db";
import { supportContactsTable } from "@workspace/db";
import { CreateContactBody, UpdateContactBody } from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../../middlewares/auth";

const router: IRouter = Router();

function toResponse(row: typeof supportContactsTable.$inferSelect) {
  return {
    id: row.id,
    firstName: row.firstName,
    role: row.role,
    phone: row.phone,
    sortOrder: row.sortOrder,
  };
}

router.get("/contacts", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(supportContactsTable)
    .where(eq(supportContactsTable.userId, userId))
    .orderBy(supportContactsTable.sortOrder, supportContactsTable.createdAt);
  res.json({ items: rows.map(toResponse) });
});

router.post("/contacts", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = CreateContactBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.userId!;
  const { firstName, role, phone } = parsed.data;

  const countRows = await db
    .select({ id: supportContactsTable.id })
    .from(supportContactsTable)
    .where(eq(supportContactsTable.userId, userId));
  const sortOrder = countRows.length;

  const [row] = await db
    .insert(supportContactsTable)
    .values({ userId, firstName, role, phone, sortOrder })
    .returning();

  res.status(201).json(toResponse(row));
});

router.put(
  "/contacts/:contactId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const contactId = req.params.contactId as string;
    const parsed = UpdateContactBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.userId!;
    const { firstName, role, phone } = parsed.data;

    const set: Partial<typeof supportContactsTable.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (firstName !== undefined) set.firstName = firstName;
    if (role !== undefined) set.role = role;
    if (phone !== undefined) set.phone = phone;

    const [row] = await db
      .update(supportContactsTable)
      .set(set)
      .where(
        and(
          eq(supportContactsTable.id, contactId),
          eq(supportContactsTable.userId, userId),
        ),
      )
      .returning();

    if (!row) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.json(toResponse(row));
  },
);

router.delete(
  "/contacts/:contactId",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const contactId = req.params.contactId as string;
    const userId = req.userId!;

    const [row] = await db
      .delete(supportContactsTable)
      .where(
        and(
          eq(supportContactsTable.id, contactId),
          eq(supportContactsTable.userId, userId),
        ),
      )
      .returning();

    if (!row) {
      res.status(404).json({ error: "Contact not found" });
      return;
    }
    res.status(204).send();
  },
);

export default router;
