# MatchPulse Platform Architecture

**Owner: the main site (`Match-Pulse`, Firebase project `match-pulse-4560e`).**
This document is the contract the four sport repos build against. If a sport repo needs
to know how auth, accounts, orgs or plans work, the answer is here — not in that repo.

Status: **built and deployable.** Direct per-origin sign-in (the ticket handoff is removed —
§2), account, PayFast billing, and `syncUserClaims` all live here. The platform has no active
users, so nothing below is constrained by legacy data.

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

| Resource | Region | Source |
|---|---|---|
| Firestore | `africa-south1` | project setting |
| Cloud Functions | `europe-west1` | hockey's `src/firebase.js`, all 3 hosting rewrites, 13 function definitions |

**These are separate settings.** Firestore's `africa-south1` does not constrain Functions,
and conflating the two is the easy mistake here — `africa-south1` is what the console shows
most prominently, so it reads like *the* project region.

⚠️ The `europe-west1` value is read from the hockey repo's code, which is what deploys, but
it has **not** been verified against the live deployment from this session (no Firebase CLI
or credentials). Confirm before relying on it:

```bash
firebase functions:list --project match-pulse-4560e
```

A mismatch fails at **call** time with an opaque error — never at build or deploy time — so
it presents as a broken feature rather than a config error. It is therefore held in a single
overridable constant in both places, not scattered:

```js
// src/firebase.js       → VITE_FUNCTIONS_REGION
// functions/index.js    → FUNCTIONS_REGION
```

If the live region turns out to differ, changing those two env vars fixes the whole main
site; each sport repo has one equivalent constant.

---

## 2. Auth — direct sign-in per origin (the ticket handoff is DEAD)

### What was tried and why it's gone

The first design had the main site mint a single-use ticket and redirect the user into a
sport, which exchanged it for a custom token. It is **removed**. An installed iOS
home-screen web app has its own storage container, separate from Safari, and iOS will not
route a redirect from an external origin back into the installed app: the main site's login
opens in Safari, and the session it creates is invisible to the app that sent the user out.
No client-side fix exists — it's an iOS platform limitation. Any flow that requires *leaving
a subdomain to sign in and coming back* is unreliable on iOS, so the whole shape is retired.

### The model

> **Every origin — the main site and each sport — runs its own Firebase Auth sign-in
> directly, against the shared Auth project. No redirect to log in, no ticket.**

The handoff existed to work around per-origin session state. Direct sign-in never had that
problem: each origin gets its own valid session for the same underlying account the moment
it signs in against the shared project. Firebase Auth already does this — it's not new work.

- **One account, one UID, every method.** Email+password and Google must both resolve the
  same identity to the same UID on every subdomain. The provider is only how someone proves
  who they are on a visit; it never determines which account they land in. Sign-up must treat
  "account already exists" (`auth/email-already-in-use`, or the Google equivalent) as "switch
  to sign-in," never as an error that mints a second account.
- **What the main site still solely owns:** identity fields, password, email change, plan,
  billing. Sports link to `matchpulse.co.za/account` for those — a real "manage account"
  link now, not a sign-in redirect.
- **What moved:** only *where the login form lives* — now per origin. Data ownership is
  unchanged.

### Auth persistence — a real bug, fix it everywhere

`getAuth()` can silently settle on **in-memory** persistence (e.g. IndexedDB blocked in some
private-mode or installed-PWA contexts), which drops the session on the next navigation and
reads exactly like "signed in, then signed out." The main site uses `initializeAuth` with an
explicit ordered fallback — IndexedDB → localStorage → sessionStorage → memory — and passes
the popup resolver explicitly (initializeAuth doesn't install one). Every sport repo should
copy that shape; see `src/firebase.js`.

### Google sign-in — authorize every origin (platform config)

Direct per-origin sign-in has a requirement the handoff hid: an origin can only run Google
sign-in if it is in the project's **Authorized domains** (Console → Authentication →
Settings). `.web.app` / `.firebaseapp.com` hosts are authorized automatically; **custom
subdomains are not** — each of `matchpulse.co.za`, `hockey.matchpulse.co.za`, … must be added
by hand when DNS is wired. Every app keeps `authDomain` at the shared default
(`match-pulse-4560e.firebaseapp.com`); the OAuth handshake is hosted there for all origins.
This is one project-wide console list, owned by the platform, not per-repo code. (Raised by
netball.)

### Known limitation

- **Sign-out is per-origin.** Signing out of one origin does not sign out the others. For a
  true global sign-out, call `revokeRefreshTokens(uid)` server-side and have each app handle
  the resulting token error.

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

## 4. Entitlement AND org roles — custom claims, not cross-DB reads

Firestore rules **cannot read across databases**. A sport's rules run against that sport's
database and cannot resolve a read into `(default)`. So everything a sport's rules need to
know about a user's central state is mirrored onto the Auth **custom claims**, which travel
with the user to every origin. This is done by `syncUserClaims` in `functions/index.js` on
every `users/{uid}` write.

> **Correction to the earlier brief:** this function was described as "already in the hockey
> repo." Per netball's audit it was not effectively present, and without it every
> claims-based rule fails **closed** — no one, paying customers included, can create a
> competition. It is now **built on the main site**, next to the billing writes it mirrors,
> with a one-time `backfillUserClaims`. Exactly one deployment may declare it (function names
> are unique per project); if hockey still declares it, hockey drops its copy in the same
> deploy.

The claim carries two things:

```js
// rules, in ANY database
request.auth.token.entitlement            // 'none' | 'event' | 'pro'
request.auth.token.platformAdmin          // bool
request.auth.token.orgRoles               // { [orgId]: 'owner' | 'staff' | … }
```

### Org roles ride on the claim too — the §4b decision

Org membership (`organizations/{orgId}/staff/{uid}`) lives in `(default)`, so a sport's rules
can't read it directly. **Decision: mirror org roles onto the token, not into each sport's
database.** `syncUserClaims` derives a compact `orgRoles` claim from the user's central
`orgRoles`, and sport rules read it with no cross-DB read and no per-sport `staff` mirror to
keep in sync:

```js
allow write: if request.auth.token.orgRoles[orgId] in ['owner', 'staff'];
```

**Kept in step by `syncOrgRoleClaim`** (main site, added after rugby flagged that the claim
was only as good as its source). Staff membership is the authority; a write to
`organizations/{orgId}/staff/{uid}` fans into `users/{uid}.orgRoles`, which `syncUserClaims`
then carries onto the token. So the chain is `staff → users.orgRoles → claim`, staff stays
the single source of truth, and `syncOrgRoleClaim` is now the **only** writer of
`users.orgRoles` — the old client cache-write rule is removed.

**Sequencing for the sport repos (this is the trap rugby caught):** moving `organizations`
to `(default)` and switching org-auth to the claim are ONE change, not two. A sport that
moves the org doc while its rules still `get(.../staff/...)` from its own DB denies every
organiser action. Switch the rules to read `request.auth.token.orgRoles[orgId]` FIRST (works
regardless of where the org doc lives), then the org record can live centrally.

Chosen over mirroring `staff` into every sport DB because it reuses the claims machinery
entitlement already requires, keeps one authority source, and adds no fan-out. Tradeoffs,
stated plainly:
- **~1h lag** (or until `getIdToken(true)`) — a just-appointed org admin waits for the token
  to refresh. Fine for role changes; force a refresh if it must be instant.
- **1000-byte claim cap.** A user in an unusual number of orgs overflows; `syncUserClaims`
  then drops the map and sets `orgRolesOverflow: true` rather than failing, and those rules
  fail closed for that rare user (safe). If a sport expects users in dozens of orgs, that's
  the signal to revisit.

**Sport repos: use the claims. Never read `users/{uid}` for entitlement, and never write an
entitlement field.**

**The gotcha:** claims are baked into the ID token at mint time and refresh roughly hourly.
After a purchase or a role change, force a refresh:

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

`syncUserClaims` (now in **this** repo — §4) mirrors entitlement onto Auth custom claims.
The ITN updates the user document; that trigger carries it to the token the sport subdomains
gate on. So the ITN and the trigger are co-located here, and neither works without the other.
Cloud Function names are unique per project — if hockey still declares `syncUserClaims`, it
drops its copy in the same deploy that ships this one.

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
   `matchpulse.co.za/#plans` instead. **`syncUserClaims` now lives here — hockey drops its
   copy in the same deploy that ships the main site's (§4).**
4. **`orgRoles` client cache-write — RESOLVED.** `syncOrgRoleClaim` (§4) is now the sole
   writer of `users.orgRoles`, derived from the authoritative staff subcollection, and the
   client cache-write rule is removed. This also closes the old escalation (any signed-in
   user could rewrite anyone's `orgRoles`).
5. **`firestore.default.rules` deploys from the hockey repo**, while the main site owns
   that schema. Two repos must never deploy one ruleset. This repo's `firestore.rules` is
   a strict superset — remove the Firestore step from hockey's CI, then enable it here.
6. **Function names & codebases must be unique per sport (raised by rugby).** All five apps
   share one project, and function names are globally unique within it. A hockey clone that
   deploys `recomputeCompetitionStatsOnFinal`, `dailyFixtureSweep`, etc. under the same names
   collides with hockey. Every sport must prefix its functions (`rugbyRecompute…`) and use a
   distinct `codebase` in `firebase.json` (`"codebase": "rugby"`). Launch-blocking for clones.

---

## 7. Decisions from the sport-repo reports (netball, rugby)

- **Account-doc bootstrap (rugby finding C).** Who creates `users/{uid}`? A user's first-ever
  sign-in may be on a *sport*, not the main site, so the create must not depend on the main
  site. **Decision: every app bootstraps a minimal, merge-safe identity shell on first
  sign-in** — identity fields only, never plan/billing (rules reject those on create). This
  is idempotent and race-free; an `onCreate` Auth trigger was rejected because it races a
  client that reads the doc immediately after sign-up. The main site does exactly this in
  `AuthContext`; sports keep theirs.
- **Invite flow (rugby finding E) — OPEN, needs its own decision.** The invite → signup →
  accept journey (`AcceptInvite`, the `invites` collection, `sendInviteEmail`) is unspecified
  under the split. It's really org-role management, so it belongs with whoever owns org/staff
  admin UI — undecided. Flagged, not solved. Do not build per-repo invite-accept logic until
  this is settled.
- **Google authorized domains (netball).** See §2 — platform-owned console config.

---

## 8. Brand tokens — canonical

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
