---
name: Stripe connector credential fields
description: The Replit Stripe connection settings keys, and where the official stripe SKILL template is wrong.
---

# Stripe connector credential field names

The Replit Stripe connection (`/api/v2/connection?include_secrets=true&connector_names=stripe`)
returns `settings` with these keys:

- `secret` — the Stripe secret key (use this)
- `publishable` — the publishable key
- `account_id`, `mcp`, `claim_url`

**The stripe SKILL `references/code-templates.md` template is WRONG**: it reads
`settings.secret_key` and `settings.webhook_secret`, which do NOT exist on the
connection. Using them makes `getStripeCredentials()` throw
"Stripe integration not connected or missing secret key" even when Stripe is
healthy/connected. Read `settings.secret` instead.

**Why:** the connector payload shape differs from the skill template's assumed shape.
**How to apply:** whenever wiring `stripeClient.ts` from the blueprint, verify the
field name against `listConnections('stripe')[0].settings` (or the raw connector API)
before trusting the template. There is no `webhook_secret` on the connection — the
managed webhook (`findOrCreateManagedWebhook` in stripe-replit-sync) provisions and
stores its own signing secret, so passing `webhookSecret: ""` is fine.

Runtime deps `stripe` + `stripe-replit-sync` belong in the artifact that imports them
(api-server `dependencies`, scripts `dependencies`), NOT root — root install fails
with ERR_PNPM_ADDING_TO_ROOT.
