# MatchPulse — Deploy Runbook (main-site functions + hockey handoff)

**Project:** `match-pulse-4560e` · **Functions region:** `europe-west1` (see preflight §0.4) ·
**Firestore:** `(default)` in `africa-south1`

This is the platform's critical-path deploy. It is **not** a from-scratch deploy — **three**
Cloud Functions the main site now owns (`syncUserClaims`, `backfillUserClaims`, and
`payfastITN`) are **already live and owned by the hockey codebase** (hockey confirmed all
three, including `backfillUserClaims`). So this is a **handoff of live functions**, and the
order matters. Do it in one sitting, ideally a low-traffic window. `syncOrgRoleClaim` is the
only genuinely new function.

## Why order matters (read before running anything)

- **Function names are globally unique per project.** `syncUserClaims`, `backfillUserClaims`,
  and `payfastITN` exist once. Hockey deployed them against brief v1; they're firing now.
- **A `firebase deploy --only functions` prunes any function absent from the codebase it
  deploys.** If hockey drops those two and redeploys *before* the main site owns them, the
  deploy **deletes the live functions** → every claims-gated rule across all four sports fails
  closed (no competition creation, platform admin loses admin), and PayFast ITNs 404.
- **The main site uses `codebase: "main"`; hockey uses a different codebase.** Firebase will
  not silently overwrite a same-named function that belongs to a different codebase — moving
  it is a deliberate reassignment (§2 below).
- **Existing ID tokens keep their claims for ~1h** (or until `getIdToken(true)`). That's the
  cushion: a brief handoff gap doesn't sign anyone out or strip already-issued tokens — it
  only means claim *changes* during the gap don't propagate. Keep the gap tight anyway.

The whole platform runs on hockey's live copy until this completes cleanly. Don't leave it
half-done.

---

## 0. Preflight (no deploys yet)

0.1 **Auth to the project.**
```bash
firebase login
firebase use match-pulse-4560e
```

0.2 **See what's actually live and which codebase owns it** — this is the ground truth the
rest of the runbook depends on:
```bash
firebase functions:list --project match-pulse-4560e
```
Confirm: `syncUserClaims` and `payfastITN` appear, note their **codebase** and **region**.
Expect them under hockey's codebase, region `europe-west1`.

0.3 **Set the backfill key** (the function rejects the default placeholder-less request only
if the key matches; set a real one). `functions/index.js` reads
`process.env.CLAIMS_BACKFILL_KEY`. Set it as a secret/env for the `main` codebase — e.g. a
dotenv file the CLI picks up:
```bash
# functions/.env.match-pulse-4560e
CLAIMS_BACKFILL_KEY=<a-long-random-string>
FUNCTIONS_REGION=europe-west1
```
Keep this key out of git (it's under `functions/`, which the deploy ignores `.env*` only if
listed — verify it's gitignored). You'll need the value in §3.

0.4 **Confirm the region** against the live deployment (§0.2 output). Code default is
`europe-west1`; hockey and water polo could not verify it from their workspaces. If live is
something else, set `FUNCTIONS_REGION` to match **before** deploying, and fix the
`/payfast/itn` rewrite region in `firebase.json` to match.

0.5 **Have hockey's cutover commit ready but unpushed/undeployed.** It must, in one change:
- set hockey's `firebase.json` to a distinct `"codebase": "hockey"` and **sport-prefix** its
  own functions (§4c of the brief);
- **remove** hockey's `syncUserClaims`, `backfillUserClaims`, and `payfastITN` declarations, the `/payfast/itn`
  hosting rewrite, and `_meta/payfastConfig` usage;
- **stop deploying `firestore.default.rules`** (the main site owns that ruleset).
Do **not** deploy it until §4.

---

## 1. Deploy the main site's ONE genuinely-new function first

`syncOrgRoleClaim` is the only name hockey doesn't have — it deploys clean, no conflict, no
gap. (Note: under the v3.1 local-first org-auth decision no sport gates on the `orgRoles`
claim, so this function is currently inert — deploying it is harmless and keeps the option
open, but it is not on any auth path.)
```bash
firebase deploy \
  --only functions:main:syncOrgRoleClaim \
  --project match-pulse-4560e
```
Verify it appears in `firebase functions:list` under codebase `main`, region `europe-west1`.

---

## 2. Hand over the three shared names (`syncUserClaims`, `backfillUserClaims`, `payfastITN`)

All three are owned by hockey's codebase and must move to `main`. Try the in-place
reassignment first (no gap); fall back to delete-then-redeploy only if the CLI refuses the
move.

**2a. In-place move (preferred, gap-free):**
```bash
firebase deploy \
  --only functions:main:syncUserClaims,functions:main:backfillUserClaims,functions:main:payfastITN \
  --project match-pulse-4560e --force
```
`--force` accepts the codebase reassignment non-interactively. Firebase updates the functions
in place with the main-site code and re-labels them to codebase `main` — no delete, no gap.

**2b. Fallback (only if 2a errors that the functions belong to another codebase):**
```bash
# tight window — do these two commands back to back
firebase functions:delete syncUserClaims backfillUserClaims payfastITN --project match-pulse-4560e --force
firebase deploy \
  --only functions:main:syncUserClaims,functions:main:backfillUserClaims,functions:main:payfastITN \
  --project match-pulse-4560e
```
The gap is the seconds between the two commands. Existing tokens keep their claims (~1h), so
no one is signed out; only claim changes and PayFast ITNs in that window are affected. Do it
in low traffic.

**Verify:** `firebase functions:list` shows all four (`syncUserClaims`, `syncOrgRoleClaim`,
`backfillUserClaims`, `payfastITN`) under codebase `main`, region `europe-west1`.

---

## 3. Run the backfill once

Stamps `entitlement` / `platformAdmin` / `orgRoles` onto existing users' token source so
already-registered users (including the platform admin) get their claims without waiting for a
users-doc write. Idempotent — safe to re-run.
```bash
curl -fsS "https://europe-west1-match-pulse-4560e.cloudfunctions.net/backfillUserClaims?key=<CLAIMS_BACKFILL_KEY>"
```
(If your region differs, swap the `europe-west1` host segment.) **Verify:** sign in as a known
platform-admin account, call `await auth.currentUser.getIdToken(true)`, and confirm
`platformAdmin: true` and the expected `entitlement` on the refreshed token.

---

## 4. Hockey cutover deploy (only after §1–3 verify)

Now that codebase `main` owns `syncUserClaims` and `payfastITN`, hockey can deploy its cutover
commit (§0.5) safely — its `codebase: "hockey"` deploy prunes only hockey-owned functions, so
it **cannot** delete the main-site-owned pair.
```bash
# from the hockey repo, with the cutover commit checked out
firebase deploy --only functions:hockey --project match-pulse-4560e
firebase deploy --only hosting --project <hockey-hosting-site>   # drops /payfast/itn rewrite
```
⚠️ **Do not** run a bare `firebase deploy --only functions` from hockey while its firebase.json
still lacks the `hockey` codebase or still declares any of the three shared functions — that
reprunes them. The distinct codebase + removed declarations must be in the deployed commit.

---

## 5. Main-site hosting + rules

- **Rules** (main owns the `(default)` superset):
  ```bash
  firebase deploy --only firestore:rules --project match-pulse-4560e
  ```
- **Hosting** — CI (`.github/workflows/firebase-deploy.yml`) deploys hosting on push once the
  GitHub secrets are set (`FIREBASE_SERVICE_ACCOUNT`, the six `VITE_FIREBASE_*`). To deploy by
  hand:
  ```bash
  npm run build && firebase deploy --only hosting:match-pulse-4560e --project match-pulse-4560e
  ```
  This publishes the `/payfast/itn` rewrite pointing at the main site's `payfastITN`.

---

## 6. Post-deploy verification

- [ ] `firebase functions:list` → four functions under codebase `main`, region `europe-west1`;
      hockey's sport functions under codebase `hockey`, all prefixed.
- [ ] Platform-admin token carries `platformAdmin: true` after `getIdToken(true)` (§3).
- [ ] A user with a plan sees `entitlement` on their refreshed token; a competition-create
      path that gates on it succeeds.
- [ ] Appointing someone in `organizations/{orgId}/staff/{uid}` results in `orgRoles[orgId]`
      on their token after refresh (`syncOrgRoleClaim` → `syncUserClaims`).
- [ ] `POST https://matchpulse.co.za/payfast/itn` reaches the function (not a 404 / hosting
      fallthrough).
- [ ] No duplicate `syncUserClaims` / `payfastITN` — exactly one of each, codebase `main`.

---

## 7. Console / platform-owner tasks (not CLI, do around this deploy)

These are the human-only items; the deploy above doesn't cover them.

1. **"One account per email address" ON** — Auth → Settings → User account linking → *Link
   accounts that use the same email*. Without it, same email + different provider = different
   UID, breaking the one-account guarantee (brief §2g). **Do this before advertising Google
   sign-in.**
2. **Authorized domains** — add `matchpulse.co.za` and each custom sport subdomain as DNS
   lands (brief §2c), or Google sign-in fails per-origin.
3. **PayFast passphrase** — set `_meta/payfastConfig.passphrase` in `(default)` if you use one;
   otherwise the webhook falls back to PayFast's server confirmation (works, slower).
4. **GitHub secrets** — `FIREBASE_SERVICE_ACCOUNT` + the six `VITE_FIREBASE_*` so CI can build
   and deploy hosting (build fails without `VITE_FIREBASE_API_KEY`, by design).
5. **Default branch** — set the repo default to `main` if not already.
6. **Manual/EFT activation** (brief §4d): the main site does **not** own it yet — only the
   automated `payfastITN` writes entitlement centrally. Decide: build a central admin-gated
   activation path, or declare the platform PayFast-only. Until then, hockey **keeps** its
   `BillingSettings` entitlement-writing code (do not tell it to delete).

---

## 8. Rollback

- If the main-site `syncUserClaims` misbehaves after §2, redeploy the previous copy from the
  hockey repo under its old codebase to restore firing, then investigate. Claims are derived
  (from `users/{uid}`), so re-running the correct function reconverges the token source; no
  data migration is involved.
- `backfillUserClaims` is idempotent — re-run rather than roll back.
- Hosting and rules deploy independently; a bad hosting deploy is reverted with the previous
  build, a bad ruleset with `firebase deploy --only firestore:rules` from a known-good commit.
