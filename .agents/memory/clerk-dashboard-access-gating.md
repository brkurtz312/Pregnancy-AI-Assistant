---
name: Clerk dashboard access can be Pro-gated even when management is "managed"
description: checkClerkManagementStatus's dashboardAccess field can be requires_personal_pro independently of the management status; don't assume the clerk-auth skill's open-in-pane marker is usable just because status is "managed".
---

## What happened

For this project, `checkClerkManagementStatus()` returned `{ status: "managed", dashboardAccess: "requires_personal_pro" }`.
The user (without Personal Pro) reported "Clerk does not have a production instance, just development",
and this note concluded they were mistaken — reasoning from Replit's docs that a Production environment
is created automatically at publish, and treating distinct production database rows (a different
`reviewer_demo_user_id`) as independent confirmation.

**Corrected 12 Sep 2026. The user was right, and this note's evidence never supported its conclusion.**

Distinct rows prove the production *database* is separate. They say nothing about Clerk instances. The
two are unrelated: a deployment can point at its own database while using development Clerk keys, which
is exactly what this project does — EAS production carries `pk_test_`, and the deployment runs
`pk_test_` with `sk_test_`. Every client authenticates against Development, and the dashboard shows no
Production instance.

**The lesson is about the reasoning, not the fact.** A user with dashboard access reported what they
could see; this note overrode them with an inference from vendor documentation plus evidence about a
different system, then recorded the override as established fact for everyone who read it afterwards.
It sent two later sessions down the wrong path. When a person's direct observation conflicts with an
inference, check something that discriminates between the two — here, the key prefix each client
actually ships — before writing down that they are wrong.

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
