# MatchPulse — main site

The front door for MatchPulse: the hub that routes people to each **sport platform**
(Hockey, Netball, Rugby, Water Polo), sells the product, and owns **account, plan and
billing** for the whole platform.

Firebase project `match-pulse-4560e`, hosting site `match-pulse-4560e`.
Architecture contract for all five repos: **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

## Scope

This site owns — and is the *only* place on the platform that owns:

- Sign-up, sign-in, password and email changes
- Plan display and (shortly) purchase + billing
- The `(default)` Firestore schema: `users`, `userProfiles`, `people`, `organizations`
- The auth handoff that signs a user into a sport subdomain

It deliberately owns **no** sport-specific profile UI. Position, club and squad live on
each sport's own site, because every sport records them differently.

## Running it

```bash
npm install
cp .env.example .env      # fill in the VITE_FIREBASE_* values
npm run dev
```

Without `VITE_FIREBASE_API_KEY` the app builds and the marketing page renders, but auth
screens show "Not configured yet" rather than failing at runtime.

## Layout

```
src/
  pages/      Home (marketing + sports hub), Login, Signup, Account
  components/ Nav, Footer, ProtectedRoute
  contexts/   AuthContext — identity + read-only plan state
  lib/        sports.js (the sport registry), handoff.js (auth handoff)
  firebase.js (default) database, Functions pinned to europe-west1
functions/    createHandoffTicket, redeemHandoffTicket
scripts/      audit-default-db.mjs, migrate-orgs-to-default.mjs
firestore.rules  (default) database rules — superset of hockey's
```

## Adding a sport

Edit **both**, or the handoff breaks:

1. `src/lib/sports.js` — drives the hub cards
2. `functions/index.js` → `SPORT_HOSTS` — the redirect **allowlist**, a security boundary

## Deploys

CI deploys hosting on push (`.github/workflows/firebase-deploy.yml`). Requires these
repo secrets:

| Secret | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | deploy credential |
| `VITE_FIREBASE_API_KEY` | **build fails without it**, by design |
| `VITE_FIREBASE_AUTH_DOMAIN` · `..._PROJECT_ID` · `..._STORAGE_BUCKET` · `..._MESSAGING_SENDER_ID` · `..._APP_ID` | web config |

Functions and rules deploy from a machine with the Firebase CLI:

```bash
firebase deploy --only functions --project match-pulse-4560e
```

Firestore rules are **not** deployed from this repo yet — hockey's CI still deploys the
same `(default)` ruleset. Remove it there first. See `ARCHITECTURE.md` §6.

## Not done yet

- PayFast purchase (exists in the hockey repo; migrating here — `ARCHITECTURE.md` §6)
- Contact form backend
- Legal document pages
- `organizations` migration — scripts are written, not run (§5)
