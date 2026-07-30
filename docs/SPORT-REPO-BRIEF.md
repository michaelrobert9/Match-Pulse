# MatchPulse — Brief for the Sport Repos (v2 — supersedes the handoff-ticket design)

**From:** the main site (`Match-Pulse`, Firebase project `match-pulse-4560e`)
**To:** Hockey · Netball · Rugby · Water Polo
**Status:** the redirect-based auth handoff (`createHandoffTicket` / `redeemHandoffTicket`)
is **abandoned**. It does not work in an installed iOS home-screen app and cannot be made
to. This document replaces it. Paste this whole document into the chat for each sport repo.

**Main-site side is done:** the handoff functions are removed, and the two blocking items
in §4 are addressed on the main site (`syncUserClaims` is now built and deployable here;
the org-auth decision is made — §4). See §4 for what that means for you.

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
  every sign-in method honours it the same way.
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
   email+password, or the equivalent account-exists signal for Google — **do not treat this
   as an error.** It means they already have a MatchPulse account, from this sport or
   another. Switch them to sign-in, with a message like "You already have an account — sign
   in instead." Don't let a second, separate account get created against the same identity.
3. Whether the account is brand new or already existed, once they're signed in on your
   subdomain, that's the same central account — proceed as normal.

One rule applied consistently, not per-method special cases. If your implementation branches
differently for Google vs. email+password beyond the provider-specific error code, that's a
sign the rule isn't actually unified — flag it.

### 2c. Still true, unchanged

- No account settings, password/email change, or billing UI in any sport repo — link out to
  `matchpulse.co.za/account`. It's now a genuine "manage your account" link, not a sign-in
  redirect.
- No writes to `entitlement`, `eventCredits`, `entitlementExpiresAt` — read-only, via custom
  claims (§4).
- Sport-specific profile (`<sport>Profiles/{uid}`) stays local to your database, keyed by
  the shared UID.
- `organizations/{orgId}` stays central in `(default)`, not sport-specific.

---

## 3. Verify these before you ship — don't assume

1. **Confirm cross-subdomain login resolves to one account, for every sign-in method.** Sign
   up on one sport's dev environment, then sign in on another's with the same identity — same
   email+password, and separately the same Google account — and confirm both land on the same
   UID (`auth.currentUser.uid`, not just that login succeeded). Test every method the same
   way. If any repo still has leftover ticket-handoff code that scopes auth state oddly, this
   is where it shows up.
2. **Auth persistence.** Netball found the SDK can silently default to in-memory persistence,
   which drops the session on next navigation and looks identical to "signed in, then signed
   out." The fix — an explicit persistence fallback chain (IndexedDB → localStorage →
   sessionStorage → memory), and not letting an IndexedDB refusal take down app init — is
   worth copying into all four repos regardless of the auth redesign. **The main site already
   applies it** (`src/firebase.js`, `initializeAuth` with an ordered `persistence` list); copy
   that shape.

---

## 4. The two blocking findings — main-site status

Both were raised by netball. Here's where each stands now.

### 4a. `syncUserClaims` — BUILT ON THE MAIN SITE, deploy pending

Custom claims (`entitlement`, `platformAdmin`, `orgRoles`) are the only way sport-side
Firestore rules can gate on central state without a cross-database read. Until the function
that writes them is deployed and firing, `request.auth.token.entitlement` is undefined and
claims-based rules fail **closed** — no one creates a competition, paying customers included.

**This now lives on the main site** (`functions/index.js`), alongside the billing writes it
mirrors, plus a one-time `backfillUserClaims` to stamp existing users. It deploys with the
main site's functions.

- **Do NOT declare `syncUserClaims` in your repo.** Cloud Function names are unique per
  project — a second definition collides at deploy. If hockey still declares it, hockey drops
  it in the same deploy that ships the main site's copy. There is exactly one, and it's ours.
- Once it's deployed, gate your rules on the claim:
  ```js
  function entitlement()   { return request.auth.token.get('entitlement', 'none'); }      // 'none'|'event'|'pro'
  function isPlatformAdmin(){ return request.auth != null && request.auth.token.get('platformAdmin', false) == true; }
  ```
- Client-side, after a plan change, force a token refresh or the claim lags ~1h:
  ```js
  await auth.currentUser.getIdToken(true)
  ```

### 4b. Org-scoped authorization across the database split — DECISION MADE

The problem: checks like `isOrgMember` / `isOrgOwner` read
`organizations/{orgId}/staff/{uid}` from `(default)`, but your rules evaluate against your
own database and can't read across. Every org-scoped check currently denies.

**Decision: mirror org roles onto the Auth token, not into each sport's database.**
`syncUserClaims` now includes a compact `orgRoles` claim — `{ [orgId]: role }` — derived from
the user's central `orgRoles`. Your rules read it with no cross-database read and no per-sport
`staff` mirror to keep in sync:

```js
function orgRole(orgId) { return request.auth.token.orgRoles[orgId]; }
allow write: if orgRole(orgId) in ['owner', 'staff'];
```

Why this over mirroring `staff` into every sport DB: it reuses the claims machinery already
required for entitlement (4a), keeps one authority source, and adds no fan-out sync. The
tradeoffs, stated plainly:
- **Claims lag ~1h** (or until `getIdToken(true)`). A just-appointed org admin may wait for
  the token to refresh. Acceptable for role changes; force a refresh if you need it instant.
- **1000-byte claim cap.** A user in a very large number of orgs would overflow; the function
  drops the map and sets `orgRolesOverflow: true` rather than failing. Those rules then fail
  closed for that rare user (safe). If your sport expects users in dozens of orgs, tell the
  main site — that's the signal to revisit.

If you disagree with this call, say so now — it's load-bearing for four repos.

---

## 5. Per-repo tasks

### 🏑 Hockey

1. Replace local login with direct Firebase Auth sign-in (§2) — largely what hockey had
   before the handoff detour, so closer to a revert than new work. Confirm what's actually
   there first.
2. Add the sign-up "already exists" handling (§2b) if missing.
3. **Drop `syncUserClaims` from the hockey repo** in the same deploy the main site's copy
   ships (§4a). Two definitions collide.
4. Still outstanding, unrelated to auth: move `position` out of the shared `users/{uid}` doc
   into `hockeyProfiles/{uid}`; stop deploying `firestore.default.rules` (the main site owns
   that ruleset and has a strict superset); remove PayFast entirely (main site's is live) —
   payment buttons, `initPayFastPayment`, `payfastITN`, the `/payfast/itn` rewrite,
   `_meta/payfastConfig`; move `organizations` reads/writes to the `(default)` handle.

### 🥅 Netball

You found the problem and shipped the mitigation — thank you.
1. Replace the "detect installed-iOS, stop redirecting, offer Copy Link" mitigation with the
   real fix: local sign-in (§2). The mitigation was correct triage; unneeded once there's no
   redirect to break.
2. Keep your auth-persistence fix (§3.2) — it's independent of this change.

### 🏉 Rugby · 🤽 Water Polo

1. Build sign-in and sign-up locally (§2), including "already exists" (§2b). No legacy handoff
   code to remove — greenfield, so build it right the first time rather than porting the
   ticket mechanism and un-porting it.
2. Confirm cross-subdomain account linking (§3.1) before considering it done — for every
   sign-in method, not just one.

---

## 6. Report back

1. Confirmation that signing up with an identity that already has an account on another
   subdomain resolves to the same account (§3.1) — tested for every sign-in method you
   support, stating what you actually tested rather than "should work."
2. What your sign-up flow does today on "account already exists", per method.
3. Any leftover ticket-handoff code (`/auth/handoff`, `createHandoffTicket` /
   `redeemHandoffTicket` calls, handoff redirects) — flag it for removal even if this
   document doesn't name your specific leftover.
4. Your observed **Functions region** (`firebase functions:list` or the console) — the main
   site's functions must match it. As of the code it's `europe-west1`, but confirm.
5. Anything in this brief that doesn't match what you find. Report it rather than quietly
   working around it — this is the second major revision to this contract, and a wrong
   assumption here has already cost one iOS-shaped rewrite.
