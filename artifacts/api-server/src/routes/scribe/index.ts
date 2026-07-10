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

const router: IRouter = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const UNAVAILABLE = "The scribe service is not available right now. Please try again later.";

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

const SUMMARY_SYSTEM = `You are a patient education assistant. Given a transcript of a clinical encounter, write a warm, plain-language summary the patient can read and keep.

Format your response as valid JSON with this exact shape:
{
  "headline": "One sentence describing what today's visit was about.",
  "whatWasDiscussed": "2-4 sentences summarizing what the provider and patient talked about, in plain language.",
  "nextSteps": "A bulleted list of the patient's action items or follow-up instructions (as an array of strings).",
  "rememberTo": "One encouraging closing sentence or reminder."
}

Rules:
- Use simple, friendly language — no medical jargon without explanation.
- Use only what was actually said in the transcript. Do not add advice not mentioned.
- Output only the JSON object — no markdown fences, no explanation.`;

router.post(
  "/scribe/transcribe",
  requireAuth,
  upload.single("audio"),
  async (req: AuthedRequest, res): Promise<void> => {
    if (!req.file) {
      res.status(400).json({ error: "No audio file provided. Upload audio as the 'audio' field." });
      return;
    }

    try {
      const { buffer, format } = await ensureCompatibleFormat(req.file.buffer);
      const transcript = await speechToText(buffer, format);

      if (!transcript.trim()) {
        res.status(422).json({ error: "No speech detected in the audio. Please try again." });
        return;
      }

      res.json({ transcript });
    } catch (err) {
      req.log.error({ err }, "scribe transcribe failed");
      res.status(502).json({ error: "Transcription failed. Please try again." });
    }
  },
);

router.post(
  "/scribe/generate-note",
  requireAuth,
  async (req: AuthedRequest, res): Promise<void> => {
    const { transcript, mode } = req.body as { transcript?: string; mode?: string };

    if (!transcript || typeof transcript !== "string" || transcript.trim().length < 10) {
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

    const systemPrompt = mode === "soap" ? SOAP_SYSTEM : SUMMARY_SYSTEM;

    try {
      const message = await getAnthropic().messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Here is the encounter transcript:\n\n${transcript.slice(0, 12000)}`,
          },
        ],
      });

      const raw = message.content
        .filter((b): b is Extract<typeof b, { type: "text" }> => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        req.log.warn({ raw }, "scribe generate-note: failed to parse JSON from model");
        res.status(502).json({ error: "The model returned an unexpected response. Please try again." });
        return;
      }

      res.json({ mode, note: parsed });
    } catch (err) {
      req.log.error({ err }, "scribe generate-note failed");
      res.status(502).json({ error: "Note generation failed. Please try again." });
    }
  },
);

export default router;
