import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

/**
 * Returns true when the Anthropic AI integration has been provisioned
 * (both base URL and API key env vars are present).
 */
export function isAnthropicConfigured(): boolean {
  return Boolean(
    process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL &&
      process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY,
  );
}

/**
 * Lazily constructs and returns the Anthropic client.
 *
 * The client is created on first use (not at module import) so that a missing
 * integration only affects code paths that actually call Anthropic, rather than
 * crashing the entire process at startup. Throws if the integration env vars are
 * not set.
 */
export function getAnthropic(): Anthropic {
  if (_client) return _client;

  const baseURL = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

  if (!baseURL || !apiKey) {
    throw new Error(
      "Anthropic AI integration is not provisioned. Set AI_INTEGRATIONS_ANTHROPIC_BASE_URL and AI_INTEGRATIONS_ANTHROPIC_API_KEY.",
    );
  }

  _client = new Anthropic({ apiKey, baseURL });
  return _client;
}
