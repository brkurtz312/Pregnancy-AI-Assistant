import { Router, type IRouter } from "express";
import multer from "multer";
import {
  speechToText,
  ensureCompatibleFormat,
} from "@workspace/integrations-openai-ai-server/audio";
import {
  getAnthropic,
  isAnthropicConfigured,
} from "@workspace/integrations-anthropic-ai";
import { requireAuth, type AuthedRequest } from "../../middlewares/auth";
import { userHasPass } from "../../lib/entitlement";
import { reserveUsage, refundUsage, getUsage } from "../../lib/ai-usage";
import { FREE_SCRIBE_LIMIT } from "../../lib/billing-config";
import {
  checkIdempotency,
  beginIdempotency,
} from "../../lib/scribe-idempotency";

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const UNAVAILABLE =
  "The scribe service is not available right now. Please try again later.";

const SOAP_SYSTEM = `You are a medical scribe assistant. Given a transcript of a clinical encounter, produce a structured SOAP note.

Format your response as valid JSON with this exact shape:
{
  "subjective": "Patient's chief complaint, history of present illness, symptoms, and relevant history in 2-4 sentences.",
  "objective": "Relevant exam findings, vital signs, and any objective data mentioned in the encounter.",
  "assessment": "Clinical assessment, working diagnoses, or impressions discussed.",
  "plan": "Treatment plan, orders, referrals, patient education, and follow-up discussed."
}

Rules:
- Use only information explicitly stated in the transcript. Do not invent or infer clinical details.
- If a section has no relevant content, write "Not discussed."
- Keep each section concise and clinically appropriate.
- Output only the JSON object — no markdown fences, no explanation.`;

const SUMMARY_SYSTEM = `You are a warm, supportive pregnancy care assistant helping a pregnant patient understand and remember her own prenatal appointment. Given a transcript of a clinical encounter recorded by the patient herself, write a plain-language personal visit summary she can keep and refer back to.

Format your response as valid JSON with this exact shape:
{
  "headline": "One warm sentence describing what today's visit was about (e.g. 'Your 28-week checkup went well and your provider answered your questions about third-trimester changes.').",
  "whatWasDiscussed": "2-4 sentences summarizing what the provider and patient talked about, in plain, friendly language. Include any test results, measurements (weight, blood pressure, fundal height), baby movements, or concerns that were mentioned.",
  "nextSteps": "An array of strings — each string is one specific action item or follow-up instruction for the patient (e.g. 'Schedule your glucose screening test', 'Call the office if you notice decreased fetal movement'). Keep each item concise and actionable.",
  "rememberTo": "One encouraging, personal closing sentence — something warm and specific to this visit that will help the patient feel informed and cared for."
}

Rules:
- Write directly to the patient ('your provider', 'you', 'your baby') — this is her personal note, not a clinical document.
- Use simple, conversational language. Explain any medical term used in plain words.
- Use only what was actually said in the transcript. Do not invent clinical details, test results, or advice.
- If something is unclear or not mentioned, omit it rather than guess.
- Output only the JSON object — no markdown fences, no explanation.`;

router.post(
  "/scribe/transcribe",
  requireAuth,
  upload.single("audio"),
  async (req: AuthedRequest, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({
        error: "No audio file provided. Upload audio as the 'audio' field.",
      });
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // Fail closed: if the DB is unavailable we cannot verify usage limits, so
    // we block the request with a 503 rather than risk bypassing free-tier caps.
    let hasPass: boolean;
    try {
      hasPass = await userHasPass(userId);
      if (!hasPass) {
        const currentUsage = await getUsage(`scribe:${userId}`, "all-time");
        if (currentUsage >= FREE_SCRIBE_LIMIT) {
          res.status(403).json({
            code: "SCRIBE_LIMIT_REACHED",
            error:
              "You have used your free scribe session. Upgrade to the Full Pregnancy Pass for unlimited sessions.",
          });
          return;
        }
      }
    } catch (err) {
      req.log.error({ err }, "scribe transcribe: DB error during pre-check");
      res.status(503).json({
        error:
          "The scribe service is temporarily unavailable. Please try again in a moment.",
      });
      return;
    }

    try {
      const { buffer, format } = await ensureCompatibleFormat(req.file.buffer);
      const transcript = await speechToText(buffer, format);

      if (!transcript.trim()) {
        res.status(422).json({
          error: "No speech detected in the audio. Please try again.",
        });
        return;
      }

      res.json({ transcript });
    } catch (err) {
      req.log.error({ err }, "scribe transcribe failed");
      res
        .status(502)
        .json({ error: "Transcription failed. Please try again." });
    }
  },
);

router.post(
  "/scribe/generate-note",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { transcript, mode } = req.body as {
      transcript?: string;
      mode?: string;
    };

    if (
      !transcript ||
      typeof transcript !== "string" ||
      transcript.trim().length < 10
    ) {
      res.status(400).json({ error: "A transcript is required." });
      return;
    }

    if (mode !== "soap" && mode !== "summary") {
      res.status(400).json({ error: "mode must be 'soap' or 'summary'." });
      return;
    }

    if (!isAnthropicConfigured()) {
      res.status(503).json({ error: UNAVAILABLE });
      return;
    }

    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    // ── Idempotency ───────────────────────────────────────────────────────────
    // If the client supplies X-Idempotency-Key we can short-circuit duplicate
    // requests without consuming a second free slot:
    //
    //  • Cache hit (previous success within TTL) → return stored response, done.
    //  • In-flight match (concurrent retry) → await the first request's promise
    //    and return its result; reserveUsage is never called again.
    //  • Cache miss → register this request as the authoritative in-flight
    //    handler (synchronously, before any await) so that retries arriving
    //    while we are inside reserveUsage / the AI call attach to us.
    const idempotencyKey =
      typeof req.headers["x-idempotency-key"] === "string"
        ? req.headers["x-idempotency-key"].trim()
        : null;

    if (idempotencyKey) {
      const idempResult = await checkIdempotency(idempotencyKey, userId);
      if (idempResult.found) {
        req.log.info(
          { idempotencyKey },
          "scribe generate-note: returning cached idempotent result",
        );
        res.json(idempResult.response);
        return;
      }
    }

    // Register as in-flight BEFORE the first await so concurrent retries with
    // the same key find the Pending entry and attach to this request's promise
    // instead of making their own reservation.  When no key is present, ops is
    // null and commit/abort become no-ops below.
    const ops = idempotencyKey
      ? beginIdempotency(idempotencyKey, userId)
      : null;

    // Fail closed: if the DB is unavailable we cannot verify usage limits, so
    // we block the request with a 503 rather than risk bypassing free-tier caps.
    let hasPass: boolean;
    let usageReserved = false;
    try {
      hasPass = await userHasPass(userId);
      if (!hasPass) {
        const { reserved } = await reserveUsage(
          `scribe:${userId}`,
          "all-time",
          FREE_SCRIBE_LIMIT,
        );
        if (!reserved) {
          // 403s are not cached — abort so retries attempt a fresh check.
          ops?.abort();
          res.status(403).json({
            code: "SCRIBE_LIMIT_REACHED",
            error:
              "You have used your free scribe session. Upgrade to the Full Pregnancy Pass for unlimited sessions.",
          });
          return;
        }
        usageReserved = true;
      }
    } catch (err) {
      ops?.abort();
      req.log.error({ err }, "scribe generate-note: DB error during pre-check");
      res.status(503).json({
        error:
          "The scribe service is temporarily unavailable. Please try again in a moment.",
      });
      return;
    }

    const systemPrompt = mode === "soap" ? SOAP_SYSTEM : SUMMARY_SYSTEM;

    const GENERATE_TIMEOUT_MS = 30_000;

    try {
      const message = await getAnthropic().messages.create(
        {
          model: "claude-sonnet-4-6",
          max_tokens: 2048,
          system: systemPrompt,
          messages: [
            {
              role: "user",
              content: `Here is the encounter transcript:\n\n${transcript.slice(0, 12000)}`,
            },
          ],
        },
        { signal: AbortSignal.timeout(GENERATE_TIMEOUT_MS) },
      );

      const raw = message.content
        .filter(
          (b): b is Extract<typeof b, { type: "text" }> => b.type === "text",
        )
        .map((b) => b.text)
        .join("")
        .trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        if (usageReserved) {
          await refundUsage(`scribe:${userId}`, "all-time");
        }
        ops?.abort();
        req.log.warn(
          { raw },
          "scribe generate-note: failed to parse JSON from model",
        );
        res.status(502).json({
          error: "The model returned an unexpected response. Please try again.",
        });
        return;
      }

      const responseBody = { mode, note: parsed };

      // Commit the idempotency entry so retries within the TTL get this result
      // without a second reservation.  Awaited so the DB row is durable before
      // the 200 is sent — cross-restart retry safety depends on this.
      await ops?.commit(responseBody);

      res.json(responseBody);
    } catch (err) {
      if (usageReserved) {
        await refundUsage(`scribe:${userId}`, "all-time");
      }
      ops?.abort();
      req.log.error({ err }, "scribe generate-note failed");
      res
        .status(502)
        .json({ error: "Note generation failed. Please try again." });
    }
  },
);

export default router;
