# MatchPulse Platform Architecture

**Owner: the main site (`Match-Pulse`, Firebase project `match-pulse-4560e`).**
This document is the contract the four sport repos build against. If a sport repo needs
to know how auth, accounts, orgs or plans work, the answer is here — not in that repo.

Status: **built and deployable.** Auth handoff, account, and PayFast billing all live here.
The platform has no active users, so nothing below is constrained by legacy data.

---

## 0. The split, in one line

> **Identity, org, plan and billing are central. Everything sport-specific belongs to the sport.**

| Concern | Owner | Database |
|---|---|---|
| Auth / sign-in / password / email | Main site | Firebase Auth |
| `users`, `userProfiles`, `people` | Main site | `(default)` |
| `organizations` + entitlement | Main site | `(default)` |
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
organizations/{orgId}                    ← MatchPulse-level, not sport-specific
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

## 5. Billing — PayFast, main site only

Purchase happens **here and only here**. No sport repo may implement, duplicate or
re-point any part of it.

### How it works

The checkout is a **PayFast hosted payment page** — a "pay now" link. We do not build or
sign a payment payload; the only server-side code is the webhook that hears the result.

```
Plans CTA (signed in)
  └─ payment.payfast.io/eng/process?cmd=_paynow&…&m_payment_id=<uid>__<plan>__<ts>
       │  buyer pays on PayFast's page
       ├─ return_url  → matchpulse.co.za/portal   (polls until the plan lands)
       ├─ cancel_url  → matchpulse.co.za/plans
       └─ notify_url  → matchpulse.co.za/payfast/itn   ← the only thing that grants a plan
```

**`m_payment_id` is the one thing we add to a plain button.** Hosted links accept extra
query params and PayFast echoes them back on the ITN, which is what lets the webhook
attribute a payment to an account. Without it PayFast has no idea which MatchPulse user
paid, and every purchase needs activating by hand. This is why a signed-out visitor
clicking a paid plan is sent to sign up first.

### The webhook (`payfastITN`)

1. **Idempotency first.** PayFast retries until it gets a 200, so the payment is claimed in
   a transaction against `payments/{pf_payment_id}`. A retry loses and exits — otherwise
   credits stack and subscriptions extend twice.
2. **Authenticity.** Signature check when `_meta/payfastConfig.passphrase` is set; otherwise
   the payload is posted back to PayFast's `/eng/query/validate`. An unverified endpoint
   that grants paid plans is an open door.
3. **Attribute** via `m_payment_id`, falling back to a unique email match. Ambiguous is
   never guessed — it is flagged `needsManualReview` for a human.
4. **Grant.** Pro extends from the later of now and any remaining term, so an early renewal
   adds a year instead of discarding the remainder. Plus increments `eventCredits`.

Every ITN is recorded in `payments/{id}` — admin-read, client-write-never — including ones
that could not be attributed. That collection is the reconciliation record.

### Dependency worth knowing

`syncUserClaims` (deployed from the **hockey** repo) mirrors entitlement onto Auth custom
claims. The ITN updates the user document; that trigger is what carries it to the token the
sport subdomains actually gate on. **Hockey must keep deploying it** until it is moved here
in one coordinated change — Cloud Function names are unique per project, so it cannot be
declared in two codebases at once.

---

## 6. Open issues found in the hockey audit

Raised for the hockey chat — **not** to be fixed from this repo.

1. **`organizations` lives in the `hockey` database.** It is MatchPulse-level and belongs
   in `(default)`. With no users there is nothing to migrate — hockey simply switches its
   org reads and writes to the `(default)` handle.
2. **Hockey positions written to the central identity doc.** `Profile.jsx` writes
   `position` (`goalkeeper|defence|midfield|forward`) into `identityDb users/{uid}`.
   Netball's `GS/GA/WA/C/WD/GD/GK` would overwrite the same field. Must move to
   `hockeyProfiles/{uid}` before a second sport ships.
3. **PayFast is now on the main site (§5).** Hockey should remove its payment buttons,
   `initPayFastPayment` (dead code — `Plans.jsx` never called it), `payfastITN`, the
   `/payfast/itn` rewrite, and the `_meta/payfastConfig` read. Send users to
   `matchpulse.co.za/#plans` instead. **Keep `syncUserClaims`.**
4. **`orgRoles` is writable by any signed-in user** (rules permit a cache-only write to
   *any* user's `orgRoles`). Documented as non-authoritative, and per-sport rules check
   staff subcollections — but `canScore` derives from it, so it is a UI-level escalation.
   Hardening item.
5. **`firestore.default.rules` deploys from the hockey repo**, while the main site owns
   that schema. Two repos must never deploy one ruleset. This repo's `firestore.rules` is
   a strict superset — remove the Firestore step from hockey's CI, then enable it here.

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
