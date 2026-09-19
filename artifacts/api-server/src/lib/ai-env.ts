/**
 * Whether the AI credentials will actually work where this server is running —
 * answered at boot, not when a user taps the feature.
 *
 * The AI assistant (`/api/ai`) and the scribe (`/api/scribe`) reach Anthropic
 * and OpenAI through four variables that Replit injects. Off Replit they have
 * to be supplied by hand, and the failure mode is quiet: the server boots
 * normally, every other route works, and only these two throw. The exit plan
 * had missed them entirely (see docs/replit-exit-plan.md), which is the whole
 * argument for saying so at boot.
 */

export type AiCredentialState = "set" | "missing";

export interface AiProviderReport {
  key: AiCredentialState;
  /**
   * The host of the configured base URL, or null when it is unset or is not a
   * URL at all.
   *
   * The host rather than the URL, and never the raw value: an API key pasted
   * into a `_BASE_URL` variable has happened, and anything echoed from here
   * reaches the deploy log. The host is also the useful part — it is how a
   * deployment still pointing at Replit's gateway after the move announces
   * itself.
   */
  baseUrlHost: string | null;
  /** True when the base URL is set but could not be parsed. */
  baseUrlInvalid: boolean;
}

export interface AiCredentialReport {
  /** The assistant, and the scribe's note generation. */
  anthropic: AiProviderReport;
  /** The scribe's audio transcription. */
  openai: AiProviderReport;
}

function readProvider(
  env: NodeJS.ProcessEnv,
  urlName: string,
  keyName: string,
): AiProviderReport {
  const rawUrl = env[urlName];
  const key = env[keyName] ? "set" : "missing";

  if (!rawUrl) return { key, baseUrlHost: null, baseUrlInvalid: false };
  try {
    return { key, baseUrlHost: new URL(rawUrl).host, baseUrlInvalid: false };
  } catch {
    return { key, baseUrlHost: null, baseUrlInvalid: true };
  }
}

export function aiCredentialReport(
  env: NodeJS.ProcessEnv = process.env,
): AiCredentialReport {
  return {
    anthropic: readProvider(
      env,
      "AI_INTEGRATIONS_ANTHROPIC_BASE_URL",
      "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
    ),
    openai: readProvider(
      env,
      "AI_INTEGRATIONS_OPENAI_BASE_URL",
      "AI_INTEGRATIONS_OPENAI_API_KEY",
    ),
  };
}

export interface AiProblem {
  severity: "error" | "warn";
  message: string;
}

interface ProviderCopy {
  urlName: string;
  keyName: string;
  /** What stops working, in the user's terms rather than the route's. */
  breaks: string;
}

const PROVIDERS: Record<keyof AiCredentialReport, ProviderCopy> = {
  anthropic: {
    urlName: "AI_INTEGRATIONS_ANTHROPIC_BASE_URL",
    keyName: "AI_INTEGRATIONS_ANTHROPIC_API_KEY",
    breaks: "The AI assistant and visit summaries will fail on first use.",
  },
  openai: {
    urlName: "AI_INTEGRATIONS_OPENAI_BASE_URL",
    keyName: "AI_INTEGRATIONS_OPENAI_API_KEY",
    breaks: "Recording a visit will fail at transcription.",
  },
};

/**
 * What is broken, named by consequence. A boot log that says a variable is
 * unset is a fact; one that says the scribe cannot transcribe is a reason to
 * stop the deploy.
 */
export function aiProblems(report: AiCredentialReport): AiProblem[] {
  const problems: AiProblem[] = [];

  for (const name of Object.keys(PROVIDERS) as (keyof AiCredentialReport)[]) {
    const { urlName, keyName, breaks } = PROVIDERS[name];
    const provider = report[name];

    if (provider.baseUrlInvalid) {
      problems.push({
        severity: "error",
        message:
          `${urlName} is set to something that is not a URL. If an API key ` +
          `was pasted into it by mistake, treat that key as exposed and ` +
          `rotate it. ${breaks}`,
      });
    } else if (provider.baseUrlHost === null) {
      problems.push({
        severity: "error",
        message: `${urlName} is unset. ${breaks}`,
      });
    }

    if (provider.key === "missing") {
      problems.push({
        severity: "error",
        message: `${keyName} is unset. ${breaks}`,
      });
    }
  }

  return problems;
}
