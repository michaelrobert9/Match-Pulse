# MatchPulse — main site

The front door for MatchPulse: the hub that routes people to each **sport platform**
(Hockey, Netball, Rugby, Water Polo), sells the product, and owns **account, plan and
billing** for the whole platform.

Firebase project `match-pulse-4560e`, hosting site `match-pulse-4560e`.
Architecture contract for all five repos: **[`ARCHITECTURE.md`](./ARCHITECTURE.md)**.

## Scope

This site owns — and is the *only* place on the platform that owns:

- Account settings: name, email and password changes
- Plan display, PayFast purchase, and the ITN webhook that grants plans
- The `(default)` Firestore schema: `users`, `userProfiles`, `people`, `organizations`
- `syncUserClaims` — mirrors plan + org roles onto the Auth token every sport reads

Sign-in itself is **not** centralised: each origin (this site and every sport) runs its own
Firebase Auth sign-in directly, because an iOS home-screen app can't receive a cross-origin
auth redirect. See `ARCHITECTURE.md` §2.

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
  pages/      Home (marketing + sports hub), Login, Signup, Account, Portal
  components/ Nav, Footer, ProtectedRoute
  contexts/   AuthContext — identity + read-only plan state
  lib/        sports.js (the sport registry), payfast.js (hosted checkout URLs)
  firebase.js (default) database; explicit auth-persistence chain; Functions region
functions/    syncUserClaims (+ backfill), payfastITN
firestore.rules  (default) database rules — superset of hockey's
```

## Adding a sport

Edit `src/lib/sports.js` — it drives the hub cards and the footer links. Sport cards link
straight to that sport's own site; there is no handoff to keep in sync.

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

- Contact form backend
- Legal document pages
- Deploy `syncUserClaims` + run `backfillUserClaims` once (blocks entitlement gating
  everywhere until it fires — `ARCHITECTURE.md` §4)
