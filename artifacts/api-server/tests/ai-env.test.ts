import { describe, it, expect } from "vitest";
import { aiCredentialReport, aiProblems } from "../src/lib/ai-env";

// What a correct deployment off Replit looks like: the vendors' own APIs, with
// keys billed to our own accounts.
const CONFIGURED: NodeJS.ProcessEnv = {
  AI_INTEGRATIONS_ANTHROPIC_BASE_URL: "https://api.anthropic.com",
  AI_INTEGRATIONS_ANTHROPIC_API_KEY: "sk-ant-x",
  AI_INTEGRATIONS_OPENAI_BASE_URL: "https://api.openai.com/v1",
  AI_INTEGRATIONS_OPENAI_API_KEY: "sk-proj-x",
};

describe("fully configured", () => {
  it("reports the host of each base URL and raises nothing", () => {
    const report = aiCredentialReport(CONFIGURED);
    expect(report.anthropic).toEqual({
      key: "set",
      baseUrlHost: "api.anthropic.com",
      baseUrlInvalid: false,
    });
    expect(report.openai.baseUrlHost).toBe("api.openai.com");
    expect(aiProblems(report)).toEqual([]);
  });
});

describe("off Replit with nothing injected", () => {
  const problems = aiProblems(aiCredentialReport({}));

  it("calls every gap an error", () => {
    expect(problems).toHaveLength(4);
    expect(problems.every((p) => p.severity === "error")).toBe(true);
  });

  it("says what a user loses, not just which variable is unset", () => {
    const anthropic = problems.find((p) =>
      p.message.includes("AI_INTEGRATIONS_ANTHROPIC_API_KEY"),
    );
    expect(anthropic?.message).toMatch(/AI assistant and visit summaries/);
    const openai = problems.find((p) =>
      p.message.includes("AI_INTEGRATIONS_OPENAI_API_KEY"),
    );
    expect(openai?.message).toMatch(/transcription/);
  });
});

// The mistake that actually happened: the key typed into the line above the
// one it belonged on. It reads as a configuration error, and it is also an
// exposure, because the value reaches logs.
describe("an API key pasted into a base URL variable", () => {
  const ENV: NodeJS.ProcessEnv = {
    ...CONFIGURED,
    AI_INTEGRATIONS_OPENAI_BASE_URL: "sk-proj-THIS-IS-A-SECRET",
  };

  it("is reported as an invalid URL, and says to rotate the key", () => {
    const report = aiCredentialReport(ENV);
    expect(report.openai.baseUrlInvalid).toBe(true);
    expect(report.openai.baseUrlHost).toBeNull();

    const problem = aiProblems(report).find((p) =>
      p.message.includes("AI_INTEGRATIONS_OPENAI_BASE_URL"),
    );
    expect(problem?.severity).toBe("error");
    expect(problem?.message).toMatch(/rotate it/);
  });

  it("never repeats the value, which is the whole point", () => {
    const report = aiCredentialReport(ENV);
    const everythingLogged =
      JSON.stringify(report) + JSON.stringify(aiProblems(report));
    expect(everythingLogged).not.toContain("THIS-IS-A-SECRET");
  });
});

// Still on Replit, where the injected base URLs point at Replit's gateway
// rather than the vendors'. Nothing is broken, and the host in the boot log is
// how that shows up after a move that was supposed to change it.
describe("on Replit", () => {
  it("raises nothing, and names the host it is pointed at", () => {
    const report = aiCredentialReport({
      AI_INTEGRATIONS_ANTHROPIC_BASE_URL:
        "https://gateway.replit.com/anthropic",
      AI_INTEGRATIONS_ANTHROPIC_API_KEY: "injected",
      AI_INTEGRATIONS_OPENAI_BASE_URL: "https://gateway.replit.com/openai/v1",
      AI_INTEGRATIONS_OPENAI_API_KEY: "injected",
    });
    expect(aiProblems(report)).toEqual([]);
    expect(report.anthropic.baseUrlHost).toBe("gateway.replit.com");
  });
});
