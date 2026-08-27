---
name: Clerk dashboard access can be Pro-gated even when management is "managed"
description: checkClerkManagementStatus's dashboardAccess field can be requires_personal_pro independently of the management status; don't assume the clerk-auth skill's open-in-pane marker is usable just because status is "managed".
---

## What happened

For this project, `checkClerkManagementStatus()` returned `{ status: "managed", dashboardAccess: "requires_personal_pro" }`.
The user (without Personal Pro) reported "Clerk does not have a production instance, just development" —
in reality Replit's docs confirm every Replit-managed Clerk app gets an automatically-created, fully
separate Production environment (own keys, own user store) the moment the app is published, and this
app was already published. The likely explanation is that without Personal Pro, the Clerk dashboard UI
only surfaces/permits managing the Development instance, so Production looked absent even though it
exists and is actively serving the live app (confirmed independently: the production database has its
own distinct rows, e.g. a different `reviewer_demo_user_id`, than development).

**Why:** the clerk-auth skill's "Dashboard-side settings" flow requires calling `checkClerkManagementStatus`
first and gates on `dashboardAccess`, not just on `status`. It's easy to skip this check when you already
know the project uses managed Clerk and jump straight to emitting an `<open-in-pane tool="clerkDashboard/...">`
marker — that violates the skill and can hand the user a button that doesn't actually work for them.

## How to apply

Always call `checkClerkManagementStatus()` immediately before giving *any* dashboard-side guidance or
emitting a `clerkDashboard` marker, even mid-conversation, even if management status was already known.
If `dashboardAccess` is `requires_personal_pro` (or `unavailable`/`unknown`), stop and tell the user plainly
per the skill's exact instructions — do not give dashboard steps, do not emit the marker. When a
Pro-gated user disputes something that should be automatic per Replit's Clerk docs (e.g. "there's no
production instance"), verify independently via data that doesn't require dashboard access — e.g. query
the production database for environment-specific rows — before concluding the user is right or wrong.
