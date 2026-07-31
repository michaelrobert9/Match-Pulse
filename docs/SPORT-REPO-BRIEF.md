# MatchPulse — Brief for the Sport Repos (v3 — supersedes v2)

**From:** the main site (`Match-Pulse`, Firebase project `match-pulse-4560e`)
**To:** Hockey · Netball · Rugby · Water Polo
**Status:** the redirect-based auth handoff (`createHandoffTicket` / `redeemHandoffTicket`)
is **abandoned**. It does not work in an installed iOS home-screen app and cannot be made
to. This document replaces it. Paste this whole document into the chat for each sport repo.

**Main-site side is done:** the handoff functions are removed, and the two blocking items
in §4 are addressed on the main site (`syncUserClaims` and `syncOrgRoleClaim` are built here;
the org-auth decision is made — §4). See §4 for what that means for you, and §7 for where
each repo actually stands from the reports so far.

### What changed from v2 (read this if you already read v2)

v2 folded in Netball's and Rugby's findings. v3 folds in **Hockey's and Water Polo's**
reports, and corrects four things v2 got wrong:

1. **`syncUserClaims` is not "built, deploy pending" from a standing start — it is already
   LIVE in the hockey project right now** (hockey deployed it against v1, and v1 told hockey
   to keep it). So the entitlement claim is *not* currently undefined — hockey's copy is
   firing. The main-site deploy is a **coordinated handoff of a live function**, not a
   fill-the-void deploy. This changes the deploy order — see §4a and the deploy runbook
   (`docs/DEPLOY-RUNBOOK.md`). *(Hockey finding.)*
2. **Rugby and Water Polo are NOT greenfield.** Both are hockey clones and shipped the full
   v1 handoff, so for them this is a **remove-and-rebuild**, not a first build. v2 §5 called
   them greenfield; that was wrong and contradicted v2 §4c, which already flagged rugby as a
   hockey clone. *(Water Polo finding, and it applies to Rugby too.)*
3. **The one-account-per-email guarantee has a console precondition v2 never stated:** the
   Firebase Auth **"one account per email address"** setting must be ON, or a Google sign-up
   and a password sign-up on the same email resolve to **different UIDs** — silently breaking
   the "one person, one account" rule §1 promises. New §2g. *(Hockey finding.)*
4. **v2 §5 told hockey to move `organizations` to `(default)` while v2 §4b said that exact
   move breaks org auth and to switch rules to the claim FIRST.** Direct contradiction. The
   org move is deferred behind the §4b claim-switch for everyone — §5 corrected. *(Hockey
   finding.)*

### v3.1 amendment — after the second round of reports (hockey · water polo · rugby · netball)

Two platform decisions and one runbook fix, forced by the reports:

- **§4b org-auth is now LOCAL-FIRST; the central `orgRoles` claim is shelved.** Hockey,
  Rugby, and Netball all independently reported their org roles are **team-scoped**
  (`{role, teamId}`), and the main-site code confirms it: `normaliseGrant` / `orgRolesClaim`
  in `functions/index.js` collapse a grant to a bare string role and **discard `teamId`**. A
  flat `orgRoles[orgId] in ['owner','staff']` claim silently destroys team scope. So the v2/v3
  "mirror roles onto the token" decision is **reversed for now**: every sport keeps org-auth
  **local** (reads its own `staff` subcollection), **`organizations` does not move to
  `(default)`**, and nobody gates on the `orgRoles` claim. `syncOrgRoleClaim` may stay deployed
  (harmless, keeps the option open) but is not on any sport's auth path. This is the working
  interim state everyone was already in — it is now the standing decision until there is a
  concrete cross-sport-org requirement, at which point the claim must be redesigned to carry
  team scope. See §4b.
- **§4d answered: the main site does NOT yet own manual/EFT activation.** Only automated
  PayFast ITN writes entitlement centrally — there is no admin/manual activation UI or
  function. So any sport (hockey) holding EFT/manual entitlement-write code **keeps holding
  it, does not delete**. Building central manual/EFT activation (or deciding the platform is
  PayFast-only) is a main-site open item. See §4d.
- **Runbook fix:** hockey reports `backfillUserClaims` is **also** live in its codebase. So the
  §4a handoff covers **three** shared names — `syncUserClaims`, `backfillUserClaims`,
  `payfastITN` — not two. Only `syncOrgRoleClaim` is genuinely new. `docs/DEPLOY-RUNBOOK.md`
  is corrected accordingly.
- **§6.4 region CONFIRMED:** hockey's earlier live Cloud Shell deploy printed
  `backfillUserClaims(europe-west1)` and the `europe-west1-…cloudfunctions.net` URL — the live
  deployment reporting its own region. **`europe-west1` is confirmed**, not just source.

---

## 0. Why the previous design is dead

Netball confirmed it on-device: an iOS home-screen web app has its own storage container,
separate from Safari, and iOS will not route a redirect from an external origin back into an
installed app. The main site's login page opens in Safari, not in the installed app, so the
session that gets created is invisible to the app that sent the user there. There is no
client-side fix — this is an iOS platform limitation, not a bug in the ticket mechanism.

That kills the whole shape of the previous design: **any flow that requires leaving a
subdomain to sign in, then coming back, is unreliable on iOS.** So we're not fixing the
redirect — we're removing it.

---

## 1. The new model

> **Every subdomain runs its own sign-in and sign-up UI, directly, on its own origin.
> There is no redirect to the main site to log in, and no ticket.
> The main site remains the sole source of truth for account data — but subdomains
> talk to that account directly, not by bouncing the user through a browser tab.**

Concretely:

- Each sport app calls Firebase Auth (`signInWithEmailAndPassword`,
  `createUserWithEmailAndPassword`, Google sign-in, password reset) **directly, on its own
  origin**, against the same shared Firebase Auth project (`match-pulse-4560e`). This isn't a
  new capability — it's what Firebase Auth already does. The ticket handoff existed to work
  around a problem (per-origin session state) that direct sign-in never had: each origin gets
  its own valid session for the same underlying account the moment it signs in against the
  shared project.
- **The account-linking mechanism is identical regardless of how someone signs in.** Whether
  email+password or Google, the result is one rule: one person, one MatchPulse account, one
  UID, no matter which subdomain or method they used. The provider is just how they prove who
  they are on a given visit — it has no bearing on which account they land in. If someone
  signed up on hockey with Google and later opens rugby and signs in with the same Google
  account, that must resolve to the same UID, exactly as the email+password case does. Don't
  build or reason about these as two flows with two guarantees — there's one guarantee, and
  every sign-in method honours it the same way. **This guarantee depends on a project-level
  Auth setting being ON — see §2g. Without it, same email + different provider = different
  UID.**
- **What still lives centrally, unchanged:** account identity (name, email), password,
  plan/entitlement, billing. The main site is where you change your email, change your
  password, see your plan, and buy or upgrade. A subdomain does not build its own account
  settings, password-change, or billing UI — those still send the user to
  `matchpulse.co.za/account`. What's different is **signing in** — that now happens locally,
  per subdomain, never via redirect.
- **What still lives per-sport, unchanged:** sport-specific profile (position, squad number,
  club, sport stats/preferences), all sport content (competitions, fixtures, matches, teams).

So the only thing that moved is *where the login form lives*. Everything about who owns what
data is unchanged from before.

---

## 2. What each subdomain must build

### 2a. Sign-in — build this locally, don't redirect

A normal Firebase Auth login form (email/password, and Google if you support it) on your own
origin, calling the SDK directly. No ticket, no fragment, no `/auth/handoff` route — delete
that route if you built it.

### 2b. Sign-up — handle "account already exists" the same way for every method

This is the part that needs care, and it applies identically no matter the method:

1. Try to create the account normally, with whichever method they chose.
2. If Firebase Auth reports the account already exists — `auth/email-already-in-use` for
   email+password, or the equivalent account-exists signal for Google
   (`auth/account-exists-with-different-credential`) — **do not treat this as an error.** It
   means they already have a MatchPulse account, from this sport or another. Switch them to
   sign-in, with a message like "You already have an account — sign in instead" and the email
   pre-filled. Don't let a second, separate account get created against the same identity.
3. Whether the account is brand new or already existed, once they're signed in on your
   subdomain, that's the same central account — proceed as normal.

One rule applied consistently, not per-method special cases. If your implementation branches
differently for Google vs. email+password beyond the provider-specific error code, that's a
sign the rule isn't actually unified — flag it. *(Hockey and Water Polo both confirmed a
unified two-method flow; this is the target shape.)*

### 2c. Google sign-in — authorize each origin (platform config, raised by netball)

Direct per-origin sign-in has a requirement the ticket handoff hid: for Google sign-in to
work on an origin, that origin must be in the Firebase project's **Authorized domains**
(Console → Authentication → Settings → Authorized domains).

- `.web.app` and `.firebaseapp.com` hosts are authorized automatically. **Custom subdomains
  are not** — `hockey.matchpulse.co.za` and friends must each be added by hand, once, when
  DNS is wired. `matchpulse.co.za` itself too.
- Keep `authDomain` at the shared project default (`match-pulse-4560e.firebaseapp.com`) in
  every app's config. Do **not** set it per-subdomain — the OAuth handshake is hosted there
  for every origin.
- This is one project-wide console list, so it's a platform-owner task, not per-repo code.
  But if Google sign-in misbehaves on a subdomain while email+password works, an unauthorized
  domain is the first thing to check.

### 2d. Account-doc bootstrap — DECIDED (rugby finding C)

With local sign-up, something has to create the central `users/{uid}` doc. A user's
first-ever sign-in may be on *your* sport, not the main site, so this can't depend on the
main site. **Decision: every app bootstraps a minimal, merge-safe identity shell on first
sign-in** — identity fields only, never plan/billing (rules reject those on create). It's
idempotent and race-free. Keep yours; don't wait for a main-site `onCreate` trigger (there
isn't one — it would race a client reading the doc right after sign-up).

### 2e. Invites — OPEN, don't build it yet (rugby finding E)

The invite → signup → accept journey (`AcceptInvite`, the `invites` collection,
`sendInviteEmail`) is unspecified under the split. It's really org-role management, so it
waits on who owns org/staff admin. **Flag any invite code you have; don't wire an
invite-accept path until this is decided.**

### 2f. Still true, unchanged

- No account settings, password/email change, or billing UI in any sport repo — link out to
  `matchpulse.co.za/account`. It's now a genuine "manage your account" link, not a sign-in
  redirect.
- No writes to `entitlement`, `eventCredits`, `entitlementExpiresAt` — read-only, via custom
  claims (§4).
- Sport-specific profile (`<sport>Profiles/{uid}`) stays local to your database, keyed by
  the shared UID.
- `organizations/{orgId}` is destined to live centrally in `(default)`, **but do not move it
  yet** — that move is gated on the §4b claim-switch. Today it stays where it is (local to
  your DB). See §4b for the sequencing.

### 2g. One-account-per-email — platform Auth setting (hockey finding) — REQUIRED

The "one person, one UID" guarantee in §1 is not automatic. Firebase Auth has a project-level
setting, **"one account per email address"** (Console → Authentication → Settings → User
account linking). It must be set to **"Link accounts that use the same email"** (i.e. one
account per email), **not** "Create multiple accounts."

- If it's on the wrong setting, a user who signed up with a password on hockey and later uses
  **Google** with the same email gets a **second, different UID** — two accounts, split
  entitlement, split everything. This defeats the entire model and it fails silently (both
  sign-ins "succeed").
- This is a single console toggle, platform-owner task — not per-repo code. But it is a
  precondition for the §3.1 cross-subdomain check to ever pass for mixed methods. Verify it is
  set before treating any account-linking test as meaningful.

---

## 3. Verify these before you ship — don't assume

1. **Confirm cross-subdomain login resolves to one account, for every sign-in method.** Sign
   up on one sport's dev environment, then sign in on another's with the same identity — same
   email+password, and separately the same Google account — and confirm both land on the same
   UID (`auth.currentUser.uid`, not just that login succeeded). Test every method the same
   way. If any repo still has leftover ticket-handoff code that scopes auth state oddly, this
   is where it shows up.
   - **Reality check from the reports:** hockey and water polo could each only test *within
     their own single origin* — no second live sport deployment exists in their workspace, so
     neither could truly verify cross-subdomain linking. They said so plainly rather than
     claiming "should work." **This still needs a real two-origin, two-method on-device check
     by someone who has two deployments up** — and §2g must be ON first or the mixed-method
     case is guaranteed to fail.
2. **Auth persistence.** Netball found the SDK can silently default to in-memory persistence,
   which drops the session on next navigation and looks identical to "signed in, then signed
   out." The fix — an explicit persistence fallback chain (IndexedDB → localStorage →
   sessionStorage → memory), and not letting an IndexedDB refusal take down app init — is
   worth copying into all four repos regardless of the auth redesign. **The main site already
   applies it** (`src/firebase.js`, `initializeAuth` with an ordered `persistence` list); copy
   that shape. *(Hockey has already copied it and browser-verified boot; water polo retained
   it.)*

---

## 4. The blocking findings — main-site status

Raised by netball and rugby. Here's where each stands now, corrected for what hockey and
water polo reported.

### 4a. `syncUserClaims` — LIVE IN HOCKEY, main-site copy built, HANDOFF pending

Custom claims (`entitlement`, `platformAdmin`, `orgRoles`) are the only way sport-side
Firestore rules can gate on central state without a cross-database read. If the function that
writes them ever stops firing, `request.auth.token.entitlement` goes undefined and
claims-based rules fail **closed** — no one creates a competition, paying customers included.

**Correction to v2: the claim is not undefined today.** `syncUserClaims` was deployed against
v1 and **is live and firing in the shared project right now** — hockey owns the currently
deployed copy. v1 told hockey to keep it precisely because Cloud Function names are globally
unique per project, so the main site could not declare its own while hockey's existed.

**The main site now also has a copy** (`functions/index.js`), alongside the billing writes it
mirrors, `syncOrgRoleClaim`, and a one-time `backfillUserClaims` to stamp existing users.
So this is **not a fill-the-void deploy — it is a handoff of a live function** from hockey's
codebase to the main site's. That handoff has two failure modes to avoid:

- **A gap** — if the live function is deleted before the replacement is serving, every
  claims-gated rule across all four sports fails closed until it's back.
- **An accidental prune** — a `firebase deploy --only functions` prunes any function *absent
  from the codebase being deployed*. If hockey drops `syncUserClaims` and redeploys its
  codebase while it still "owns" that function name, the deploy deletes the live one.

**The safe order is in `docs/DEPLOY-RUNBOOK.md` — follow it rather than improvising.** In
short: the main site takes over the `syncUserClaims` name first (same-name overwrite, no gap),
*then* hockey moves its remaining functions to a hockey-specific `codebase` and drops its
`syncUserClaims` declaration, so hockey's later deploys can't prune the main-site-owned one.

- **Do NOT declare `syncUserClaims` in your repo** (any sport other than hockey — and hockey
  only until the handoff completes). There is exactly one, and after the handoff it's the main
  site's.
- Once the main-site copy owns it, gate your rules on the claim:
  ```js
  function entitlement()   { return request.auth.token.get('entitlement', 'none'); }      // 'none'|'event'|'pro'
  function isPlatformAdmin(){ return request.auth != null && request.auth.token.get('platformAdmin', false) == true; }
  ```
- Client-side, after a plan change, force a token refresh or the claim lags ~1h:
  ```js
  await auth.currentUser.getIdToken(true)
  ```

### 4b. Org-scoped authorization across the database split — REVERSED to LOCAL-FIRST (v3.1)

> **Standing decision (v3.1): keep org-auth LOCAL. Do not move `organizations` to `(default)`.
> Do not gate on the `orgRoles` claim.** Read your own `staff` subcollection, in your own DB,
> exactly as you do today. The central-claim design below is **shelved** — kept on record
> because it may return in a team-scope-aware form, but it is **not** the current contract.

**Why it was reversed.** Hockey (~25 rule sites), Rugby (`capabilities.js`,
`functions/index.js:474`), and Netball all reported the same thing: their org roles are
**team-scoped** — `orgRoles[orgId]` is `{ role, teamId }`, distinguishing org-wide grants from
team-scoped ones (e.g. a Team Scorer). The main-site claim writer can't represent that: in
`functions/index.js`, `normaliseGrant` reduces a grant to a bare string role and **throws
`teamId` away**, and `orgRolesClaim` emits a flat `{ orgId: role }` map. Gating on that claim
would **silently collapse team scope** and change every team-scoped sport's semantics. Rugby
also noted a main-site `syncOrgRoleClaim` reading `(default)` staff would never even see roles
that are scoped to a sport's own teams. Three independent repos plus the code agree — so the
claim, as built, is the wrong mechanism for team-scoped sports.

**What this means for you:** nothing changes from where you already are. Orgs stay local, staff
reads stay local, no rule rewrite. Netball is the one exception — a prior session moved its
orgs central per v2, so netball **reverts** orgs to local to rejoin this state (§5).

The shelved design, for the record — **mirror org roles onto the Auth token.** Two main-site
functions were built for it (they still exist; `syncOrgRoleClaim` is inert unless a sport opts
in, which none should right now):

- `syncOrgRoleClaim` — a write to `organizations/{orgId}/staff/{uid}` fans into
  `users/{uid}.orgRoles`. Staff stays the single authority; this is now the ONLY writer of
  `orgRoles` (the client cache-write rule is removed).
- `syncUserClaims` — carries `users.orgRoles` onto the token as the `orgRoles` claim.

Your rules read the claim, with no cross-database read and no `staff` mirror to maintain:

```js
allow write: if request.auth.token.orgRoles[orgId] in ['owner', 'staff'];
```

If the claim mechanism is ever revived, it must (a) carry team scope in the claim value, not a
bare string, and (b) account for team-scoped roles being sport-specific, which a main-site
function reading `(default)` staff cannot see. Until someone designs that, this stays shelved.

**The endorsed state (what hockey and water polo already did, correctly):** orgs local, staff
reads local, org-scoped checks resolving against your own `staff` subcollection. Hockey's ~25
rule sites and water polo's local `staff` reads are exactly right. **Do not move
`organizations`. Do not gate on the `orgRoles` claim.** This is settled, not interim-pending.

### 4c. Function names & codebases must be unique per sport (raised by rugby) — LAUNCH-BLOCKING

All five apps share one Firebase project, and **function names are globally unique within
it.** A hockey clone that deploys `recomputeCompetitionStatsOnFinal`, `dailyFixtureSweep`,
`sitemap`, `renderer`, … under the same names **overwrites or collides with hockey's**. Every
sport must:

- prefix its own functions — `rugbyRecompute…`, `netballSitemap`, …
- use a distinct `codebase` in `firebase.json`: `"codebase": "rugby"` (etc.)

This applies to every function a sport deploys, not just anything auth-related. **Rugby and
Water Polo are both hockey clones** (see §7) and carry the full set of hockey's function
names — they are the **highest-risk repos** for this and must fix it before their first
deploy. The distinct `codebase` id is also what makes the §4a handoff safe: once hockey's
functions live under `codebase: "hockey"`, a hockey deploy can't prune the main-site-owned
`syncUserClaims`.

### 4d. EFT / manual activation — ANSWERED: main site does NOT own it yet (v3.1)

Hockey still carries entitlement-writing code in `BillingSettings` (the manual/EFT activation
path) and asked: **does the main site handle EFT activation yet?**

**Answer: no.** The main site's only central entitlement writer is `payfastITN` — the automated
PayFast webhook (`functions/index.js`). There is **no** admin/manual/EFT activation UI or
function on the main site; the main-site client only *reads* entitlement. So there is nothing
central to hand manual activation off to yet.

- **Hockey (and any clone with manual-activation code): keep holding it. Do NOT delete.**
  Deleting now removes the platform's only path to activate an EFT/bank-transfer customer.
- **Main-site open item:** either build central manual/EFT activation (an admin-gated
  entitlement write, mirrored by `syncUserClaims` like PayFast is), or decide the platform is
  **PayFast-only** and EFT is not offered — in which case hockey's EFT path is retired as a
  discontinued feature, not migrated. This is a product decision for the platform owner.
- The rule that sports never write `entitlement` (§2f) still holds for *new* code; the hockey
  hold is a temporary exception until the main site closes this gap.

---

## 5. Per-repo tasks

### 🏑 Hockey

1. Replace local login with direct Firebase Auth sign-in (§2) — largely what hockey had
   before the handoff detour. **Reported done:** handoff route/`AuthHandoff.jsx`/`goSignIn`
   redirect/renderer entry ripped out; local Login (email/password + Google) and Signup were
   already present, so this was undoing the detour.
2. Sign-up "already exists" handling (§2b) — **reported done** for both methods (email → "sign
   in instead", prefilled; Google → sign-in tab + password prompt).
3. Auth-persistence fallback chain (§3.2) — **reported done** (netball's chain copied,
   browser-verified boot).
4. **`syncUserClaims` handoff (§4a).** Hockey currently owns the LIVE copy. Do **not** just
   drop it and redeploy — that prunes the live function. Follow `docs/DEPLOY-RUNBOOK.md`: the
   main site takes over the name first, then hockey moves its own functions to
   `codebase: "hockey"` and removes its `syncUserClaims` declaration.
5. Still outstanding, unrelated to auth: move `position` out of the shared `users/{uid}` doc
   into `hockeyProfiles/{uid}`; stop deploying `firestore.default.rules` (the main site owns
   that ruleset and has a strict superset); remove PayFast entirely (main site's is live) —
   payment buttons, `initPayFastPayment`, `payfastITN`, the `/payfast/itn` rewrite,
   `_meta/payfastConfig`.
6. **Do NOT move `organizations` to `(default)` yet** (corrects v2, which told you to). ~25 of
   your rule sites gate on `organizations/{id}/staff`; the move denies every org write until
   your rules read `request.auth.token.orgRoles[orgId]` (§4b). Switch the rules first, then
   move.
7. **Landing the above needs a functions deploy** — CI does hosting + rules only, so the
   renderer removal and the final `payfastITN` removal don't land until functions are deployed
   (part of the runbook).

### 🥅 Netball

You found the problem and shipped the mitigation — thank you.
1. Replace the "detect installed-iOS, stop redirecting, offer Copy Link" mitigation with the
   real fix: local sign-in (§2). The mitigation was correct triage; unneeded once there's no
   redirect to break.
2. Keep your auth-persistence fix (§3.2) — it's independent of this change.
3. Confirm your functions carry a `netball` prefix and `codebase` (§4c) before deploying
   alongside the others.

### 🏉 Rugby · 🤽 Water Polo — hockey clones, remove-and-rebuild (corrects v2)

**These are NOT greenfield.** Both are hockey clones and shipped the full v1 handoff. Water
Polo reported it directly (remove-and-rebuild, not greenfield); rugby is the same if it
followed v1. So:

1. **Remove the v1 handoff** — `/auth/handoff` route, `AuthHandoff.jsx`, `goSignIn` / main-site
   redirect links, ticket redeem code, renderer entry — then build sign-in and sign-up
   locally (§2), including "already exists" (§2b). Water Polo reported this done and grep-clean;
   rugby should confirm the same and flag any leftover.
2. **§4c is acute for you.** As hockey clones you carry hockey's full function name set —
   prefix every function and set a distinct `codebase` (`"rugby"` / `"waterpolo"`) *before*
   your first deploy, or you overwrite hockey's live functions.
3. Copy netball's auth-persistence chain (§3.2) if not already present. *(Water Polo retained
   it; rugby to confirm.)*
4. **Do NOT move `organizations` to `(default)` yet** (§4b) — leave orgs local until your rules
   read the `orgRoles` claim. Water Polo confirmed orgs left local; rugby to do the same.
5. Confirm cross-subdomain account linking (§3.1) before considering it done — for every
   sign-in method, not just one, and only once §2g is confirmed ON. Both reported they could
   not truly test this from a single origin; say what you actually tested.

---

## 6. Report back

1. Confirmation that signing up with an identity that already has an account on another
   subdomain resolves to the same account (§3.1) — tested for every sign-in method you
   support, stating what you actually tested rather than "should work." If you only have one
   origin to test from, say so (as hockey and water polo did) rather than claiming it works.
2. What your sign-up flow does today on "account already exists", per method.
3. Any leftover ticket-handoff code (`/auth/handoff`, `createHandoffTicket` /
   `redeemHandoffTicket` calls, handoff redirects, renderer handoff entry) — flag it for
   removal even if this document doesn't name your specific leftover.
4. Your observed **Functions region** — **CONFIRMED `europe-west1`** (v3.1). Hockey's earlier
   live Cloud Shell deploy printed `backfillUserClaims(europe-west1)` and the
   `europe-west1-…cloudfunctions.net` URL — the live deployment reporting its own region, not
   just source. Water polo's code agrees. No further confirmation needed unless a deploy shows
   otherwise.
5. Whether your functions carry a sport prefix + distinct `codebase` (§4c) — a yes/no, before
   first deploy.
6. Anything in this brief that doesn't match what you find. Report it rather than quietly
   working around it — this is the third revision to this contract, and a wrong assumption
   here has already cost one iOS-shaped rewrite.

---

## 7. Where each repo stands (from reports so far)

Updated after the second round of reports. "PR" = the sport's working PR.

| Repo | Handoff removed | Local sign-in/up + §2b | Persistence fix | §4c prefix+codebase | Clone? | Open, awaiting steer |
|---|---|---|---|---|---|---|
| 🏑 Hockey | ✅ (PR #165) | ✅ | ✅ | keeps `default` until handoff | (original) | handoff gated on main-site deploy; §4d hold; org-auth stays local (§4b) |
| 🥅 Netball | ✅ (PR #9) | ✅ (§2d+§2b shipped) | ✅ (originated it) | ⬜ Finding C — to prefix | yes | revert orgs to local (Finding A); §4c prefix+callables |
| 🏉 Rugby | ✅ reported | ✅ | ⬜ to confirm | ⬜ to do | **yes** | Finding B users-doc DB-split fix; keep org-auth local (Finding A) |
| 🤽 Water Polo | ✅ grep-clean | ✅ (uniform) | ✅ retained | ✅ (PR #13, codebase `waterpolo`) | **yes** | invites hold? named-DB functions handle fix? |

**Cross-cutting, owned by the main site / platform owner:**
- **Critical path — run the deploy** (`docs/DEPLOY-RUNBOOK.md`): hand `syncUserClaims`,
  `backfillUserClaims`, `payfastITN` over to codebase `main`, run the backfill. Until then the
  entitlement claim runs on **hockey's** live copy — working, but hockey can't complete its
  cutover and nothing is truly handed off.
- **§4d:** decide manual/EFT activation — build it centrally or declare PayFast-only. Hockey
  holds its EFT code until this lands.
- Turn ON "one account per email address" (§2g); add Authorized domains (§2c) in the console.
- **§4b is decided (local-first);** relay it so netball reverts and rugby/hockey stop waiting
  on a claim shape.
- Region confirmed `europe-west1` (§6.4) — no action.
