import { Router, type IRouter } from "express";
import { getAnthropic, isAnthropicConfigured } from "@workspace/integrations-anthropic-ai";
import {
  AskAssistantBody,
  GetWeeklyInsightBody,
  AskAssistantResponse,
  GetWeeklyInsightResponse,
} from "@workspace/api-zod";
import {
  SYSTEM_PROMPT,
  DISCLAIMER,
  buildWeeklyInsightPrompt,
} from "../../lib/ai-prompts";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

// Server-side guardrails: clients are untrusted, so cap conversation history
// regardless of what the UI sends.
const MAX_HISTORY_TURNS = 8;
const MAX_CONTENT_CHARS = 4000;

const UNAVAILABLE_MESSAGE =
  "The assistant is not available right now. Please try again later.";

const router: IRouter = Router();

type AnthropicMessage = Awaited<
  ReturnType<ReturnType<typeof getAnthropic>["messages"]["create"]>
>;

function extractText(message: AnthropicMessage): string {
  if (!("content" in message)) return "";
  return message.content
    .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

router.post("/ai/ask", async (req, res): Promise<void> => {
  const parsed = AskAssistantBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isAnthropicConfigured()) {
    res.status(503).json({ error: UNAVAILABLE_MESSAGE });
    return;
  }

  const { question, week, history } = parsed.data;

  const systemPrompt = week
    ? `${SYSTEM_PROMPT}\n\nCONTEXT: The user is currently ${week} weeks pregnant. Tailor your answer to this stage when relevant.`
    : SYSTEM_PROMPT;

  const messages = [
    ...(history ?? [])
      .slice(-MAX_HISTORY_TURNS)
      .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CONTENT_CHARS) })),
    { role: "user" as const, content: question.slice(0, MAX_CONTENT_CHARS) },
  ];

  try {
    const message = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      messages,
    });

    const answer = extractText(message);
    res.json(
      AskAssistantResponse.parse({
        answer: answer || "I'm sorry, I couldn't generate a response. Please try again.",
        disclaimer: DISCLAIMER,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "AI ask request failed");
    res.status(502).json({ error: "The assistant is unavailable right now. Please try again." });
  }
});

router.post("/ai/weekly-insight", async (req, res): Promise<void> => {
  const parsed = GetWeeklyInsightBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  if (!isAnthropicConfigured()) {
    res.status(503).json({ error: UNAVAILABLE_MESSAGE });
    return;
  }

  const { week } = parsed.data;

  try {
    const message = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildWeeklyInsightPrompt(week) }],
    });

    const insight = extractText(message);
    res.json(
      GetWeeklyInsightResponse.parse({
        week,
        insight: insight || "No insight is available for this week right now. Please try again.",
        disclaimer: DISCLAIMER,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "AI weekly-insight request failed");
    res.status(502).json({ error: "The assistant is unavailable right now. Please try again." });
  }
});

export default router;
