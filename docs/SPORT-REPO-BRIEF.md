# MatchPulse — Brief for the Sport Repos

**From:** the main site (`Match-Pulse`, Firebase project `match-pulse-4560e`)
**To:** Hockey · Netball · Rugby · Water Polo
**Status:** the main site is built and the auth contract is final. You are unblocked.

Paste this whole document into the chat for each sport repo. It is self-contained —
you do not need to see the main-site repo to act on it.

---

## 1. What the main site is, and what it now does

MatchPulse is one brand, one Firebase project (`match-pulse-4560e`), five deployments.
The main site is the front door and the account system. It is **live-ready** and owns:

| Built and working | Where |
|---|---|
| Sign-up, sign-in, Google sign-in, password reset | main site |
| Account page — change name, email, password | main site |
| Plan display **and purchase** (Free / Plus R2,000 / Pro R15,000) | main site |
| **Auth handoff into your sport** | `createHandoffTicket` / `redeemHandoffTicket` |
| Central Firestore schema + security rules | `(default)` database |
| Sport hub linking to all four sports | main site |

Also built: **PayFast purchase** (hosted checkout + ITN webhook) — see §7a.
Still coming: contact form, legal pages.

### ⛔ Rollout order — do not skip this

The handoff has a hard dependency chain. If a sport starts redirecting sign-ups to
`matchpulse.co.za/login` before that flow is confirmed working, **new users are stranded
with no way back** — they land on a login page that cannot return them.

Work in this order. Do not start a phase until the previous one is confirmed **live**, not
merely merged:

| Phase | Who | Gate before moving on |
|---|---|---|
| **1** | Main site | `/login`, `/signup`, `/auth/handoff` endpoints and both callables deployed and reachable |
| **2** | Hockey | Handoff verified end-to-end **while keeping its own login as a fallback** |
| **3** | Hockey | Only once phase 2 is proven, remove hockey's local login |
| **4** | Netball · Rugby · Water Polo | Green-lit only after phase 2 |

**Netball, Rugby, Water Polo: you are in phase 4.** Build your handoff route now, but do
**not** remove or bypass any existing sign-in path, and do not point users at the main site
for sign-in, until hockey has confirmed the round trip works. Ask before flipping it on.

Hockey is the canary precisely because it has real structure to fall back on. The other
three have less to lose but also less to catch a failure with.

### The one rule that governs everything

> **Identity, organisation, plan and billing are central.
> Everything sport-specific belongs to your sport.**

You **read** central data. You **never write** plan or billing fields — Firestore rules
will reject it, not just convention.

---

## 2. What you must NOT build

Delete it if it exists in your repo. These live on the main site and nowhere else:

- ❌ Sign-up / login / logout screens of your own
- ❌ Password change, password reset, email change UI
- ❌ Plan purchase, PayFast, pricing checkout, billing history
- ❌ Any write to `entitlement`, `eventCredits`, `entitlementExpiresAt`
- ❌ Account settings pages

When a user needs any of these, **send them to the main site**:

```js
// Wherever you'd have shown an account/billing screen:
window.location.assign(`${MAIN_SITE}/account`)
```

---

## 3. What you DO own

- ✅ Everything about your sport: competitions, fixtures, matches, teams, standings
- ✅ **Your sport's profile** — position, squad number, club affiliation, preferences,
  sport stats. Schema, UI and writes are all yours.
- ✅ Reading central identity and plan state to know who's signed in and what they can do

Your sport profile lives in **your own** database, keyed by the central UID:

```
<your-sport> database:
  competitions/, matches/, teams/, fixtures/
  <sport>Profiles/{uid}       ← position, squad no., club, sport preferences
```

**Never write a sport-specific field into `users/{uid}`.** That document is shared by every
sport. Hockey currently writes `position` there — hockey positions
(`goalkeeper|defence|midfield|forward`) and netball positions (`GS|GA|WA|C|WD|GD|GK`) would
silently overwrite each other on the same field. See §8.

---

## 4. Auth handoff — implement this

### Why it's needed

Firebase Auth persists its session in IndexedDB **scoped to the origin**. The main site and
your sport are different origins, so a user signed in there is **not** signed in with you.
Same Firebase project or not.

A shared cookie does not solve this: the Firebase *client* SDK doesn't read cookies for auth
state, so you'd still need `signInWithCustomToken` to get `request.auth` for Firestore. The
handoff below is the decided mechanism.

### How it works

The main site mints a **single-use, 60-second ticket**, stored hashed, and sends the user to
you with it in the **URL fragment** (fragments never reach servers or `Referer` headers). You
exchange the ticket for a Firebase custom token and sign in.

```
Main site                                  Your sport app
─────────                                  ──────────────
user clicks your sport
  └─ redirect ────────────────────────────▶ /auth/handoff#t=<ticket>&p=<path>
                                              ├─ redeemHandoffTicket({ ticket })
                                              ├─ signInWithCustomToken(token)
                                              ├─ strip the fragment
                                              └─ go to <path>
```

### Step 1 — set the Functions region (CONFIRM IT FIRST)

⚠️ **Verify this before you write anything.** A wrong region fails at *call* time with an
opaque error, never at build or deploy time — so it looks like a broken handoff, not a
config mistake. Confirm with either:

```bash
firebase functions:list --project match-pulse-4560e
```

or Firebase Console → **Build → Functions**, which shows the region per function.

**The Functions region is NOT the Firestore region.** Firestore is `africa-south1`. That is
a separate setting and does not constrain Functions. As of the hockey repo's code, Functions
are `europe-west1` — it appears in `src/firebase.js`, all three hosting rewrites, and 13
function definitions. But confirm against the live deployment rather than trusting this doc.

Keep it in **one** constant so a correction is a one-line change:

```js
// src/firebase.js
import { getFunctions } from 'firebase/functions'

// Must match where the main site's functions are actually deployed.
export const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west1'
export const functions = getFunctions(app, FUNCTIONS_REGION)
```

If the console disagrees with `europe-west1`, **say so** — the main site's functions must
move to match, and that is a platform-wide change, not a per-repo one.

### Step 2 — add the `/auth/handoff` route

```jsx
// src/pages/AuthHandoff.jsx
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithCustomToken } from 'firebase/auth'
import { httpsCallable } from 'firebase/functions'
import { auth, functions } from '../firebase'

const MAIN_SITE = 'https://matchpulse.co.za'

export default function AuthHandoff() {
  const [error, setError] = useState('')
  const navigate = useNavigate()
  const ran = useRef(false)          // StrictMode double-invokes effects; the
                                     // ticket is single-use, so guard it.

  useEffect(() => {
    if (ran.current) return
    ran.current = true

    ;(async () => {
      // Read the fragment, then clear it from history immediately.
      const frag   = new URLSearchParams(window.location.hash.slice(1))
      const ticket = frag.get('t')
      const path   = frag.get('p') || '/'
      window.history.replaceState(null, '', window.location.pathname)

      if (!ticket) { setError('This sign-in link is incomplete.'); return }

      try {
        const redeem = httpsCallable(functions, 'redeemHandoffTicket')
        const { data } = await redeem({ ticket })
        await signInWithCustomToken(auth, data.token)
        navigate(path, { replace: true })
      } catch (err) {
        // Tickets expire after 60s and work exactly once.
        setError(
          err?.code === 'functions/deadline-exceeded'
            ? 'That sign-in link expired. Please try again.'
            : 'That sign-in link is no longer valid. Please sign in again.'
        )
      }
    })()
  }, [navigate])

  if (error) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh', padding: 24, textAlign: 'center' }}>
        <div>
          <p>{error}</p>
          <a href={`${MAIN_SITE}/login?sport=<your-sport-key>`}>Sign in again</a>
        </div>
      </div>
    )
  }
  return <div style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>Signing you in…</div>
}
```

Register it, and make sure it is **not** behind your auth guard:

```jsx
<Route path="/auth/handoff" element={<AuthHandoff />} />
```

Your sport key is one of: `hockey` · `netball` · `rugby` · `waterpolo`.

### Step 3 — send signed-out users to the main site

Anywhere you'd previously have shown your own login screen:

```js
// src/lib/auth-redirect.js
const MAIN_SITE = 'https://matchpulse.co.za'
const SPORT     = 'hockey'   // your sport key

export function goSignIn(path = window.location.pathname) {
  const q = new URLSearchParams({ sport: SPORT, path })
  window.location.assign(`${MAIN_SITE}/login?${q}`)
}
```

The main site signs them in, then bounces them straight back to you, authenticated, on
the path they asked for.

### Step 4 — Firebase Hosting rewrite

SPA routing must serve `index.html` for `/auth/handoff`:

```json
"rewrites": [{ "source": "**", "destination": "/index.html" }]
```

If you use a catch-all Cloud Function renderer instead (hockey does), make sure
`/auth/handoff` reaches the SPA shell.

### Known limitations — expected, don't work around them

- **Sign-out is per-origin.** Signing out of your sport does not sign out the main site.
- **Tickets are single-use and expire in 60 seconds.** A refresh of the handoff URL will
  fail — that's correct. Send the user back to sign in.

---

## 5. Entitlement — read the custom claim, never the document

Firestore rules **cannot read across databases**. So plan state is mirrored onto each user's
Auth token as **custom claims** by a Cloud Function (`syncUserClaims`) whenever their
`users/{uid}` record changes.

Claims travel with the user, not the origin — so they're already on the token after handoff.

**In your security rules, in your own database:**

```js
function entitlement() {
  return request.auth.token.get('entitlement', 'none');   // 'none' | 'event' | 'pro'
}
function isPlatformAdmin() {
  return request.auth != null && request.auth.token.get('platformAdmin', false) == true;
}

// Example: only paid tiers may create a competition
allow create: if isPlatformAdmin() || entitlement() in ['event', 'pro'];
```

**In your client:**

```js
const token = await auth.currentUser.getIdTokenResult()
const tier  = token.claims.entitlement ?? 'none'
```

Available claims: `entitlement`, `entitlementExpiresAt` (ms), `eventCredits`, `platformAdmin`.

**The gotcha:** claims are baked into the token at mint time and refresh about hourly. After a
purchase, force a refresh or the buyer is locked out of what they just paid for:

```js
await auth.currentUser.getIdToken(true)
```

---

## 6. The central schema you may read

In the **`(default)`** database — get a second Firestore handle for it:

```js
import { getFirestore } from 'firebase/firestore'
export const db         = initializeFirestore(app, {...}, '<your-sport>')  // your content
export const identityDb = getFirestore(app)                               // (default) — central
```

```
users/{uid}              identity + billing. READ your own only. Never write billing fields.
userProfiles/{uid}       public-safe subset — displayName, photoURL, email
people/{personId}        cross-sport player identity, consent-gated
organizations/{orgId}    THE org record — MatchPulse-level, not sport-specific
  └─ staff/{uid}         membership; the authority source for who may act for an org
```

### Organisations are central, not yours

An organiser running hockey *and* netball has **one** org. The record lives in `(default)`
and every sport references it by ID (`ownerOrgId`). Do not create your own org collection.

Rules already enforce: staff may edit an org's own details; **no client may touch its
billing fields**.

---

## 7a. Billing — you have nothing to do

Purchase is a PayFast hosted checkout on the main site; a webhook at
`matchpulse.co.za/payfast/itn` grants the plan and `syncUserClaims` carries it onto the
Auth token. By the time a user reaches you, their entitlement claim is already correct.

Your only job is to **read the claim** (§5) and link pricing CTAs to
`https://matchpulse.co.za/#plans`. Do not implement, duplicate or re-point any part of it.

---

## 7. Reuse these patterns from hockey

Hockey is the most mature app. These parts are sport-agnostic — port rather than reinvent:

- Fixture lifecycle and status model
- Stats-engine-on-read
- Walkover / withdrawal handling
- The `ownerOrgId` split between competition ownership and team participation
- Card/status colour semantics: **live is red, and red only ever means live**

Brand tokens — canonical, main-site-owned:

```
--pulse       #059669   emerald-600  brand / primary action
--pulse-ink   #047857   emerald-700  text on emerald tint
--live        #E5484D                LIVE ONLY, never decorative
--ink         #0B1220                primary text, dark panels
```

Superseded, do not use: `#1FB573`, `#0E7A4D`, `#16A672`, `#089769`.
Type: Space Grotesk (display) · Inter (body) · Roboto (tabular figures).

---

## 8. Per-repo tasks

### 🏑 Hockey — the most to unwind

You are the reference implementation, but you also carry work that has moved.

1. **Add the auth handoff** (§4). You have your own login today — keep it working until
   the handoff is verified, then remove it and redirect to the main site instead.
2. **Move `position` out of `users/{uid}`.** `Profile.jsx` writes hockey positions into the
   shared central identity doc. Move to `hockeyProfiles/{uid}` in the hockey database, keyed
   by the same UID. **Do this before netball ships** or the two sports overwrite each other.
   Keep the hockey profile *UI* — only the storage location is wrong.
3. **Stop deploying `firestore.default.rules`.** The main site now owns the `(default)`
   ruleset and has a strict superset of yours. Two repos deploying one ruleset means
   whichever runs last wins. Remove the Firestore rules step from your CI workflow.
4. **Remove PayFast entirely — it is built and live on the main site.** Delete:
   - the payment buttons / `PAYFAST_LINKS` in `Plans.jsx`
   - `initPayFastPayment` (dead code — `Plans.jsx` never called it)
   - `payfastITN` and the `/payfast/itn` rewrite in `firebase.json`
   - the `_meta/payfastConfig` read and the PayFast half of `BillingSettings.jsx`

   Replace every pricing CTA with a link to `https://matchpulse.co.za/#plans`.

   ⚠️ **Keep `syncUserClaims`.** It is the only thing carrying entitlement onto the Auth
   token, and the main site's webhook depends on it. Cloud Function names are unique per
   project, so the main site cannot declare it while you still do. Do not remove it until
   a coordinated switchover.
5. **`organizations` belongs in `(default)`.** It is MatchPulse-level, not sport-specific.
   There are no users, so there is nothing to migrate — just switch your org reads and
   writes from the hockey handle to the `identityDb` handle.

### 🥅 Netball · 🏉 Rugby · 🤽 Water Polo — greenfield, build it right

1. **Do not build any account, login or billing UI.** Implement the handoff (§4) from day
   one. For pricing, link to `https://matchpulse.co.za/#plans`.
2. **Build your sport profile locally** — `<sport>Profiles/{uid}` in your own database, keyed
   by the central UID. Design the schema around what's genuinely specific to your sport.
3. **Read org and plan state; never write it** (§5, §6).
4. **Port hockey's sport-agnostic patterns** (§7) rather than reinventing them.
5. Confirm your Firestore database name and hosting site, and report them back.

---

## 9. Checklist — every sport repo

- [ ] Functions region **verified against the live deployment**, held in one constant
- [ ] Rollout phase confirmed (see ⛔ above) — phase 4 repos have explicit go-ahead
- [ ] `/auth/handoff` route added, outside the auth guard
- [ ] Hosting rewrite serves the SPA for `/auth/handoff`
- [ ] Signed-out users redirect to the main site's `/login?sport=…&path=…`
- [ ] No login / password / email / billing UI remains — **only after your phase allows it**
- [ ] Rules gate on `request.auth.token.entitlement`, not a cross-database read
- [ ] No client write to `entitlement` / `eventCredits` / `entitlementExpiresAt`
- [ ] Sport profile stored in your own database, keyed by central UID
- [ ] Nothing sport-specific written into `users/{uid}`
- [ ] Brand tokens updated to emerald-600 `#059669`

---

## 10. Report back

1. Your Firestore database name and hosting site/URL
2. What auth you have today, and what you removed
3. Your sport-profile schema and where it's stored
4. Anywhere you read or write plan/entitlement state
5. **The Functions region you actually observe** in the console or `functions:list`
6. Anything in this brief that doesn't match what you actually find — the main site's
   picture of your repo is inferred, not verified, and hockey has drifted most. A
   contradiction here is a finding worth reporting, not an obstacle to work around.
   Report it rather than quietly adapting: if this document is wrong, four repos are
   about to be wrong the same way.
