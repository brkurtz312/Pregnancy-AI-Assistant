import { createClient } from "@replit/revenuecat-sdk/client";

type ConnectionSettings = {
  access_token?: string;
  oauth?: {
    credentials?: {
      access_token?: string;
      expires_at?: string;
    };
  };
};

let cached: { token: string; expiresAt: number } | null = null;

/**
 * Fetches a RevenueCat OAuth access token from the Replit connector.
 *
 * Only used when `REVENUECAT_SECRET_API_KEY` is unset. Deleted once the move
 * off Replit is complete -- see docs/replit-exit-plan.md. The token rotates,
 * hence the expiry-aware cache; a plain API key does not.
 */
async function getAccessTokenFromReplit(): Promise<string> {
  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
      ? "depl " + process.env.WEB_REPL_RENEWAL
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "RevenueCat is not configured. Set REVENUECAT_SECRET_API_KEY, or run " +
        "on Replit with RevenueCat connected in the Integrations pane.",
    );
  }

  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=revenuecat`,
    {
      headers: {
        Accept: "application/json",
        X_REPLIT_TOKEN: xReplitToken,
      },
    },
  );

  if (!res.ok) {
    throw new Error(`Failed to fetch RevenueCat connection: ${res.status}`);
  }

  const data = (await res.json()) as {
    items?: { settings?: ConnectionSettings }[];
  };
  const settings = data.items?.[0]?.settings;
  const token =
    settings?.access_token ?? settings?.oauth?.credentials?.access_token;

  if (!token) {
    throw new Error(
      "RevenueCat is not connected. Connect it in the Integrations pane, " +
        "or set REVENUECAT_SECRET_API_KEY.",
    );
  }

  const expiresAtStr = settings?.oauth?.credentials?.expires_at;
  const expiresAt = expiresAtStr
    ? new Date(expiresAtStr).getTime()
    : Date.now() + 5 * 60_000;
  cached = { token, expiresAt };
  return token;
}

/**
 * Returns the RevenueCat REST v2 bearer credential, preferring the
 * environment over Replit.
 *
 * `REVENUECAT_SECRET_API_KEY` is a v2 secret API key from the RevenueCat
 * dashboard (Project settings -> API keys). It authenticates the same way the
 * connector's OAuth token does, so nothing downstream changes.
 */
async function getAccessToken(): Promise<string> {
  const apiKey = process.env.REVENUECAT_SECRET_API_KEY;
  if (apiKey) {
    return apiKey;
  }
  return getAccessTokenFromReplit();
}

/**
 * Returns a RevenueCat REST v2 client authenticated with a fresh credential.
 * When that credential is a Replit OAuth token it rotates, so always fetch a
 * new client per logical operation rather than caching the client itself.
 */
export async function getUncachableRevenueCatClient(): Promise<
  ReturnType<typeof createClient>
> {
  const accessToken = await getAccessToken();
  return createClient({
    baseUrl: "https://api.revenuecat.com/v2",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
