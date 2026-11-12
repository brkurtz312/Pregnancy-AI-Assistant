---
name: Web app blank: two copies of react-query
description: Mobile on React 19.3 and web on 19.1 made pnpm install react-query twice; the web bundle used both and the whole site rendered blank ("No QueryClient set"), very likely from the SDK 58 deploy until 2026-11-11. Fix: dedupe @tanstack/react-query in vite.config.ts.
---

Rule: the web app's `vite.config.ts` and `vitest.config.ts` dedupe
`["react", "react-dom", "@tanstack/react-query"]`. Keep all three, and add any
other library whose React context is shared between the web app and
`lib/api-client-react`.

**Why:** pnpm installs a package once per peer-dependency combination. The Expo
SDK 58 upgrade (2026-11-09) moved mobile to React 19.3 while the web app stayed
on 19.1, so `lib/api-client-react` resolved a react-query paired with 19.3 and
the web app one paired with 19.1. Vite bundled both. The app's
`QueryClientProvider` and the API client's hooks used different contexts, the
first hook threw "No QueryClient set", and pregnancy-assistant.com rendered an
empty page. The API, and so the iPhone app, were unaffected.

It was found on 2026-11-11 only because a new `/privacy` page was opened in a
browser after deploy. Every web test passed throughout: they all mock
`@workspace/api-client-react`. Railway's health check (`/api/healthz`) never
loads the site.

**How to apply:**
- `src/__tests__/single-react-query.test.tsx` renders a real, unmocked API
  client hook under the app's provider, and fails on this exact bug. Don't mock
  it away.
- After any React or Expo upgrade, or a lockfile change touching React, open
  the deployed site in a browser and check the console. A passing build and
  green tests are not evidence that it renders.
