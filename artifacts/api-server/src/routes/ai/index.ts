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
import { aiBurstLimiter, aiDailyLimiter, getClientIp } from "../../lib/rate-limit";
import { TtlCache } from "../../lib/ttl-cache";
import { getUserId } from "../../middlewares/auth";
import { userHasPass } from "../../lib/entitlement";
import { currentPeriodKey, getUsage, incrementUsage } from "../../lib/ai-usage";
import { FREE_WEEKLY_LIMIT } from "../../lib/billing-config";

const MODEL = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

// Weekly insights depend only on the gestational week (not on the user), so the
// same generated text is reused for everyone. Cache it in memory to avoid a paid
// LLM call on every calculation. TTL bounds staleness; deploys also reset it.
const WEEKLY_INSIGHT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const weeklyInsightCache = new TtlCache<number, string>(WEEKLY_INSIGHT_TTL_MS);

// Server-side guardrails: clients are untrusted, so cap conversation history
// regardless of what the UI sends.
const MAX_HISTORY_TURNS = 8;
const MAX_CONTENT_CHARS = 4000;

const UNAVAILABLE_MESSAGE =
  "The assistant is not available right now. Please try again later.";

const router: IRouter = Router();

// Per-IP rate limiting on the (paid) AI endpoints. Burst first, then daily, so
// requests rejected by the burst limiter don't count against the daily budget.
router.use("/ai", aiBurstLimiter, aiDailyLimiter);

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

  // Entitlement gating: pass holders are unlimited; everyone else gets a weekly
  // free allowance keyed to their account when signed in, or their IP when
  // anonymous. The per-IP burst/daily limiters above still apply on top.
  const userId = getUserId(req);
  const periodKey = currentPeriodKey();
  let meteredIdentifier: string | null = null;
  if (!(userId && (await userHasPass(userId)))) {
    meteredIdentifier = userId ? `user:${userId}` : `ip:${getClientIp(req)}`;
    const used = await getUsage(meteredIdentifier, periodKey);
    if (used >= FREE_WEEKLY_LIMIT) {
      res.status(403).json({
        error: `You've used all ${FREE_WEEKLY_LIMIT} free questions this week. Unlock the Full Pregnancy Pass for unlimited questions.`,
        code: "FREE_LIMIT_REACHED",
      });
      return;
    }
  }

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

    // Only count successful answers against the free allowance.
    if (meteredIdentifier) {
      try {
        await incrementUsage(meteredIdentifier, periodKey);
      } catch (err) {
        req.log.error({ err }, "Failed to record AI usage");
      }
    }

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
    const { value: insight, hit } = await weeklyInsightCache.getOrCompute(
      week,
      async () => {
        req.log.info({ week }, "weekly-insight cache miss; generating");
        const message = await getAnthropic().messages.create({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: buildWeeklyInsightPrompt(week) }],
        });

        const text = extractText(message);
        // Don't cache an empty result — treat it as a transient failure so the
        // next request retries instead of serving a placeholder forever.
        if (!text) {
          throw new Error("Empty insight from AI provider");
        }
        return text;
      },
    );

    if (hit) {
      req.log.info({ week }, "weekly-insight cache hit");
    }

    res.json(
      GetWeeklyInsightResponse.parse({
        week,
        insight,
        disclaimer: DISCLAIMER,
      }),
    );
  } catch (err) {
    req.log.error({ err }, "AI weekly-insight request failed");
    res.status(502).json({ error: "The assistant is unavailable right now. Please try again." });
  }
});

export default router;
