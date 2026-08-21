# App Review Resubmission Notes

Use this checklist only after completing the Production TestFlight preflight in
`docs/ops-runbook.md`. Do not submit legacy Clerk credentials or enter the
reviewer access code in the App Store Connect password field.

## Information for App Review

Replace every bracketed item with a value tested on the exact TestFlight build:

```text
Sign in with Apple
------------------
On iPhone and iPad, select either “Sign in” or “Create an account.” The
“Sign in with Apple” button appears directly below “Continue with Google” and
opens Apple’s native sign-in sheet.

Full-access reviewer account
----------------------------
Email: [tested Production reviewer email]
Password: [tested Production reviewer password]

After signing in, open the Profile tab, choose “Redeem access code,” and enter:
[current reviewer access code]

This unlocks the Full Pregnancy Pass for the reviewer account. No purchase,
subscription, email verification, or two-factor step is required after the
credentials above have been used.
```

## Final verification record

Record the following privately before submitting:

- TestFlight build number and app version:
- Reviewer email/password sign-in verified on:
- Full Pregnancy Pass verified after redemption on:
- Full Pregnancy Pass still active after sign-out/reinstall:
- Apple sign-in verified on iPhone:
- Apple sign-in verified on iPad:
- Production Apple provider configuration verified by:
