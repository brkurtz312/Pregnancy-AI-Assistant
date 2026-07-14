import { Router, type IRouter } from "express";
import { eq, and, desc, count } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  symptomLogsTable,
  kickSessionsTable,
  contractionLogsTable,
  prenatalVisitsTable,
} from "@workspace/db";
import {
  CreateSymptomBody,
  CreateKickSessionBody,
  UpdateKickSessionBody,
  CreateContractionBody,
  CreatePrenatalVisitBody,
  UpdatePrenatalVisitBody,
} from "@workspace/api-zod";
import { requireAuth, type AuthedRequest } from "../../middlewares/auth";
import journalRouter from "./journal";
import hospitalBagRouter from "./hospital-bag";
import birthPlanRouter from "./birth-plan";

const router: IRouter = Router();

router.use(journalRouter);
router.use(hospitalBagRouter);
router.use(birthPlanRouter);

// ─── Symptom Log ────────────────────────────────────────────────────────────

router.get("/tools/symptoms", requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  const [items, totalResult] = await Promise.all([
    db
      .select()
      .from(symptomLogsTable)
      .where(eq(symptomLogsTable.userId, userId))
      .orderBy(desc(symptomLogsTable.loggedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: count() })
      .from(symptomLogsTable)
      .where(eq(symptomLogsTable.userId, userId)),
  ]);

  res.json({
    items: items.map((s) => ({
      id: s.id,
      symptom: s.symptom,
      severity: s.severity,
      notes: s.notes,
      loggedAt: s.loggedAt.toISOString(),
    })),
    total: totalResult[0]?.count ?? 0,
  });
});

router.post("/tools/symptoms", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = CreateSymptomBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.userId!;
  const { symptom, severity, notes, loggedAt } = parsed.data;

  const [row] = await db
    .insert(symptomLogsTable)
    .values({
      userId,
      symptom,
      severity: severity ?? null,
      notes: notes ?? null,
      loggedAt: loggedAt ? new Date(loggedAt) : new Date(),
    })
    .returning();

  res.status(201).json({
    id: row.id,
    symptom: row.symptom,
    severity: row.severity,
    notes: row.notes,
    loggedAt: row.loggedAt.toISOString(),
  });
});

router.delete(
  "/tools/symptoms/:id",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const userId = req.userId!;
    const deleted = await db
      .delete(symptomLogsTable)
      .where(
        and(eq(symptomLogsTable.id, id), eq(symptomLogsTable.userId, userId)),
      )
      .returning();

    if (!deleted.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).end();
  },
);

// ─── Kick Sessions ───────────────────────────────────────────────────────────

router.get(
  "/tools/kick-sessions",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const limit = Math.min(Number(req.query.limit) || 20, 50);
    const offset = Number(req.query.offset) || 0;

    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(kickSessionsTable)
        .where(eq(kickSessionsTable.userId, userId))
        .orderBy(desc(kickSessionsTable.startedAt))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(kickSessionsTable)
        .where(eq(kickSessionsTable.userId, userId)),
    ]);

    res.json({
      items: items.map((s) => ({
        id: s.id,
        startedAt: s.startedAt.toISOString(),
        endedAt: s.endedAt?.toISOString() ?? null,
        kickCount: s.kickCount,
        notes: s.notes,
      })),
      total: totalResult[0]?.count ?? 0,
    });
  },
);

router.post(
  "/tools/kick-sessions",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = CreateKickSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.userId!;
    const { startedAt, kickCount, endedAt, notes } = parsed.data;

    const [row] = await db
      .insert(kickSessionsTable)
      .values({
        userId,
        startedAt: startedAt ? new Date(startedAt) : new Date(),
        endedAt: endedAt ? new Date(endedAt) : null,
        kickCount: kickCount ?? 0,
        notes: notes ?? null,
      })
      .returning();

    res.status(201).json({
      id: row.id,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      kickCount: row.kickCount,
      notes: row.notes,
    });
  },
);

router.patch(
  "/tools/kick-sessions/:id",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdateKickSessionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.userId!;
    const { kickCount, endedAt, notes } = parsed.data;

    const updates: Record<string, unknown> = {};
    if (kickCount !== undefined && kickCount !== null)
      updates.kickCount = kickCount;
    if (endedAt !== undefined)
      updates.endedAt = endedAt ? new Date(endedAt) : null;
    if (notes !== undefined) updates.notes = notes;

    const [row] = await db
      .update(kickSessionsTable)
      .set(updates)
      .where(
        and(eq(kickSessionsTable.id, id), eq(kickSessionsTable.userId, userId)),
      )
      .returning();

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({
      id: row.id,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      kickCount: row.kickCount,
      notes: row.notes,
    });
  },
);

router.delete(
  "/tools/kick-sessions/:id",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const userId = req.userId!;
    const deleted = await db
      .delete(kickSessionsTable)
      .where(
        and(eq(kickSessionsTable.id, id), eq(kickSessionsTable.userId, userId)),
      )
      .returning();

    if (!deleted.length) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.status(204).end();
  },
);

// ─── Contraction Logs ────────────────────────────────────────────────────────

router.get(
  "/tools/contractions",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const today = new Date().toISOString().slice(0, 10);
    const sessionDate = (req.query.sessionDate as string) || today;

    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(contractionLogsTable)
        .where(
          and(
            eq(contractionLogsTable.userId, userId),
            eq(contractionLogsTable.sessionDate, sessionDate),
          ),
        )
        .orderBy(desc(contractionLogsTable.startedAt))
        .limit(limit),
      db
        .select({ count: count() })
        .from(contractionLogsTable)
        .where(
          and(
            eq(contractionLogsTable.userId, userId),
            eq(contractionLogsTable.sessionDate, sessionDate),
          ),
        ),
    ]);

    res.json({
      items: items.map((c) => ({
        id: c.id,
        startedAt: c.startedAt.toISOString(),
        endedAt: c.endedAt?.toISOString() ?? null,
        durationSeconds: c.durationSeconds,
        intervalSeconds: c.intervalSeconds,
        sessionDate: c.sessionDate,
      })),
      total: totalResult[0]?.count ?? 0,
    });
  },
);

router.post(
  "/tools/contractions",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = CreateContractionBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.userId!;
    const {
      startedAt,
      endedAt,
      durationSeconds,
      intervalSeconds,
      sessionDate,
    } = parsed.data;

    const [row] = await db
      .insert(contractionLogsTable)
      .values({
        userId,
        startedAt: new Date(startedAt),
        endedAt: endedAt ? new Date(endedAt) : null,
        durationSeconds: durationSeconds ?? null,
        intervalSeconds: intervalSeconds ?? null,
        sessionDate,
      })
      .returning();

    res.status(201).json({
      id: row.id,
      startedAt: row.startedAt.toISOString(),
      endedAt: row.endedAt?.toISOString() ?? null,
      durationSeconds: row.durationSeconds,
      intervalSeconds: row.intervalSeconds,
      sessionDate: row.sessionDate,
    });
  },
);

router.delete(
  "/tools/contractions/:id",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const userId = req.userId!;
    const deleted = await db
      .delete(contractionLogsTable)
      .where(
        and(
          eq(contractionLogsTable.id, id),
          eq(contractionLogsTable.userId, userId),
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

// ─── Prenatal Visits ─────────────────────────────────────────────────────────

router.get(
  "/tools/prenatal-visits",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const userId = req.userId!;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const offset = Number(req.query.offset) || 0;

    const [items, totalResult] = await Promise.all([
      db
        .select()
        .from(prenatalVisitsTable)
        .where(eq(prenatalVisitsTable.userId, userId))
        .orderBy(desc(prenatalVisitsTable.visitDate))
        .limit(limit)
        .offset(offset),
      db
        .select({ count: count() })
        .from(prenatalVisitsTable)
        .where(eq(prenatalVisitsTable.userId, userId)),
    ]);

    res.json({
      items: items.map((v) => ({
        id: v.id,
        visitDate: v.visitDate.toISOString(),
        weight: v.weight,
        bloodPressure: v.bloodPressure,
        fetalHeartRate: v.fetalHeartRate,
        notes: v.notes,
        createdAt: v.createdAt.toISOString(),
      })),
      total: totalResult[0]?.count ?? 0,
    });
  },
);

router.post(
  "/tools/prenatal-visits",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const parsed = CreatePrenatalVisitBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.userId!;
    const { visitDate, weight, bloodPressure, fetalHeartRate, notes } =
      parsed.data;

    const [row] = await db
      .insert(prenatalVisitsTable)
      .values({
        userId,
        visitDate: new Date(visitDate),
        weight: weight ?? null,
        bloodPressure: bloodPressure ?? null,
        fetalHeartRate: fetalHeartRate ?? null,
        notes: notes ?? null,
      })
      .returning();

    res.status(201).json({
      id: row.id,
      visitDate: row.visitDate.toISOString(),
      weight: row.weight,
      bloodPressure: row.bloodPressure,
      fetalHeartRate: row.fetalHeartRate,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    });
  },
);

router.patch(
  "/tools/prenatal-visits/:id",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const parsed = UpdatePrenatalVisitBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const userId = req.userId!;
    const { visitDate, weight, bloodPressure, fetalHeartRate, notes } =
      parsed.data;

    const updates: Record<string, unknown> = {};
    if (visitDate !== undefined && visitDate !== null)
      updates.visitDate = new Date(visitDate);
    if (weight !== undefined) updates.weight = weight;
    if (bloodPressure !== undefined) updates.bloodPressure = bloodPressure;
    if (fetalHeartRate !== undefined) updates.fetalHeartRate = fetalHeartRate;
    if (notes !== undefined) updates.notes = notes;

    const [row] = await db
      .update(prenatalVisitsTable)
      .set(updates)
      .where(
        and(
          eq(prenatalVisitsTable.id, id),
          eq(prenatalVisitsTable.userId, userId),
        ),
      )
      .returning();

    if (!row) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    res.json({
      id: row.id,
      visitDate: row.visitDate.toISOString(),
      weight: row.weight,
      bloodPressure: row.bloodPressure,
      fetalHeartRate: row.fetalHeartRate,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
    });
  },
);

router.delete(
  "/tools/prenatal-visits/:id",
  requireAuth,
  async (req: AuthedRequest, res) => {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      res.status(400).json({ error: "Invalid id" });
      return;
    }
    const userId = req.userId!;
    const deleted = await db
      .delete(prenatalVisitsTable)
      .where(
        and(
          eq(prenatalVisitsTable.id, id),
          eq(prenatalVisitsTable.userId, userId),
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
