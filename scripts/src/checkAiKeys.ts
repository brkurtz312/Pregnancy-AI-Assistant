/**
 * Verifies that the AI credentials in the environment can make the calls the
 * API server makes.
 *
 * The AI assistant (`/api/ai`) and the scribe (`/api/scribe`) reach Anthropic
 * and OpenAI through four environment variables that Replit injects. Off Replit
 * they have to be supplied directly, and a key that is merely present is not
 * the same as a key that works: the wrong organisation, an exhausted balance,
 * or a model the account cannot reach all look identical from the outside and
 * only surface when a user taps the feature.
 *
 *   pnpm --filter @workspace/scripts run check-ai-keys
 *
 * Both checks are deliberately cheap. The Anthropic one asks for a single
 * token; the OpenAI one only looks up a model and spends nothing.
 */

/** The model `/api/ai` and the scribe's note generation both request. */
const ANTHROPIC_MODEL = "claude-sonnet-4-6";

/** The model the scribe transcribes audio with. */
const OPENAI_MODEL = "gpt-4o-mini-transcribe";

const problems: string[] = [];

function fail(problem: string): void {
  problems.push(problem);
  console.log(`  !! ${problem}`);
}

/**
 * Validates a base URL and trims one trailing slash so it joins cleanly.
 *
 * Returns null when the value is not a URL at all, which is what an API key
 * pasted into the wrong variable looks like. The value is never echoed: a
 * secret landing here would otherwise be printed to the console, and printed
 * again inside fetch's "Failed to parse URL from ..." message. That happened.
 */
function base(url: string): string | null {
  const trimmed = url.trim().replace(/\/+$/, "");
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  return trimmed;
}

/** Names a variable whose value is not a URL, without repeating the value. */
function notAUrl(name: string): string {
  return (
    `${name} is set to something that is not a URL. If an API key was pasted ` +
    "into it by mistake, treat that key as exposed and rotate it."
  );
}

/**
 * Describes a thrown request failure without letting the URL -- which may hold
 * a misplaced secret -- into the output.
 */
function thrown(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : null;
  return code ? `request failed (${code})` : "request failed";
}

/**
 * Reads an error response without letting a non-JSON body (an HTML proxy page,
 * an empty 502) throw on top of the failure being reported.
 */
async function detail(res: Response): Promise<string> {
  let body: string;
  try {
    body = (await res.text()).slice(0, 300);
  } catch {
    body = "(no body)";
  }
  return `HTTP ${res.status} ${body}`.trim();
}

async function checkAnthropic(): Promise<void> {
  console.log("\n=== ANTHROPIC (/api/ai, scribe notes) ===");
  const url = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const key = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!url || !key) {
    fail(
      "AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY " +
        "must both be set; the AI assistant and scribe notes throw without them",
    );
    return;
  }
  const root = base(url);
  if (!root) {
    fail(notAUrl("AI_INTEGRATIONS_ANTHROPIC_BASE_URL"));
    return;
  }
  console.log(`Base URL: ${root}`);

  let res: Response;
  try {
    res = await fetch(`${root}/v1/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
  } catch (err) {
    fail(`could not reach ${root}: ${thrown(err)}`);
    return;
  }

  if (!res.ok) {
    fail(
      `${ANTHROPIC_MODEL} is not usable with this key: ${await detail(res)}`,
    );
    return;
  }
  console.log(`  ok: ${ANTHROPIC_MODEL} answered`);
}

async function checkOpenAI(): Promise<void> {
  console.log("\n=== OPENAI (scribe transcription) ===");
  const url = process.env.AI_INTEGRATIONS_OPENAI_BASE_URL;
  const key = process.env.AI_INTEGRATIONS_OPENAI_API_KEY;
  if (!url || !key) {
    fail(
      "AI_INTEGRATIONS_OPENAI_BASE_URL and AI_INTEGRATIONS_OPENAI_API_KEY must " +
        "both be set; recording a visit fails at transcription without them",
    );
    return;
  }
  const root = base(url);
  if (!root) {
    fail(notAUrl("AI_INTEGRATIONS_OPENAI_BASE_URL"));
    return;
  }
  console.log(`Base URL: ${root}`);

  let res: Response;
  try {
    res = await fetch(`${root}/models/${OPENAI_MODEL}`, {
      headers: { authorization: `Bearer ${key}` },
    });
  } catch (err) {
    fail(`could not reach ${root}: ${thrown(err)}`);
    return;
  }

  if (!res.ok) {
    fail(
      `${OPENAI_MODEL} is not reachable with this key: ${await detail(res)}`,
    );
    return;
  }
  console.log(`  ok: ${OPENAI_MODEL} is available to this account`);
}

async function check(): Promise<void> {
  // Sequential rather than parallel: the output reads as two sections, and one
  // failing credential should not interleave with the other's success.
  await checkAnthropic();
  await checkOpenAI();

  console.log("\n=== SUMMARY ===");
  if (problems.length === 0) {
    console.log(
      "OK -- the AI assistant and the scribe will both work with these credentials.",
    );
    return;
  }
  console.log(`${problems.length} problem(s):`);
  for (const p of problems) console.log(`- ${p}`);
  process.exitCode = 1;
}

check().catch((err) => {
  // Deliberately not the raw error: fetch puts the whole URL in its message,
  // and the URL is where a misplaced key would be.
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
