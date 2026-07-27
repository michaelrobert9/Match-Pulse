# MatchPulse Platform Architecture

**Owner: the main site (`Match-Pulse`, Firebase project `match-pulse-4560e`).**
This document is the contract the four sport repos build against. If a sport repo needs
to know how auth, accounts, orgs or plans work, the answer is here — not in that repo.

Status: **auth handoff and central schema are decided** (below). The `organizations`
migration is **planned but not executed** — see §5.

---

## 0. The split, in one line

> **Identity, org, plan and billing are central. Everything sport-specific belongs to the sport.**

| Concern | Owner | Database |
|---|---|---|
| Auth / sign-in / password / email | Main site | Firebase Auth |
| `users`, `userProfiles`, `people` | Main site | `(default)` |
| `organizations` + entitlement | Main site | `(default)` *(after §5 migration)* |
| Plan purchase, PayFast, ITN | Main site | `(default)` |
| Competitions, fixtures, teams, matches | Each sport | `hockey`, `netball`, … |
| Sport profile (position, squad, stats) | Each sport | `hockey`, `netball`, … |

Sport apps **read** central data and **never write** billing/plan fields. This is enforced
by Firestore rules, not convention.

---

## 1. Regions — get these right

| Resource | Region |
|---|---|
| Firestore | `africa-south1` |
| Cloud Functions | **`europe-west1`** |

Functions are `europe-west1`, *not* `africa-south1`. Every callable must be created and
consumed with that region or the call fails at runtime:

```js
const functions = getFunctions(app, 'europe-west1')
```

---

## 2. Auth handoff — DECIDED: one-time ticket → custom token

### The problem

Firebase Auth persists its session in IndexedDB **scoped to the origin**.
`matchpulse.co.za` and `hockey.matchpulse.co.za` are different origins, so signing in on
one does **not** sign you in on the other — same Firebase project or not.

### Why not a shared cookie

The Firebase **client** SDK does not read cookies for auth state; session cookies are a
server-rendered pattern. These are static SPAs talking to Firestore directly from the
browser, so getting `request.auth` populated for Firestore rules requires
`signInWithCustomToken` regardless. A cookie is strictly more infrastructure for the same
endpoint, and the older iframe/`authDomain` session-sharing trick is degraded by
third-party-cookie deprecation. Rejected.

### The mechanism

The URL carries a **60-second, single-use ticket** — never a credential.

```
Main site                                    Sport subdomain
─────────                                    ───────────────
user clicks "Hockey"
  │
  ├─ createHandoffTicket({ sport })          [callable, AUTH REQUIRED]
  │    stores sha256(ticket) in
  │    (default) /authHandoffs/{id}
  │    { uid, sport, expiresAt:+60s, usedAt:null }
  │    returns { url }
  │
  └─ redirect ──────────────────────────────▶ /auth/handoff#t=<ticket>
                                                │
                                                ├─ redeemHandoffTicket({ ticket })
                                                │    [callable, NO AUTH]
                                                │    verifies hash, unused, unexpired
                                                │    marks usedAt (atomic)
                                                │    returns createCustomToken(uid)
                                                │
                                                ├─ signInWithCustomToken(token)
                                                ├─ history.replaceState — strip fragment
                                                └─ navigate to intended path
```

**Non-negotiables:**

- The ticket goes in the **URL fragment** (`#t=`), never a query param — fragments are not
  sent to servers and do not appear in `Referer` headers or access logs.
- TTL 60s, single-use, stored **hashed**. A leaked URL is dead in a minute and dead after
  first use.
- `authHandoffs` is **Admin-SDK-only** — no client read or write path at all.

### Reverse direction (signed out, landing on a sport directly)

```
hockey.matchpulse.co.za/foo  (signed out)
  → https://matchpulse.co.za/login?return=https://hockey.matchpulse.co.za/foo
  → after sign-in, main site mints a ticket and redirects back
```

**`return` MUST be validated against a hard-coded allowlist of sport hosts.** An
unvalidated `return` is an open redirect. The allowlist lives on the main site only.

### Known limitations (accept and document, don't paper over)

- **Sign-out is per-origin.** Signing out of hockey does not sign out the main site. For a
  true global sign-out, call `revokeRefreshTokens(uid)` server-side and have each app
  handle the resulting token error.
- **Claims lag by up to an hour.** See §4.

---

## 3. Central schema — `(default)` database

Already exists and is correct (do not redesign):

```
users/{uid}
  email, displayName, photoURL
  platformAdmin        : bool              ← Admin-SDK / platform admin only
  entitlement          : 'none'|'event'|'pro'   ← Admin-SDK only (PayFast ITN)
  eventCredits         : number                 ← may only DECREASE from client
  entitlementExpiresAt : Timestamp              ← Admin-SDK only
  orgRoles             : { [orgId]: grant }     ← non-authoritative cache
  competitionRoles     : { … }                  ← non-authoritative cache

userProfiles/{uid}      public-safe subset (displayName, photoURL, email)
people/{personId}       player identity, cross-sport, consent-gated
```

Added by the main site:

```
organizations/{orgId}                    ← migrating from `hockey` DB, see §5
  name, slug, logoUrl, primaryColor, type
  sports               : ['hockey','netball']   ← which codes this org runs
  entitlement, eventCredits, entitlementExpiresAt   ← Admin-SDK only
organizations/{orgId}/staff/{uid}        ← membership, the authority source

authHandoffs/{id}                        ← Admin-SDK only, no client access
```

### What each sport repo owns

```
<sport> database:
  competitions/, matches/, teams/, fixtures/   (sport content)
  <sport>Profiles/{uid}                        (position, squad no., preferences)
```

Sport profiles are keyed by the **same central UID**. A user playing two sports has two
profile docs and one account. **Never write a sport-specific field into `users/{uid}`** —
see §6, finding 2, for why this is already causing a collision.

---

## 4. Entitlement — custom claims, not cross-DB reads

Firestore rules **cannot read across databases**. The solution is already built and
shipped in `functions/index.js`: `syncUserClaims` mirrors `platformAdmin`, `entitlement`,
`entitlementExpiresAt` and `eventCredits` onto the user's Auth **custom claims** on every
`users/{uid}` write.

Claims travel with the user, not the origin. So any sport app can gate on:

```js
// rules, in ANY database
allow create: if request.auth.token.get('entitlement', 'none') == 'pro';
```

**Sport repos: use the claim. Do not read `users/{uid}` for entitlement, and never write
an entitlement field.**

**The one gotcha:** claims are baked into the ID token at mint time and refresh roughly
hourly. After a purchase, force a refresh:

```js
await auth.currentUser.getIdToken(true)
```

The main site's `Portal` already polls for this settling window after a PayFast return.

---

## 5. `organizations` migration — PLANNED, NOT RUN

### Current state — the target is not empty

`(default)` **was** the hockey database. When hockey moved to its own named database, the
old collections were left behind and merely walled off: the rules file dropped their match
blocks and `firestore.default.indexes.json` was emptied to `{"indexes": []}`. **Dropping
rules does not delete data** — Firestore requires an explicit recursive delete.

So the picture is:

| | `(default)` | `hockey` |
|---|---|---|
| `organizations` | **stale ghost copy**, same doc IDs, frozen at the split date, unreachable by clients (default-deny) | **authoritative**, taking live writes |
| org billing (`entitlement`, `eventCredits`) | stale | **live** — `consumeEventCredit` / `fetchOrgEntitlement` both target hockey |
| `competitions`, `matches`, `teams`, `players` | orphaned leftovers | authoritative |

Two consequences that dictate the plan:

- **`hockey` is authoritative for orgs, including billing.** The refresh must overwrite the
  stale target wholesale — the opposite of the usual "never clobber billing" instinct,
  which only becomes correct *after* cutover.
- **Never dual-read preferring `(default)` before the refresh.** It would silently serve
  months-old org and entitlement data. Reads must prefer `hockey` until cutover.

Run `scripts/audit-default-db.mjs` first — it is read-only and reports exactly what
orphaned data is present and how stale.

### Sequence

The platform has **no active users and no accounts created since the split**, so the
phased dual-write dance is unnecessary. Straight cutover:

1. `node scripts/audit-default-db.mjs` — see what is actually there.
2. `node scripts/migrate-orgs-to-default.mjs --commit` — refresh `(default)` from
   `hockey`, IDs preserved, billing included.
3. Deploy the `organizations` rules (already in `firestore.rules`).
4. Hockey switches org reads **and** writes to `(default)` — one change, no dual-write.
5. Delete `hockey/organizations` and the orphaned pre-split collections in `(default)`.

Step 4 is a **hockey-repo change** and belongs to the hockey chat. Export a backup before
step 5 out of ordinary caution, not because anything irreplaceable is at stake.

### Constraint

This session has no Firebase credentials and no Firebase CLI, so **I cannot execute any of
this.** Both scripts have to be run by someone who can authenticate against
`match-pulse-4560e`. Both default to read-only / dry-run.

---

## 6. Open issues found in the hockey audit

Raised for the hockey chat — **not** to be fixed from this repo.

1. **`organizations` in the wrong database.** §5. Blocker.
2. **Hockey positions written to the central identity doc.** `Profile.jsx` writes
   `position` (`goalkeeper|defence|midfield|forward`) into `identityDb users/{uid}`.
   Netball's `GS/GA/WA/C/WD/GD/GK` would overwrite the same field. Must move to
   `hockeyProfiles/{uid}` before a second sport ships.
3. **PayFast config in the hockey DB.** `_meta/payfastConfig` is read via `dbHockey`, and
   the admin billing UI (`BillingSettings.jsx`) uses the hockey handle. Billing is
   main-site-owned; this must move to `(default)`.
4. **`orgRoles` is writable by any signed-in user** (rules permit a cache-only write to
   *any* user's `orgRoles`). Documented as non-authoritative, and per-sport rules check
   staff subcollections — but `canScore` derives from it, so it is a UI-level escalation.
   Hardening item.
5. **`firestore.default.rules` lives in and deploys from the hockey repo**, while the main
   site owns that schema. Two repos must never deploy rules to the same database — pick
   one owner. Recommendation: move the file here, remove it from hockey's CI.

---

## 7. Brand tokens — canonical

The main site owns these. Three different greens were in circulation; **emerald-600 is
canonical**:

```
--pulse       #059669   emerald-600  — brand / primary action
--pulse-ink   #047857   emerald-700  — text on emerald tint
--live        #E5484D                — LIVE ONLY, never decorative
--ink         #0B1220                — primary text, dark panels
```

Superseded: `#1FB573`, `#0E7A4D`, `#16A672`, `#089769`.
Type: Space Grotesk (display) · Inter (body) · Roboto (tabular figures).
