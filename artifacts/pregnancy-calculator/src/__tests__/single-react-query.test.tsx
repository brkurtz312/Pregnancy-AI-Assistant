/**
 * The web app and @workspace/api-client-react must share ONE copy of
 * @tanstack/react-query.
 *
 * pnpm installs react-query once per React version it is paired with. Since
 * the mobile app moved to React 19.3 (Expo SDK 58, 2026-11-09) and the web app
 * stayed on 19.1, the shared API client resolves a different copy from the web
 * app. Unless the bundler dedupes it, the app's QueryClientProvider and the
 * client's hooks use different React contexts, every hook throws "No
 * QueryClient set", and the whole site renders blank. It did, in production,
 * very likely from the SDK 58 deploy until 2026-11-11, while every other test
 * passed: they all mock the API client.
 *
 * This test uses the real generated hook, unmocked, under a provider created
 * the way App.tsx creates it. The second test checks the production build
 * config, which is what actually ships.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useHealthCheck } from "@workspace/api-client-react";
import { readFileSync } from "node:fs";
import path from "node:path";

afterEach(cleanup);

function UsesApiClientHook() {
  const { status } = useHealthCheck();
  return <span data-testid="status">{status}</span>;
}

describe("one copy of react-query", () => {
  it("the API client's hooks see the app's QueryClientProvider", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { getByTestId } = render(
      <QueryClientProvider client={client}>
        <UsesApiClientHook />
      </QueryClientProvider>,
    );
    await waitFor(() =>
      expect(getByTestId("status").textContent).toBe("success"),
    );
  });

  it("the production build dedupes react-query", () => {
    const config = readFileSync(
      path.resolve(import.meta.dirname, "../../vite.config.ts"),
      "utf8",
    );
    const dedupe = config.match(/dedupe:\s*\[([^\]]*)\]/)?.[1] ?? "";
    expect(dedupe).toContain('"@tanstack/react-query"');
  });
});
