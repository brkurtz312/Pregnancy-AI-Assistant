---
name: Clerk mobile 401s — AuthTokenBridge race condition
description: Why @clerk/expo mobile API calls return 401 even when signed in, and the robust fix.
---

## The problem

All authenticated API calls from the iOS app returned 401. The server was receiving requests with no `Authorization` header, even after a successful sign-in.

Root cause: `AuthTokenBridge` was implemented as:

```javascript
function AuthTokenBridge() {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(() => getToken());
  }, [getToken]);
  return null;
}
```

Two compounding issues:
1. `useAuth()` returns a new `getToken` function reference on every render (no `useCallback` in @clerk/expo v3), so `useEffect([getToken])` re-runs on every render — but that's still async, runs after paint.
2. Race: when Clerk restores a session (cold start) or completes sign-in, `isSignedIn` flips true in the same render that enables React Query queries. React Query's internal effects (which fire the actual fetch) run after `AuthTokenBridge`'s effect — but both are in the same effect flush. Order isn't guaranteed when they're in sibling component subtrees.

**Why clerkMiddleware callback form also hurt:** The server was using `publishableKeyFromHost(getClerkProxyHost(req) ?? "")` to compute the publishable key from the request `Host` header. Native mobile requests don't carry the web Host header, so this could compute a wrong/empty publishable key and prevent Clerk from validating the token.

## The fix

**Mobile (_layout.tsx):**
```javascript
function AuthTokenBridge() {
  const { session } = useSession();
  const sessionRef = useRef(session);
  // Updated synchronously on every render — before any effects run
  sessionRef.current = session;

  useEffect(() => {
    // Registered once on mount; closure always reads the current ref
    setAuthTokenGetter(async () => {
      try {
        return (await sessionRef.current?.getToken()) ?? null;
      } catch {
        return null;
      }
    });
    return () => setAuthTokenGetter(null);
  }, []); // empty deps — intentional
  return null;
}
```

Key properties:
- `sessionRef.current` is updated synchronously during render (safe for refs).
- The getter is registered once on mount → already in place before any query fires.
- `session.getToken()` (from `useSession`) is the Clerk session method, well-tested.
- When signed out, `sessionRef.current` is null, getter returns null.

**Server (app.ts):**
Replace the publishableKey-from-host callback with the no-arg form:
```javascript
app.use(clerkMiddleware()); // reads CLERK_PUBLISHABLE_KEY/CLERK_SECRET_KEY from env
```

**Why:**
`publishableKeyFromHost(mobileHostHeader)` returns an empty/wrong key for native requests. The simple `clerkMiddleware()` form reads from env vars which is always correct for both web and mobile.

## Additional fixes in same session

- `sign-in.tsx` finalize: add `decorateUrl` + `session?.currentTask` guard (matching sign-up pattern) — Clerk dev-instance JWT handoff.
- `profile.tsx`: wrap ScrollView in KeyboardAvoidingView so access-code TextInput isn't covered by iOS keyboard.
- `auth.ts`: add `hasAuthHeader` diagnostic log to `requireAuth` for production debugging.
