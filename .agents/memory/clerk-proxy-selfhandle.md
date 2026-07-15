---
name: Clerk proxy middleware selfHandleResponse
description: Why clerkProxyMiddleware.ts must use selfHandleResponse:true and buffer chunked Clerk responses, or sign-in always returns 400 in production.
---

## The Rule

`clerkProxyMiddleware.ts` MUST always be kept in sync with the canonical template at `.local/skills/clerk-auth/templates/api-server/src/middlewares/clerkProxyMiddleware.ts`. Any divergence silently breaks prod sign-in.

The two required fields that must always be present:
1. `selfHandleResponse: true` on the `createProxyMiddleware` config
2. `proxyRes` event handler that buffers chunked responses and sets `Content-Length`

## Why

Clerk's dynamic FAPI responses — especially `POST /v1/client/sign_ins` — arrive **without a `Content-Length`** (chunked transfer encoding). The Replit deployment edge (Cloud Run) rejects chunked proxied responses.

Without the buffering handler, the edge mangles or rejects sign-in POST responses. Symptom: all `POST /api/__clerk/v1/client/sign_ins` return 400 in production. `GET` requests (`/v1/environment`, `/v1/client`) appear to work because Clerk includes `Content-Length` on those responses.

## Diagnostic Signature

- `GET /api/__clerk/v1/environment` → 200 ✓
- `GET /api/__clerk/v1/client` → 200 ✓  
- `POST /api/__clerk/v1/client/sign_ins` → 400 ✗ (consistent, all strategies, all users)
- Reviewer health check (server-side Admin API) → passes (doesn't go through proxy)

## How to Apply

When the Clerk sign-in 400 symptom appears, resync `clerkProxyMiddleware.ts` byte-for-byte against the canonical skill template. Do not try to patch individual fields — replace the whole file from the template.
