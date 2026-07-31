# MatchPulse Main Site — State of Play

A standalone catch-up for a fresh chat focused only on the main site (`Match-Pulse`,
Firebase project `match-pulse-4560e`). Everything here is committed on branch
`claude/match-pulse-home-design-w65epj` (open draft PR #1). Read this + `ARCHITECTURE.md`
and you have the full picture without the prior chat.

---

## What the main site is

The front door and the account system for a multi-sport platform. One brand, one Firebase
project, five deployments: this main site plus four sport apps (Hockey, Netball, Rugby,
Water Polo), each on its own origin, all sharing the project's Auth and `(default)` Firestore.

**The main site owns, exclusively:** account settings (name/email/password), plan display +
PayFast purchase, the central `(default)` schema, and the Cloud Functions that mirror plan
and org state onto the Auth token. It owns **no** sport-specific anything.

**Live domain:** `matchpulse.co.za` (DNS + hosting already wired). Also on
`match-pulse-4560e.web.app` (the project's default hosting site — hockey moved to its own
site `match-pulse-hockey`).

---

## Stack & layout

React + Vite + Firebase, single self-contained design system in `src/index.css` (extends the
hockey app's tokens; brand green unified on emerald-600 `#059669`). Fonts: Space Grotesk /
Inter / Roboto.

```
src/
  pages/      Home (marketing + sports hub), Login, Signup, Account, Portal
  components/ Nav, Footer, ProtectedRoute
  contexts/   AuthContext — identity + read-only plan state
  lib/        sports.js (sport registry), payfast.js (hosted checkout URLs)
  firebase.js (default) DB; initializeAuth persistence chain; Functions region
functions/    syncUserClaims, syncOrgRoleClaim, backfillUserClaims, payfastITN
firestore.rules   (default) rules — strict superset of hockey's
firebase.json     hosting (site match-pulse-4560e) + /payfast/itn rewrite + functions
.github/workflows/firebase-deploy.yml
ARCHITECTURE.md         the platform contract (read this)
docs/SPORT-REPO-BRIEF.md  what the four sport chats are working from
```

---

## The decisions that drive everything (and how they got here)

1. **Auth: direct per-origin sign-in. No cross-origin handoff.** An earlier design (a
   redirect + one-time ticket → custom token) was built and then **removed**: an installed
   iOS home-screen app can't receive a redirect from an external origin, so the session was
   invisible to the app. Every origin now runs its own Firebase Auth sign-in against the
   shared project. One account, one UID, every method (email+password and Google resolve the
   same identity). Sign-up treats "already exists" as "switch to sign-in."

2. **Region: Functions are `europe-west1`, Firestore is `africa-south1`.** Different settings;
   conflating them is the classic mistake. Held in one overridable constant each side
   (`FUNCTIONS_REGION` / `VITE_FUNCTIONS_REGION`). **Still unverified against the live
   deployment** — confirm with `firebase functions:list`.

3. **Entitlement + org roles ride on Auth custom claims.** Firestore rules can't read across
   databases, so sport rules gate on `request.auth.token.{entitlement,platformAdmin,orgRoles}`.
   Two functions keep the token true: `syncUserClaims` (users doc → token) and
   `syncOrgRoleClaim` (staff subcollection → users.orgRoles → token). Staff is the single
   authority for org membership.

4. **Billing: PayFast hosted buttons + ITN webhook, main site only.** Not signed-payload
   code — just hosted `_paynow` links tagged with `m_payment_id=<uid>__<plan>__<ts>` so the
   webhook can attribute and activate automatically (that tagging is the one thing that makes
   activation non-manual). `payfastITN` verifies (signature or PayFast callback), is
   idempotent, and records every payment to `payments/{id}`.

5. **Orgs are central (`(default)`), not sport-specific.** One org runs across sports. No
   users exist yet, so nothing to migrate — sports just point their org reads/writes at the
   `(default)` handle, and switch org-auth to the claim in the same change.

---

## What's built vs deployed — the honest status

Everything below is **written and builds clean**, verified in a headless browser. **Nothing
is deployed** — this session has no Firebase CLI or credentials.

| Piece | Built | Deployed |
|---|---|---|
| Marketing home + sports hub | ✅ | ⬜ (CI deploys hosting on push, once secrets are set) |
| Login / Signup / Account / Portal | ✅ | ⬜ |
| `syncUserClaims` + `backfillUserClaims` | ✅ | ⬜ **critical path** |
| `syncOrgRoleClaim` | ✅ | ⬜ |
| `payfastITN` + hosting rewrite | ✅ | ⬜ |
| `firestore.rules` (superset) | ✅ | ⬜ (still deployed by hockey today — see below) |

### The critical path
`syncUserClaims` is **not deployed anywhere** (an earlier assumption that it lived in hockey
was wrong). Until it's deployed and `backfillUserClaims` is run once, **every** claims-based
rule fails closed — no one can create a competition, and even the platform admin loses admin
(the `platformAdmin` claim is absent too). Deploy this first.

```bash
firebase deploy --only functions --project match-pulse-4560e
# then once, with a real key set as the CLAIMS_BACKFILL_KEY env/secret:
#   https://europe-west1-match-pulse-4560e.cloudfunctions.net/backfillUserClaims?key=...
```

---

## What YOU (the human) still need to do

1. **Add GitHub secrets** to the `Match-Pulse` repo so CI can build/deploy: `FIREBASE_SERVICE_ACCOUNT`
   and the six `VITE_FIREBASE_*` (build fails without `VITE_FIREBASE_API_KEY`, by design).
2. **Deploy functions + run the backfill** (above) — the whole platform's blocker.
3. **Set the default branch** to `main` in GitHub (repo had none; `main` now exists).
4. **Authorized domains** (Console → Auth → Settings): add `matchpulse.co.za` and each
   custom subdomain as DNS lands, or Google sign-in fails per-origin.
5. **Set `_meta/payfastConfig.passphrase`** if you use a PayFast passphrase (else the webhook
   falls back to PayFast's server confirmation — works, slower).
6. **Coordinate the hockey cutover:** in one deploy, hockey drops its `syncUserClaims` and its
   `firestore.default.rules` deploy step (both now owned here), removes PayFast, moves
   `position` out of `users/{uid}`, and points orgs at `(default)`.

---

## Open items (not yet built)

- **Contact form backend** (form UI exists, unwired).
- **Legal pages** (Terms/Privacy/Cookies/Acceptable-Use — content exists in the hockey repo,
  needs porting).
- **Invite flow** — undecided; tied to who owns org/staff admin UI (main site vs sport).
- **Org/staff admin UI** — where an organiser creates an org and manages staff isn't built or
  fully located yet. `syncOrgRoleClaim` is ready for it; the UI that writes `staff` is not.

---

## Sport-repo dependencies (so you know who's waiting on what)

The four sport chats work from `docs/SPORT-REPO-BRIEF.md`. They're blocked on the main site
for: `syncUserClaims` deployment (entitlement + admin), the org-role claim (org-scoped auth),
and authorized-domains config. Netball found the iOS issue; rugby found the org-role
half-decision and the function-name collision risk. Both reports are folded into the brief
and `ARCHITECTURE.md §7`.
