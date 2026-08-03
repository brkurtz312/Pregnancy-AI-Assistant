# Pregnancy Assistant Mobile

Expo/React Native mobile app for the Pregnancy Assistant platform.

---

## EAS Build hooks

Two npm lifecycle scripts run automatically during every EAS build. They are
invoked by EAS in the order shown below and **abort the build if they exit
non-zero**, so a misconfiguration is caught before any build minutes are
consumed.

| Hook                     | Script                                  | When it runs                                           |
| ------------------------ | --------------------------------------- | ------------------------------------------------------ |
| `eas-build-pre-install`  | `scripts/validate-eas-provisioning.js`  | Before package installation — fastest possible failure |
| `eas-build-post-install` | `scripts/validate-watch-icon-format.js` | After package installation                             |

### Why `eas-build-pre-install` for provisioning?

The provisioning check reads only `app.json` and `eas.json` (both checked in to
the repo), so it needs no npm packages. Running it at `pre-install` means a
misconfigured Watch bundle ID or missing `credentialsSource` is rejected before
EAS has installed a single dependency — zero build minutes wasted.

You can also run it locally at any time:

```sh
pnpm run validate:provisioning
```

### What `validate-eas-provisioning.js` checks

1. `app.json` has an `ios.bundleIdentifier`
2. `app.json extra.eas.build.experimental.ios.appExtensions` contains a Watch
   extension entry with the correct bundle ID (`<mainId>.watchapp`), a
   `targetName`, and the App Group entitlement
3. `eas.json build.production.ios.credentialsSource` is `"remote"` (prevents
   EAS from reusing a stale cached profile)
4. `eas.json cli.version` is set
5. `app.json plugins` includes `"./plugins/withWatchExtension"`

Any failure prints a human-readable explanation and exits 1, which EAS treats
as a build error.

---

## Local development

```sh
# Start the Expo dev server
pnpm run dev

# Type-check
pnpm run typecheck

# Run unit tests
pnpm run test

# Run provisioning check manually
pnpm run validate:provisioning
```
