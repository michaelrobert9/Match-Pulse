/**
 * MatchPulse main site — Cloud Functions.
 *
 * Scope: identity claims and billing. No auth handoff — see below.
 * Region: see FUNCTIONS_REGION. It is NOT the Firestore region (africa-south1);
 * a mismatch fails at call time, not deploy time.
 *
 * The redirect-based auth handoff (createHandoffTicket / redeemHandoffTicket)
 * was REMOVED. It could not work in an installed iOS home-screen app: iOS gives
 * the installed app its own storage container and will not route a redirect from
 * an external origin back into it, so the session minted in Safari was invisible
 * to the app that sent the user out. Each sport now signs in directly on its own
 * origin against the shared Auth project — which never had the per-origin problem
 * the handoff was invented to solve.
 */

const { onDocumentWritten } = require('firebase-functions/v2/firestore')
const { onRequest, onCall, HttpsError } = require('firebase-functions/v2/https')
const { getFirestore } = require('firebase-admin/firestore')
const logger = require('firebase-functions/logger')
const admin  = require('firebase-admin')
const crypto = require('crypto')

admin.initializeApp()

const db = admin.firestore()          // (default) — identity, orgs, entitlements

// Deploy region for every function here. Must match what the clients call with
// and the hosting rewrite. Firestore's africa-south1 is a SEPARATE setting and
// does not constrain this. Confirm with `firebase functions:list`.
const REGION = process.env.FUNCTIONS_REGION || 'europe-west1'

// Firebase caps a user's custom claims at 1000 bytes total. We stay well under.
const CLAIMS_BUDGET = 900

// ── syncUserClaims ────────────────────────────────────────────────────────────
// THE reason this exists: Firestore rules cannot read across databases. Each
// sport lives in its own database, but plan/role state lives centrally in
// (default). Mirroring that state onto the user's Auth token as custom claims is
// the only way a sport's rules can gate on it — the token travels with the user
// to every origin.
//
// Without this deployed and firing, `request.auth.token.entitlement` is
// undefined everywhere and every claims-based rule fails CLOSED — no one can
// create a competition, paying customers included. So it is load-bearing, and it
// lives here, on the main site, alongside the billing writes it mirrors.
//
// ONE deployment only: Cloud Function names are unique per project. If the hockey
// repo still declares syncUserClaims, it must drop it in the same coordinated
// deploy that ships this — two definitions collide.

function normaliseGrant(grant) {
  if (typeof grant === 'string') return grant
  return grant?.role ?? null
}

// Compact { orgId: role } map for org-scoped rules on the sport side. This is
// the platform answer to "sport rules can't read the central staff subcollection
// across databases" — mirror the membership onto the token instead. Capped so a
// user in an unusual number of orgs can never blow the claims budget: if it would
// overflow, we omit it and flag it, and those org-scoped rules fail closed (safe)
// for that one user while everything else still works.
function orgRolesClaim(orgRoles = {}) {
  const compact = {}
  for (const [orgId, grant] of Object.entries(orgRoles)) {
    const role = normaliseGrant(grant)
    if (role) compact[orgId] = role
  }
  return compact
}

function claimsFromUser(d = {}) {
  const exp = d.entitlementExpiresAt
  const claims = {
    platformAdmin:        d.platformAdmin === true,
    entitlement:          d.entitlement ?? 'none',
    entitlementExpiresAt: exp?.toMillis ? exp.toMillis() : (typeof exp === 'number' ? exp : null),
    eventCredits:         Number(d.eventCredits ?? 0),
  }
  const orgRoles = orgRolesClaim(d.orgRoles)
  const withOrgs = { ...claims, orgRoles }
  if (JSON.stringify(withOrgs).length <= CLAIMS_BUDGET) return withOrgs
  // Overflow: keep the essential fields, drop the org map, mark it so a client
  // can fall back to a direct read for that rare user.
  logger.warn('User orgRoles claim over budget — omitting', { orgs: Object.keys(orgRoles).length })
  return { ...claims, orgRolesOverflow: true }
}

// Cheap equality so we only touch the token when something claim-relevant moved.
function claimsChanged(before, after) {
  return JSON.stringify(claimsFromUser(before || {})) !== JSON.stringify(claimsFromUser(after || {}))
}

exports.syncUserClaims = onDocumentWritten(
  { document: 'users/{uid}', region: REGION },
  async (event) => {
    const before = event.data?.before?.data()
    const after  = event.data?.after?.data()
    const { uid } = event.params
    if (!after) return                                  // user doc deleted
    if (before && !claimsChanged(before, after)) return // nothing relevant changed
    try {
      await admin.auth().setCustomUserClaims(uid, claimsFromUser(after))
      logger.info('User claims synced', { uid })
    } catch (err) {
      // A users doc can outlive its Auth account; ignore "user not found".
      logger.warn('Could not sync user claims', { uid, message: err.message })
    }
  }
)

// ── syncOrgRoleClaim ──────────────────────────────────────────────────────────
// The other half of the §4b org-auth decision (raised by rugby): deciding to
// gate sport rules on an orgRoles CLAIM is only correct if the claim actually
// tracks membership. Membership authority is organizations/{orgId}/staff/{uid}
// in (default), which sport rules cannot read across the database boundary — so
// we mirror it onto the token in two single-purpose hops:
//
//   staff/{uid} write  →  [this]  →  users/{uid}.orgRoles[orgId]  →  syncUserClaims  →  claim
//
// staff stays the single source of truth; this is the ONLY writer of orgRoles
// (the old client-side cache-write path is thereby retired — see firestore.rules).
// No loop: this writes the user doc, syncUserClaims only writes the token.
exports.syncOrgRoleClaim = onDocumentWritten(
  { document: 'organizations/{orgId}/staff/{uid}', region: REGION },
  async (event) => {
    const { orgId, uid } = event.params
    const after = event.data?.after?.data()
    const userRef = db.doc(`users/${uid}`)
    try {
      if (after) {
        const role = after.role ?? 'staff'
        // merge deep-merges the map, so other orgs' entries are preserved.
        await userRef.set({ orgRoles: { [orgId]: role } }, { merge: true })
      } else {
        // Membership revoked. update() no-ops harmlessly if the doc is gone.
        await userRef.update({ [`orgRoles.${orgId}`]: admin.firestore.FieldValue.delete() })
      }
    } catch (err) {
      logger.warn('Could not sync org role', { orgId, uid, message: err.message })
    }
  }
)

// One-time backfill: stamp claims onto every existing user so the token path
// works immediately, without waiting for each user's doc to next change. Guarded
// by a key; run once from a browser, confirm the count, then leave it. It only
// copies each user's existing state onto their token — it cannot grant anyone
// new access.
const BACKFILL_KEY = process.env.CLAIMS_BACKFILL_KEY || 'mp-claims-backfill-set-a-real-key'

exports.backfillUserClaims = onRequest({ region: REGION, timeoutSeconds: 540, memory: '512MiB' }, async (req, res) => {
  if (req.query.key !== BACKFILL_KEY) { res.status(403).send('Forbidden'); return }
  let processed = 0, updated = 0
  const snap = await db.collection('users').get()
  for (const d of snap.docs) {
    processed++
    try { await admin.auth().setCustomUserClaims(d.id, claimsFromUser(d.data())); updated++ }
    catch (err) { logger.warn('backfill: could not set claims', { uid: d.id, message: err.message }) }
  }
  logger.info('Claims backfill complete', { processed, updated })
  res.status(200).send(`Done. Processed ${processed} users, set claims on ${updated}.`)
})

// ── PayFast ITN webhook ───────────────────────────────────────────────────────
// PayFast POSTs here after every payment event. This is the ONLY thing that
// grants a plan — the checkout itself is a hosted PayFast page, so nothing else
// in the platform learns that money changed hands.
//
// Reached at https://matchpulse.co.za/payfast/itn via the hosting rewrite, which
// is exactly the notify_url baked into the payment buttons.
//
// It updates users/{uid}; syncUserClaims (above) then carries the new plan onto
// the Auth token the sport subdomains gate on. That dependency is now in-repo.
//
// Three things this has to get right:
//   1. Authenticity — an unverified endpoint that grants paid plans is an open
//      door. Signature check first, server confirmation second.
//   2. Idempotency  — PayFast RETRIES until it gets a 200. Processing the same
//      payment twice would stack credits or extend a subscription twice.
//   3. Always 200   — any other status triggers more retries. Log and move on.

const PAYFAST_HOSTS = {
  live:    'https://www.payfast.co.za',
  sandbox: 'https://sandbox.payfast.co.za',
}

// Optional config: _meta/payfastConfig { passphrase, sandbox }. Absent is fine —
// we fall back to asking PayFast to confirm the payment directly.
async function payfastConfig() {
  try {
    const snap = await db.doc('_meta/payfastConfig').get()
    return snap.exists ? snap.data() : {}
  } catch { return {} }
}

// PayFast signs the parameters in the order they were sent, urlencoded with
// spaces as '+', with the passphrase appended. Rebuild in the received order —
// sorting the keys silently breaks the comparison.
function expectedSignature(body, passphrase) {
  const parts = []
  for (const [k, v] of Object.entries(body)) {
    if (k === 'signature') continue
    if (v === undefined || v === null || v === '') continue
    parts.push(`${k}=${encodeURIComponent(String(v).trim()).replace(/%20/g, '+')}`)
  }
  let str = parts.join('&')
  if (passphrase) str += `&passphrase=${encodeURIComponent(passphrase.trim()).replace(/%20/g, '+')}`
  return crypto.createHash('md5').update(str).digest('hex')
}

// Ask PayFast whether it really sent this. Works without a passphrase and
// defends against a forged POST.
async function payfastConfirms(body, sandbox) {
  const form = new URLSearchParams()
  for (const [k, v] of Object.entries(body)) if (k !== 'signature') form.append(k, String(v))
  try {
    const res = await fetch(`${PAYFAST_HOSTS[sandbox ? 'sandbox' : 'live']}/eng/query/validate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body:    form.toString(),
    })
    return (await res.text()).trim().toUpperCase().startsWith('VALID')
  } catch (err) {
    logger.error('PayFast validation request failed', { message: err.message })
    return false
  }
}

// Buttons carry m_payment_id = "{uid}__{plan}__{timestamp}". Fall back to the
// payer's email so a payment started outside our flow can still be matched.
async function resolveBuyer(body) {
  const parts = String(body.m_payment_id ?? '').split('__')
  if (parts.length >= 2 && parts[0]) return { uid: parts[0], plan: parts[1], via: 'm_payment_id' }

  const email = String(body.email_address ?? '').toLowerCase().trim()
  if (email) {
    const snap = await db.collection('users').where('email', '==', email).limit(2).get()
    // Two accounts on one address is ambiguous — never guess at money.
    if (snap.size === 1) {
      const amount = Number(body.amount_gross ?? 0)
      return { uid: snap.docs[0].id, plan: amount >= 10000 ? 'pro' : 'event', via: 'email' }
    }
  }
  return null
}

exports.payfastITN = onRequest({ region: REGION }, async (req, res) => {
  try {
    const body = req.body ?? {}
    const pfId = String(body.pf_payment_id ?? body.m_payment_id ?? '').trim()
    logger.info('PayFast ITN received', { pfId, status: body.payment_status })

    // Idempotency gate. The doc is claimed in a transaction, so a retry that
    // arrives while the first is still running loses and exits.
    const auditRef = db.collection('payments').doc(pfId || `unknown_${Date.now()}`)
    const claimed  = await db.runTransaction(async (tx) => {
      const snap = await tx.get(auditRef)
      if (snap.exists && snap.data().processed) return false
      tx.set(auditRef, {
        raw:        body,
        status:     body.payment_status ?? null,
        amount:     Number(body.amount_gross ?? 0),
        receivedAt: admin.firestore.FieldValue.serverTimestamp(),
        processed:  false,
      }, { merge: true })
      return true
    })
    if (!claimed) { logger.info('PayFast ITN already processed', { pfId }); res.status(200).send('OK'); return }

    const cfg = await payfastConfig()

    // Authenticity: signature when we hold a passphrase, otherwise ask PayFast.
    let authentic = false
    if (cfg.passphrase) {
      authentic = expectedSignature(body, cfg.passphrase) === String(body.signature ?? '')
      if (!authentic) logger.warn('PayFast ITN signature mismatch', { pfId })
    }
    if (!authentic) authentic = await payfastConfirms(body, cfg.sandbox === true)

    if (!authentic) {
      logger.error('PayFast ITN failed verification — ignoring', { pfId })
      await auditRef.set({ verified: false }, { merge: true })
      res.status(200).send('OK'); return
    }
    await auditRef.set({ verified: true }, { merge: true })

    if (String(body.payment_status).toUpperCase() !== 'COMPLETE') {
      logger.info('PayFast ITN not complete — nothing to grant', { pfId, status: body.payment_status })
      await auditRef.set({ processed: true }, { merge: true })
      res.status(200).send('OK'); return
    }

    const buyer = await resolveBuyer(body)
    if (!buyer) {
      logger.error('PayFast ITN — cannot attribute payment to an account', {
        pfId, m_payment_id: body.m_payment_id, email: body.email_address,
      })
      await auditRef.set({ needsManualReview: true }, { merge: true })
      res.status(200).send('OK'); return
    }

    const userRef  = db.doc(`users/${buyer.uid}`)
    const userSnap = await userRef.get()
    if (!userSnap.exists) {
      logger.error('PayFast ITN — user not found', { pfId, uid: buyer.uid })
      await auditRef.set({ needsManualReview: true, uid: buyer.uid }, { merge: true })
      res.status(200).send('OK'); return
    }

    if (buyer.plan === 'pro') {
      // Extend from the later of now and any remaining term, so an early renewal
      // adds a year rather than throwing the remainder away.
      const current = userSnap.data().entitlementExpiresAt?.toDate?.() ?? null
      const from    = current && current > new Date() ? current : new Date()
      const expires = new Date(from); expires.setFullYear(expires.getFullYear() + 1)
      await userRef.update({
        entitlement:          'pro',
        entitlementExpiresAt: admin.firestore.Timestamp.fromDate(expires),
        entitlementUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      logger.info('Pro granted', { uid: buyer.uid, expires, via: buyer.via })
    } else {
      await userRef.update({
        entitlement:          'event',
        eventCredits:         admin.firestore.FieldValue.increment(1),
        entitlementUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      })
      logger.info('Event credit granted', { uid: buyer.uid, via: buyer.via })
    }

    await auditRef.set({ processed: true, uid: buyer.uid, plan: buyer.plan, via: buyer.via }, { merge: true })
    res.status(200).send('OK')
  } catch (err) {
    // Never non-200: PayFast would retry indefinitely.
    logger.error('PayFast ITN error', { message: err.message })
    res.status(200).send('OK')
  }
})

// ── getUserSportActivity ─────────────────────────────────────────────────────
// Admin panel needs to answer "which sports has this user actually signed in on
// and used?" — the truth for that lives in each sport's own named DB, which
// Firestore rules can't read across but the Admin SDK can. So we hop from
// (default) into each sport DB with getFirestore(app, dbId) and look for the
// user's sport profile document. Present → active on that sport. Missing or
// error → not active.
//
// The sport registry here must stay in step with src/lib/sports.js. If a sport's
// named DB doesn't exist yet the read errors and we quietly report inactive —
// safer than surfacing a scary error in the admin panel.
const SPORT_DBS = [
  { key: 'hockey',    dbId: 'hockey',    collection: 'hockeyProfiles'    },
  { key: 'netball',   dbId: 'netball',   collection: 'netballProfiles'   },
  { key: 'rugby',     dbId: 'rugby',     collection: 'rugbyProfiles'     },
  { key: 'waterpolo', dbId: 'waterpolo', collection: 'waterpoloProfiles' },
]

async function callerIsAdmin(request) {
  const uid   = request.auth?.uid
  const token = request.auth?.token
  if (!uid) return false
  if (token?.platformAdmin === true) return true
  // Fallback: check the users doc, matching the isPlatformAdmin() rule.
  const snap = await db.doc(`users/${uid}`).get()
  return snap.exists && snap.data()?.platformAdmin === true
}

exports.getUserSportActivity = onCall({ region: REGION }, async (request) => {
  if (!(await callerIsAdmin(request))) {
    throw new HttpsError('permission-denied', 'Platform admin only.')
  }
  const targetUid = String(request.data?.uid || '').trim()
  if (!targetUid) throw new HttpsError('invalid-argument', 'uid required.')

  const results = await Promise.all(SPORT_DBS.map(async ({ key, dbId, collection }) => {
    try {
      const sportDb = getFirestore(admin.app(), dbId)
      const doc = await sportDb.collection(collection).doc(targetUid).get()
      if (!doc.exists) return [key, { active: false }]
      const d = doc.data() || {}
      const lastActive = d.updatedAt?.toDate?.() ?? d.createdAt?.toDate?.() ?? null
      return [key, { active: true, lastActive: lastActive ? lastActive.toISOString() : null }]
    } catch (err) {
      logger.warn('getUserSportActivity: read failed', { key, dbId, uid: targetUid, message: err.message })
      return [key, { active: false, error: 'unreadable' }]
    }
  }))
  return Object.fromEntries(results)
})

// ── Entitlement grant core ───────────────────────────────────────────────────
// One place that writes plan state onto users/{uid}, shared by the admin grant
// tool and invoice payment. Field shapes match the PayFast ITN exactly, so
// syncUserClaims mirrors any of the three paths onto the token identically.
// Returns the user doc's data from before the change (for audit rows).
async function applyEntitlement(uid, { plan, credits = 1, years = 1 }) {
  const userRef  = db.doc(`users/${uid}`)
  const userSnap = await userRef.get()
  if (!userSnap.exists) throw new HttpsError('not-found', 'No such user.')
  const beforeData = userSnap.data()

  let update
  if (plan === 'pro') {
    // Same extension rule as the ITN: from the later of now and any remaining
    // term, so a renewal stacks rather than clobbering paid time.
    const current = beforeData.entitlementExpiresAt?.toDate?.() ?? null
    const from    = current && current > new Date() ? current : new Date()
    const expires = new Date(from); expires.setFullYear(expires.getFullYear() + years)
    update = {
      entitlement:          'pro',
      entitlementExpiresAt: admin.firestore.Timestamp.fromDate(expires),
      entitlementUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
  } else if (plan === 'event') {
    // SET the credit count (not increment): the caller states what the user
    // should have, which also makes re-submitting idempotent.
    update = {
      entitlement:          'event',
      eventCredits:         credits,
      entitlementExpiresAt: null,
      entitlementUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
  } else {
    update = {
      entitlement:          'none',
      eventCredits:         0,
      entitlementExpiresAt: null,
      entitlementUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }
  }

  await userRef.update(update)
  return beforeData
}

// ── adminSetEntitlement ──────────────────────────────────────────────────────
// The admin panel's Access tab calls this to grant, change or revoke a plan by
// hand — an EFT payer, a free/comp account, a correction. It writes the same
// users/{uid} fields the PayFast ITN writes (so syncUserClaims mirrors it onto
// the token identically), and records an audit row in /payments so every manual
// allocation shows up in the same ledger as automated ones.
//
// A callable rather than a client write because the payment audit record is
// Admin-SDK-only by rules, and because grant + audit should land together.
exports.adminSetEntitlement = onCall({ region: REGION }, async (request) => {
  if (!(await callerIsAdmin(request))) {
    throw new HttpsError('permission-denied', 'Platform admin only.')
  }

  const uid    = String(request.data?.uid || '').trim()
  const plan   = String(request.data?.plan || '')            // 'none' | 'event' | 'pro'
  const method = String(request.data?.method || 'manual')    // 'eft' | 'comp' | 'correction' | …
  const note   = String(request.data?.note || '').slice(0, 500)
  const credits = Number.isFinite(Number(request.data?.credits)) ? Math.max(0, Math.floor(Number(request.data.credits))) : 1
  const years   = Number.isFinite(Number(request.data?.years))   ? Math.max(1, Math.floor(Number(request.data.years)))   : 1

  if (!uid) throw new HttpsError('invalid-argument', 'uid required.')
  if (!['none', 'event', 'pro'].includes(plan)) {
    throw new HttpsError('invalid-argument', "plan must be 'none', 'event' or 'pro'.")
  }

  const beforeData = await applyEntitlement(uid, { plan, credits, years })

  await db.collection('payments').add({
    manual:        true,
    method,                                   // eft | comp | correction | manual
    note,
    uid,
    email:         beforeData.email ?? null,
    plan,
    creditsSet:    plan === 'event' ? credits : null,
    years:         plan === 'pro' ? years : null,
    previousPlan:  beforeData.entitlement ?? 'none',
    adminUid:      request.auth.uid,
    paymentStatus: 'MANUAL',
    receivedAt:    admin.firestore.FieldValue.serverTimestamp(),
  })

  logger.info('Manual entitlement set', { uid, plan, method, by: request.auth.uid })
  // syncUserClaims fires off the users/{uid} write and updates the token claim;
  // the user picks it up on next token refresh (each app forces one on load).
  return { ok: true, plan }
})

// ── Invoices (EFT billing) ───────────────────────────────────────────────────
// PayFast is dormant (code kept, UI detached): plans are now sold by invoice.
// A signed-in user picks a plan and bill-to details → createInvoice writes a
// sequentially-numbered invoice (MP-<year>-<seq>) → they pay by EFT using the
// invoice number as reference → an admin marks it paid, which grants the plan
// through the same applyEntitlement core the admin tool uses.
//
// Prices are validated HERE, never trusted from the client. Keep this table in
// step with src/lib/payfast.js PLANS (the client's display prices).
const INVOICE_PLANS = {
  event: { amount: 2000,  label: 'Single Competition',                 once: true  },
  pro:   { amount: 15000, label: 'All-In Annual',                      once: false },
}

// Org-level cross-sport profile subscription (Brief #6) — the platform's first
// ORG-level paid feature, distinct from the person-keyed plans above. Price is
// TBD: set PROFILE_SUB_AMOUNT (Rand/yr, VAT incl.) via env when decided; the
// plumbing is built now.
const PROFILE_SUB_AMOUNT = Number(process.env.PROFILE_SUB_AMOUNT || 0)
const PROFILE_SUB_LABEL  = 'Cross-sport profile — annual'

// Set/extend an org's profile subscription. Renewal stacks from the later of
// now and any remaining term (same rule as the person 'pro' plan). Written on
// the org doc only — never client-writable (orgBillingUnchanged guards it).
async function applyProfileSubscription(orgId, { years = 1, lastPaymentId = null }) {
  const ref  = db.doc(`organizations/${orgId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'No such organisation.')
  const cur    = snap.data().profileSubscription || null
  const curExp = cur?.expiresAt?.toDate?.() ?? null
  const from    = curExp && curExp > new Date() ? curExp : new Date()
  const expires = new Date(from); expires.setFullYear(expires.getFullYear() + years)
  await ref.set({
    profileSubscription: {
      status:        'active',
      plan:          'annual',
      startedAt:     (cur?.status === 'active' && cur?.startedAt) ? cur.startedAt : admin.firestore.FieldValue.serverTimestamp(),
      expiresAt:     admin.firestore.Timestamp.fromDate(expires),
      lastPaymentId: lastPaymentId,
    },
  }, { merge: true })
  return snap.data()
}

function cleanBillTo(raw = {}) {
  const s = (v, n) => String(v ?? '').trim().slice(0, n)
  return {
    name:      s(raw.name, 160),      // organisation / school / person the invoice is made out to
    contact:   s(raw.contact, 120),   // contact person at that organisation
    email:     s(raw.email, 200).toLowerCase(),
    address:   s(raw.address, 400),
    vatNumber: s(raw.vatNumber, 40),
    reference: s(raw.reference, 80),  // their own PO / order reference, optional
  }
}

exports.createInvoice = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')

  // Two products: a person-keyed plan (event/pro) OR an org-level cross-sport
  // profile subscription (product:'orgProfile', orgId). Both bill by EFT invoice.
  const product = String(request.data?.product || 'plan')
  let planKey, planLabel, amount, credits = null, years = null, kind = 'plan', orgId = null

  if (product === 'orgProfile') {
    orgId = String(request.data?.orgId || '').trim()
    if (!orgId) throw new HttpsError('invalid-argument', 'orgId required.')
    const orgSnap = await db.doc(`organizations/${orgId}`).get()
    if (!orgSnap.exists) throw new HttpsError('not-found', 'No such organisation.')
    const admin_ = request.auth?.token?.platformAdmin === true
      || (await db.doc(`users/${uid}`).get()).data()?.platformAdmin === true
    if (orgSnap.data().ownerUserId !== uid && !admin_) {
      throw new HttpsError('permission-denied', 'Only the org owner or a platform admin can subscribe.')
    }
    kind = 'orgProfile'; planKey = 'profileAnnual'; planLabel = PROFILE_SUB_LABEL
    amount = PROFILE_SUB_AMOUNT; years = 1
  } else {
    const planDef = INVOICE_PLANS[String(request.data?.plan || '')]
    if (!planDef) throw new HttpsError('invalid-argument', 'Unknown plan.')
    planKey = String(request.data?.plan); planLabel = planDef.label; amount = planDef.amount
    credits = planKey === 'event' ? 1 : null
    years   = planKey === 'pro'   ? 1 : null
  }

  const billTo = cleanBillTo(request.data?.billTo)
  if (!billTo.name || !billTo.email) {
    throw new HttpsError('invalid-argument', 'Invoice name and email are required.')
  }

  const userSnap = await db.doc(`users/${uid}`).get()
  const accountEmail = userSnap.exists ? (userSnap.data().email ?? null) : null

  // Sequential, human-readable number via a counter transaction — an EFT
  // reference has to be short and unambiguous, so no random IDs.
  const counterRef = db.doc('_meta/invoiceCounter')
  const number = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef)
    const seq  = (snap.exists ? snap.data().seq : 0) + 1
    tx.set(counterRef, { seq }, { merge: true })
    return `MP-${new Date().getFullYear()}-${String(seq).padStart(4, '0')}`
  })

  const invoice = {
    number,
    uid,
    accountEmail,
    kind,                               // 'plan' | 'orgProfile'
    orgId,                              // set for orgProfile
    plan:      planKey,
    planLabel,
    credits,
    years,
    amount,                             // Rand, VAT inclusive where applicable
    status:    'outstanding',           // outstanding | paid | void
    billTo,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    paidAt:    null,
    voidedAt:  null,
  }
  const ref = await db.collection('invoices').add(invoice)

  // Email stub: queue the send. Nothing drains this queue yet — when an email
  // sender is wired (Trigger Email extension on `mailQueue`, or a nodemailer/
  // SendGrid function), queued invoices start going out with no further change.
  await db.collection('mailQueue').add({
    kind:      'invoice',
    to:        billTo.email,
    cc:        accountEmail && accountEmail !== billTo.email ? accountEmail : null,
    invoiceId: ref.id,
    number,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    sent:      false,
  })

  logger.info('Invoice created', { number, uid, plan: planKey })
  return { ok: true, id: ref.id, number }
})

exports.markInvoicePaid = onCall({ region: REGION }, async (request) => {
  if (!(await callerIsAdmin(request))) {
    throw new HttpsError('permission-denied', 'Platform admin only.')
  }
  const id = String(request.data?.id || '').trim()
  if (!id) throw new HttpsError('invalid-argument', 'Invoice id required.')

  const invRef  = db.doc(`invoices/${id}`)
  const invSnap = await invRef.get()
  if (!invSnap.exists) throw new HttpsError('not-found', 'No such invoice.')
  const inv = invSnap.data()
  if (inv.status === 'paid') return { ok: true, already: true }
  if (inv.status === 'void') throw new HttpsError('failed-precondition', 'Invoice is void — un-void is not supported; create a new invoice.')

  // Route the grant by product: org-profile subscription → org doc; else the
  // person-keyed entitlement.
  let previousPlan = 'none'
  if (inv.kind === 'orgProfile') {
    await applyProfileSubscription(inv.orgId, { years: inv.years ?? 1, lastPaymentId: id })
  } else {
    const beforeData = await applyEntitlement(inv.uid, {
      plan:    inv.plan,
      credits: inv.credits ?? 1,
      years:   inv.years ?? 1,
    })
    previousPlan = beforeData.entitlement ?? 'none'
  }

  await invRef.update({
    status:    'paid',
    paidAt:    admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    paidByAdmin: request.auth.uid,
  })

  await db.collection('payments').add({
    manual:        true,
    method:        'eft',
    note:          `Invoice ${inv.number} marked paid`,
    invoiceId:     id,
    invoiceNumber: inv.number,
    uid:           inv.uid,
    orgId:         inv.orgId ?? null,
    kind:          inv.kind ?? 'plan',
    email:         inv.accountEmail ?? inv.billTo?.email ?? null,
    plan:          inv.plan,
    amountGross:   inv.amount,
    creditsSet:    inv.plan === 'event' ? (inv.credits ?? 1) : null,
    years:         inv.years ?? null,
    previousPlan,
    adminUid:      request.auth.uid,
    paymentStatus: 'MANUAL',
    receivedAt:    admin.firestore.FieldValue.serverTimestamp(),
  })

  logger.info('Invoice paid', { number: inv.number, uid: inv.uid, by: request.auth.uid })
  return { ok: true }
})

exports.voidInvoice = onCall({ region: REGION }, async (request) => {
  if (!(await callerIsAdmin(request))) {
    throw new HttpsError('permission-denied', 'Platform admin only.')
  }
  const id   = String(request.data?.id || '').trim()
  const note = String(request.data?.note || '').slice(0, 300)
  if (!id) throw new HttpsError('invalid-argument', 'Invoice id required.')

  const invRef  = db.doc(`invoices/${id}`)
  const invSnap = await invRef.get()
  if (!invSnap.exists) throw new HttpsError('not-found', 'No such invoice.')
  if (invSnap.data().status === 'paid') {
    throw new HttpsError('failed-precondition', 'A paid invoice cannot be voided — use a correction in the Access tab instead.')
  }

  // Void rather than delete: the numbering stays gapless on the record, which
  // is what you want when reconciling EFTs against a bank statement.
  await invRef.update({
    status:    'void',
    voidNote:  note,
    voidedAt:  admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    voidedByAdmin: request.auth.uid,
  })
  logger.info('Invoice voided', { id, by: request.auth.uid })
  return { ok: true }
})

// ── submitContactForm ────────────────────────────────────────────────────────
// The Home /#contact form posts here. Callable rather than HTTPS so App Check
// (when enabled) applies and the caller's auth (if any) is attached. Writes to
// /contactMessages/{id} for the admin panel; email delivery to
// michael@matchpulse.co.za is left as a follow-up (needs SMTP or transactional-
// email creds — see README when it's wired).
//
// Basic anti-abuse: reject empty/oversized messages, reject the same email
// posting more than 5 times in an hour. Not a fortress; enough to make it a
// worse target than the countless open forms elsewhere.
const CONTACT_HOURLY_CAP = 5

exports.submitContactForm = onCall({ region: REGION }, async (request) => {
  const name    = String(request.data?.name    || '').trim().slice(0, 120)
  const email   = String(request.data?.email   || '').trim().toLowerCase().slice(0, 200)
  const phone   = String(request.data?.phone   || '').trim().slice(0, 40)
  const message = String(request.data?.message || '').trim().slice(0, 4000)

  if (!name || !email || !message) {
    throw new HttpsError('invalid-argument', 'Name, email and message are required.')
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    throw new HttpsError('invalid-argument', 'That email address doesn\'t look right.')
  }

  // Rate-limit per email address over the last hour.
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
  const recent = await db.collection('contactMessages')
    .where('email', '==', email)
    .where('createdAt', '>=', admin.firestore.Timestamp.fromDate(oneHourAgo))
    .count().get()
  if (recent.data().count >= CONTACT_HOURLY_CAP) {
    throw new HttpsError('resource-exhausted', 'Too many messages — please try again in an hour.')
  }

  await db.collection('contactMessages').add({
    name, email, phone, message,
    fromUid:    request.auth?.uid ?? null,
    userAgent:  String(request.rawRequest?.headers?.['user-agent'] || '').slice(0, 200),
    read:       false,
    createdAt:  admin.firestore.FieldValue.serverTimestamp(),
  })

  // TODO: send email to michael@matchpulse.co.za. Two paths, both need config
  // that isn't in this codebase today:
  //   1) Install the "Trigger Email from Firestore" Firebase Extension against
  //      the contactMessages collection with an SMTP transport, OR
  //   2) Add nodemailer here + a functions secret (GMAIL_APP_PASSWORD /
  //      SENDGRID_API_KEY / …) and send from this function.
  // Until one of those is in place the admin panel's Messages tab is the
  // notification surface — visible immediately after submit.
  logger.info('Contact message received', { email, hasPhone: !!phone })
  return { ok: true }
})

// ═══════════════════════════════════════════════════════════════════════════
// COPY-DOWN ENGINE (Brief #3) — one-way sync of the central org identity + staff
// down into each ACTIVATED sport's named database. Sports never write back; all
// writes here are Admin SDK (bypass rules) via getFirestore(admin.app(), sport).
//
//   activate  →  centralOrgActivate       (callable, owner/admin)
//   identity  →  centralOrgIdentitySync   (trigger on (default) organizations/{id})
//   staff     →  centralOrgStaffSync      (trigger on (default) organizations/{id}/staff/{uid})
//
// Names are `central*` so they can't collide with any sport codebase's globally
// unique function names. All bind to the (default) database / europe-west1.
// ═══════════════════════════════════════════════════════════════════════════

// The four valid sport keys == the named-DB ids (see SPORT_DBS above).
const SPORT_KEYS = SPORT_DBS.map(s => s.key)
const isSportKey = (s) => SPORT_KEYS.includes(s)
const sportDbFor = (sport) => getFirestore(admin.app(), sport)   // dbId === key

// The EXACT identity field set copied down. genderProfile + matchName are in
// (they drive sport-side rules/cards). banner, teamLevelManagement, staff and
// billing are deliberately OUT — never touched by the sync.
const ORG_IDENTITY_FIELDS = [
  'name', 'matchName', 'type', 'slug', 'logoUrl', 'genderProfile',
  'primaryColor', 'secondaryColor', 'bio', 'region', 'website',
  'contactEmail', 'phone', 'socialLinks',
]

function pickIdentity(d = {}) {
  const out = {}
  for (const k of ORG_IDENTITY_FIELDS) out[k] = d[k] ?? null
  return out
}

const asMillis = (v) => (v?.toMillis ? v.toMillis() : (typeof v === 'number' ? v : 0))

// Write the identity set into one sport's org doc, merge:true (so sport-local
// banner/teamLevelManagement/team snapshots survive). Stamps the sport copy's
// updatedAt = the central updatedAt so it becomes the last-write-wins watermark;
// syncedAt/syncedFrom are audit only. Returns true if written, false if skipped.
async function writeIdentityToSport(sport, orgId, identity, centralUpdatedMs) {
  const sportDb = sportDbFor(sport)
  const ref = sportDb.doc(`organizations/${orgId}`)
  const snap = await ref.get()
  // Out-of-order guard: skip if the sport copy is already at/after central.
  if (snap.exists && asMillis(snap.data()?.updatedAt) >= centralUpdatedMs && centralUpdatedMs > 0) {
    return false
  }
  await ref.set({
    ...identity,
    updatedAt:  admin.firestore.Timestamp.fromMillis(centralUpdatedMs || Date.now()),
    syncedFrom: 'central',
    syncedAt:   admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true })
  return true
}

// Activation core, shared by the callable and the Hockey migration's activate
// step. Copies identity + the whole central staff roster into the sport, then
// stamps activatedSports.<sport>. Idempotent (already-active → no-op). Assumes
// the caller has already authorised.
async function activateOrgIntoSport(org, orgId, sport, uid) {
  if (org.activatedSports && org.activatedSports[sport]) {
    return { sport, slug: org.slug, staffCount: null, alreadyActive: true }
  }
  // c. identity into the sport org doc (merge). Clear any prior tombstone —
  // re-activating an org makes it managed again.
  await writeIdentityToSport(sport, orgId, pickIdentity(org), asMillis(org.updatedAt))
  await sportDbFor(sport).doc(`organizations/${orgId}`).set(
    { managed: true, deactivatedAt: null }, { merge: true })

  // d. copy the ENTIRE central staff subcollection down.
  const staffSnap = await db.collection(`organizations/${orgId}/staff`).get()
  const sportDb = sportDbFor(sport)
  let batch = sportDb.batch()
  let n = 0
  for (const s of staffSnap.docs) {
    batch.set(sportDb.doc(`organizations/${orgId}/staff/${s.id}`), s.data(), { merge: true })
    if (++n % 400 === 0) { await batch.commit(); batch = sportDb.batch() }
  }
  if (n % 400 !== 0 || n === 0) await batch.commit()

  // e. record activation centrally (re-fires the identity trigger — harmless).
  await db.doc(`organizations/${orgId}`).set({
    activatedSports: { [sport]: {
      activatedAt: admin.firestore.FieldValue.serverTimestamp(),
      activatedBy: uid,
    } },
  }, { merge: true })

  logger.info('Org activated in sport', { orgId, sport, staffCount: n })
  return { sport, slug: org.slug, staffCount: n }
}

// ── centralOrgActivate ───────────────────────────────────────────────────────
// Activate an org into a sport: copy identity + the whole staff roster down, then
// record it in the central activatedSports map. Idempotent. Guard: owner|admin.
exports.centralOrgActivate = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')

  const orgId = String(request.data?.orgId || '').trim()
  const sport = String(request.data?.sport || '').trim()
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId required.')
  if (!isSportKey(sport)) throw new HttpsError('invalid-argument', `sport must be one of ${SPORT_KEYS.join(', ')}.`)

  const orgSnap = await db.doc(`organizations/${orgId}`).get()
  if (!orgSnap.exists) throw new HttpsError('not-found', 'No such organisation.')
  const org = orgSnap.data()

  const admin_ = request.auth?.token?.platformAdmin === true
    || (await db.doc(`users/${uid}`).get()).data()?.platformAdmin === true
  if (org.ownerUserId !== uid && !admin_) {
    throw new HttpsError('permission-denied', 'Only the org owner or a platform admin can activate.')
  }

  return activateOrgIntoSport(org, orgId, sport, uid)
})

// ── centralOrgDeactivate ──────────────────────────────────────────────────────
// Reverse activation for ONE sport. Clears activatedSports.<sport> centrally
// (which stops the identity/staff syncs and unblocks central deletion) and
// TOMBSTONES the sport org copy — the identity doc is kept and marked
// { managed:false, deactivatedAt }, so historical matches still resolve this
// org's crest and name on opponents' pages. Never touches matches or teams.
// Guard: owner|admin. Idempotent (already-inactive → no-op).
exports.centralOrgDeactivate = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')

  const orgId = String(request.data?.orgId || '').trim()
  const sport = String(request.data?.sport || '').trim()
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId required.')
  if (!isSportKey(sport)) throw new HttpsError('invalid-argument', `sport must be one of ${SPORT_KEYS.join(', ')}.`)

  const ref = db.doc(`organizations/${orgId}`)
  const snap = await ref.get()
  if (!snap.exists) throw new HttpsError('not-found', 'No such organisation.')
  const org = snap.data()

  const isAdmin = request.auth?.token?.platformAdmin === true
    || (await db.doc(`users/${uid}`).get()).data()?.platformAdmin === true
  if (org.ownerUserId !== uid && !isAdmin) {
    throw new HttpsError('permission-denied', 'Only the org owner or a platform admin can deactivate.')
  }

  if (!org.activatedSports || !org.activatedSports[sport]) {
    return { sport, alreadyInactive: true }
  }

  // Tombstone the sport copy (kept so shared matches keep this org's crest/name).
  try {
    await sportDbFor(sport).doc(`organizations/${orgId}`).set({
      managed: false,
      deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true })
  } catch (err) {
    logger.warn('deactivate: tombstone write failed', { orgId, sport, message: err.message })
  }

  // Clear the central activation flag — stops future syncs, unblocks delete.
  await ref.update({ [`activatedSports.${sport}`]: admin.firestore.FieldValue.delete() })

  logger.info('Org deactivated in sport', { orgId, sport })
  return { sport, deactivated: true }
})

// ── centralOrgIdentitySync ───────────────────────────────────────────────────
// On any central org create/update, overwrite the identity set into EVERY
// activated sport (whole set at once, merge:true, out-of-order guarded).
exports.centralOrgIdentitySync = onDocumentWritten(
  { document: 'organizations/{orgId}', region: REGION },
  async (event) => {
    const after = event.data?.after?.data()
    if (!after) return                                   // org deleted — leave sport copies
    const { orgId } = event.params
    const active = after.activatedSports || {}
    const sports = Object.keys(active).filter(isSportKey)
    if (sports.length === 0) return

    const identity = pickIdentity(after)
    const centralMs = asMillis(after.updatedAt)
    await Promise.all(sports.map(async (sport) => {
      try {
        await writeIdentityToSport(sport, orgId, identity, centralMs)
      } catch (err) {
        logger.error('centralOrgIdentitySync: write failed', { orgId, sport, message: err.message })
      }
    }))
    logger.info('Org identity synced', { orgId, sports })
  }
)

// ── centralOrgStaffSync ──────────────────────────────────────────────────────
// On a central staff doc create/update → mirror it into every activated sport's
// staff/{uid}; on delete → delete it in every activated sport. Staff is managed
// once, centrally; the sport copy stays exactly the authorisation record the
// (unchanged) sport rules already read.
exports.centralOrgStaffSync = onDocumentWritten(
  { document: 'organizations/{orgId}/staff/{uid}', region: REGION },
  async (event) => {
    const { orgId, uid } = event.params
    const after = event.data?.after?.data()

    const orgSnap = await db.doc(`organizations/${orgId}`).get()
    if (!orgSnap.exists) return
    const sports = Object.keys(orgSnap.data().activatedSports || {}).filter(isSportKey)
    if (sports.length === 0) return

    await Promise.all(sports.map(async (sport) => {
      try {
        const ref = sportDbFor(sport).doc(`organizations/${orgId}/staff/${uid}`)
        if (after) await ref.set(after, { merge: true })   // create/update
        else       await ref.delete()                      // revoked
      } catch (err) {
        logger.error('centralOrgStaffSync: write failed', { orgId, uid, sport, message: err.message })
      }
    }))
    logger.info('Org staff synced', { orgId, uid, deleted: !after, sports })
  }
)

// ═══════════════════════════════════════════════════════════════════════════
// HOCKEY ORG MIGRATION (Brief #5) — one-time, one-way (Hockey → central).
// Admin-only. Reads hockey/organizations, writes (default)/organizations with
// the SAME doc id (id parity keeps central/Hockey/future sports in lockstep),
// derives ownerUserId from Hockey's staff, copies the staff roster up, and
// seeds orgSlugs. Leaves activatedSports EMPTY (safety gate) so nothing is
// written back to Hockey until a separate activate step. Never writes to Hockey.
// Re-running upserts the same ids — idempotent, no duplicates.
// ═══════════════════════════════════════════════════════════════════════════

const HOCKEY_MIGRATE_FIELDS = ORG_IDENTITY_FIELDS   // same 14 identity fields

// Owner = a Hockey staff doc with role 'owner' and NO teamId (org-wide).
function deriveOwner(staffDocs, hockeyCreatedBy) {
  const owners = staffDocs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(s => s.role === 'owner' && (s.teamId == null || s.teamId === ''))
  if (owners.length === 1) return { ownerUserId: owners[0].uid, ownerSource: 'staff-owner' }
  if (owners.length === 0) {
    return hockeyCreatedBy
      ? { ownerUserId: hockeyCreatedBy, ownerSource: 'createdBy-fallback' }
      : { ownerUserId: null, ownerSource: 'none', flag: 'no-owner' }
  }
  return { ownerUserId: owners[0].uid, ownerSource: 'ambiguous-first', flag: 'ambiguous-owner', candidates: owners.map(o => o.uid) }
}

exports.centralMigrateHockeyOrgs = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  if (!(await callerIsAdmin(request))) throw new HttpsError('permission-denied', 'Platform admin only.')
  const commit = request.data?.commit === true
  const uid = request.auth.uid

  const hockey = sportDbFor('hockey')
  const orgSnap = await hockey.collection('organizations').get()

  const rows = []
  const collisions = []
  const ambiguities = []

  for (const d of orgSnap.docs) {
    const hid = d.id
    const h = d.data() || {}
    const identity = {}
    for (const k of HOCKEY_MIGRATE_FIELDS) identity[k] = h[k] ?? null
    // bio: Hockey's bio, else its (dropped) description as the source text.
    identity.bio = (h.bio ?? h.description ?? '') || ''

    const staffDocs = (await hockey.collection(`organizations/${hid}/staff`).get()).docs
    const owner = deriveOwner(staffDocs, h.createdBy ?? null)
    if (owner.flag) ambiguities.push({ orgId: hid, name: h.name ?? null, slug: h.slug ?? null, ...owner })

    // Slug collision: an existing central reservation for a DIFFERENT org id.
    const slug = h.slug ?? null
    let collision = null
    if (slug) {
      const resv = await db.doc(`orgSlugs/${slug}`).get()
      if (resv.exists && resv.data().orgId !== hid) {
        collision = { slug, existingOrgId: resv.data().orgId, hockeyOrgId: hid }
        collisions.push(collision)
      }
    }

    rows.push({
      orgId: hid,
      name: h.name ?? null,
      slug,
      type: h.type ?? null,
      genderProfile: h.genderProfile ?? null,
      matchName: h.matchName ?? null,
      ownerUserId: owner.ownerUserId,
      ownerSource: owner.ownerSource,
      staffCount: staffDocs.length,
      hasLogo: !!identity.logoUrl,
      collision,
      _identity: identity,
      _staff: staffDocs.map(s => ({ id: s.id, data: s.data() })),
      _hCreatedAt: h.createdAt ?? null,
      _hCreatedBy: h.createdBy ?? null,
    })
  }

  // Never write when a slug collides — stop and report for a hand tie-break.
  if (commit && collisions.length > 0) {
    throw new HttpsError('failed-precondition',
      `Slug collision(s) — resolve by hand, nothing written: ${collisions.map(c => c.slug).join(', ')}`)
  }

  let written = 0
  if (commit) {
    for (const r of rows) {
      const orgRef = db.doc(`organizations/${r.orgId}`)
      const existing = await orgRef.get()
      // createdAt: keep existing central, else Hockey's, else now.
      const createdAt = existing.exists
        ? (existing.data().createdAt ?? r._hCreatedAt ?? admin.firestore.FieldValue.serverTimestamp())
        : (r._hCreatedAt ?? admin.firestore.FieldValue.serverTimestamp())
      // Identity + ownership. activatedSports is NOT written — stays empty on
      // first migrate (safety gate) and untouched on re-run.
      await orgRef.set({
        ...r._identity,
        slug:        r.slug,
        ownerUserId: r.ownerUserId,
        createdBy:   r._hCreatedBy ?? r.ownerUserId ?? uid,
        createdAt,
        updatedAt:   admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true })

      // Staff roster up into central.
      let batch = db.batch(); let n = 0
      for (const s of r._staff) {
        batch.set(db.doc(`organizations/${r.orgId}/staff/${s.id}`), s.data, { merge: true })
        if (++n % 400 === 0) { await batch.commit(); batch = db.batch() }
      }
      if (n % 400 !== 0 || n === 0) await batch.commit()

      // Seed the slug reservation (idempotent).
      if (r.slug) {
        await db.doc(`orgSlugs/${r.slug}`).set({
          orgId: r.orgId, createdBy: r._hCreatedBy ?? r.ownerUserId ?? uid,
          createdAt: r._hCreatedAt ?? admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true })
      }
      written++
    }
  }

  // Strip internal fields from the report.
  const report = rows.map(({ _identity, _staff, _hCreatedAt, _hCreatedBy, ...pub }) => pub)
  logger.info('Hockey org migration', { commit, count: rows.length, written, collisions: collisions.length })
  return {
    commit,
    count: rows.length,
    written,
    orgs: report,
    slugSeed: rows.filter(r => r.slug).map(r => ({ slug: r.slug, orgId: r.orgId })),
    collisions,
    ambiguities,
  }
})

// Activate every migrated Hockey org into Hockey (step 7). Admin-only. Only run
// AFTER eyeballing central. For each Hockey org id, activates the central doc
// into Hockey (identity + staff down, stamp activatedSports.hockey). Idempotent.
exports.centralActivateHockeyOrgs = onCall({ region: REGION, timeoutSeconds: 300 }, async (request) => {
  if (!(await callerIsAdmin(request))) throw new HttpsError('permission-denied', 'Platform admin only.')
  const uid = request.auth.uid

  const hockey = sportDbFor('hockey')
  const ids = (await hockey.collection('organizations').get()).docs.map(d => d.id)

  const results = []
  for (const orgId of ids) {
    const snap = await db.doc(`organizations/${orgId}`).get()
    if (!snap.exists) { results.push({ orgId, skipped: 'no-central-doc' }); continue }
    try {
      const res = await activateOrgIntoSport(snap.data(), orgId, 'hockey', uid)
      results.push({ orgId, ...res })
    } catch (err) {
      results.push({ orgId, error: err.message })
    }
  }
  logger.info('Hockey orgs activated', { count: results.length })
  return { count: results.length, results }
})

// ── adminSetProfileSubscription ──────────────────────────────────────────────
// Admin grant/revoke of an org's cross-sport profile subscription (comp, EFT
// received off-invoice, correction). Grant extends by `years`; revoke locks it.
exports.adminSetProfileSubscription = onCall({ region: REGION }, async (request) => {
  if (!(await callerIsAdmin(request))) throw new HttpsError('permission-denied', 'Platform admin only.')
  const orgId  = String(request.data?.orgId || '').trim()
  const action = String(request.data?.action || 'grant')
  const years  = Math.max(1, Math.floor(Number(request.data?.years) || 1))
  if (!orgId) throw new HttpsError('invalid-argument', 'orgId required.')

  if (action === 'revoke') {
    await db.doc(`organizations/${orgId}`).set({
      profileSubscription: { status: 'none', plan: 'annual', expiresAt: null, startedAt: null, lastPaymentId: null },
    }, { merge: true })
    logger.info('Profile subscription revoked', { orgId, by: request.auth.uid })
    return { ok: true, status: 'none' }
  }
  await applyProfileSubscription(orgId, { years, lastPaymentId: `admin:${request.auth.uid}` })
  logger.info('Profile subscription granted', { orgId, years, by: request.auth.uid })
  return { ok: true, status: 'active' }
})

// ═══════════════════════════════════════════════════════════════════════════
// CROSS-SPORT ORG PROFILE (Brief #6, Part B) — resolve slug → org, enforce the
// paid gate, and aggregate fixtures/results across the org's activated sports
// by reading each sport's `matches` with the Admin SDK. Identity is free; the
// aggregated matches are the paid feature. Cross-DB reads are cached in-memory
// per instance (up to 4 sports × 2 queries per view — read cost is real).
// ═══════════════════════════════════════════════════════════════════════════

const PROFILE_IDENTITY_FIELDS = [...ORG_IDENTITY_FIELDS, 'bannerUrl']
const MATCH_CAP = 60                              // per sport, per direction
const AGG_CACHE = new Map()                       // orgId → { at, data }
const AGG_TTL_MS = 5 * 60 * 1000

function subActive(org) {
  const s = org.profileSubscription
  return !!s && s.status === 'active' && (s.expiresAt?.toMillis ? s.expiresAt.toMillis() : 0) > Date.now()
}

function matchToMillis(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v.toMillis === 'function') return v.toMillis()
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? null : t
}

function mapMatch(doc, sport) {
  const m = doc.data() || {}
  return {
    id:         doc.id,
    sport,
    status:     m.status ?? null,
    matchDate:  matchToMillis(m.matchDate) ?? matchToMillis(m.scheduledAt),
    homeDisplay: m.homeDisplay ?? m.homeName ?? null,
    awayDisplay: m.awayDisplay ?? m.awayName ?? null,
    homeScore:  m.homeScore ?? null,
    awayScore:  m.awayScore ?? null,
    homeOrgId:  m.homeOrgId ?? null,
    awayOrgId:  m.awayOrgId ?? null,
    homeColor:  m.homeTeamColor ?? null,
    awayColor:  m.awayTeamColor ?? null,
    venue:      m.venue ?? m.pitch ?? null,
    url:        m.path ? `https://${sport}.matchpulse.co.za${m.path}` : null,
  }
}

async function aggregateSportMatches(sport, orgId) {
  const sportDb = sportDbFor(sport)
  const col = sportDb.collection('matches')
  // Two queries (home OR away), unioned + de-duped.
  const [homeSnap, awaySnap] = await Promise.all([
    col.where('homeOrgId', '==', orgId).limit(MATCH_CAP).get(),
    col.where('awayOrgId', '==', orgId).limit(MATCH_CAP).get(),
  ])
  const seen = new Map()
  for (const d of [...homeSnap.docs, ...awaySnap.docs]) if (!seen.has(d.id)) seen.set(d.id, mapMatch(d, sport))
  const all = [...seen.values()]

  // Matches carry org ids, not logos — resolve each side's crest from this
  // sport's `organizations` (the same source the sport site renders from).
  const ids = new Set()
  for (const m of all) { if (m.homeOrgId) ids.add(m.homeOrgId); if (m.awayOrgId) ids.add(m.awayOrgId) }
  const logos = {}
  if (ids.size) {
    const refs = [...ids].map(id => sportDb.doc(`organizations/${id}`))
    const snaps = await sportDb.getAll(...refs)
    for (const s of snaps) if (s.exists) logos[s.id] = s.data()?.logoUrl || null
  }
  for (const m of all) {
    m.homeLogoUrl = m.homeOrgId ? (logos[m.homeOrgId] || null) : null
    m.awayLogoUrl = m.awayOrgId ? (logos[m.awayOrgId] || null) : null
  }

  const results  = all.filter(m => m.status === 'final').sort((a, b) => (b.matchDate ?? 0) - (a.matchDate ?? 0))
  const fixtures = all.filter(m => m.status !== 'final' && m.status !== 'cancelled').sort((a, b) => (a.matchDate ?? Infinity) - (b.matchDate ?? Infinity))
  return { fixtures, results }
}

async function aggregateMatches(orgId, sports) {
  const cached = AGG_CACHE.get(orgId)
  if (cached && Date.now() - cached.at < AGG_TTL_MS) return cached.data
  const out = {}
  await Promise.all(sports.map(async (sport) => {
    try { out[sport] = await aggregateSportMatches(sport, orgId) }
    catch (err) { logger.warn('aggregateMatches failed', { orgId, sport, message: err.message }); out[sport] = { fixtures: [], results: [], error: 'unreadable' } }
  }))
  AGG_CACHE.set(orgId, { at: Date.now(), data: out })
  return out
}

exports.getOrgProfile = onCall({ region: REGION }, async (request) => {
  const slug = String(request.data?.slug || '').trim().toLowerCase()
  if (!slug) throw new HttpsError('invalid-argument', 'slug required.')

  // Resolve slug → orgId via the registry, then read the org.
  const resv = await db.doc(`orgSlugs/${slug}`).get()
  if (!resv.exists) throw new HttpsError('not-found', 'No such organisation.')
  const orgSnap = await db.doc(`organizations/${resv.data().orgId}`).get()
  if (!orgSnap.exists) throw new HttpsError('not-found', 'No such organisation.')
  const org = orgSnap.data()
  const orgId = orgSnap.id

  const identity = { id: orgId }
  for (const k of PROFILE_IDENTITY_FIELDS) identity[k] = org[k] ?? null

  const sports = Object.keys(org.activatedSports || {}).filter(isSportKey)
  const active = subActive(org)

  if (!active) {
    return { org: identity, activatedSports: sports, locked: true }
  }
  const matches = await aggregateMatches(orgId, sports)
  return { org: identity, activatedSports: sports, locked: false, matches }
})

// ═══════════════════════════════════════════════════════════════════════════
// getTournaments — public cross-sport tournaments directory.
// Reads each sport DB's `competitions` collection with the Admin SDK (rules
// can't list across databases), keeps only published ones, and returns a
// compact card shape with a link OUT to that competition's overview page on its
// own sport subdomain. Free / public. Cached in-memory per instance (5-min TTL).
// The URL + lifecycle helpers mirror the sport sites' slugify.competitionUrl and
// competitionRules.competitionLifecycle so links and status badges match.
// ═══════════════════════════════════════════════════════════════════════════

const TOURN_CAP = 300                        // per sport
const TOURN_CACHE = { at: 0, data: null }

function compToMs(v) {
  if (v == null) return null
  if (typeof v === 'number') return v
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (v instanceof Date) return v.getTime()
  const t = new Date(v).getTime()
  return Number.isNaN(t) ? null : t
}

// Derived lifecycle: upcoming | live | completed (from start/end datetimes).
function compLifecycle(c, now = Date.now()) {
  const s = compToMs(c.startDate), e = compToMs(c.endDate)
  if (s != null && now < s) return 'upcoming'
  if (e != null && now > e) return 'completed'
  if (s != null && now >= s) return 'live'
  return 'upcoming'
}

// Public path on the sport site — mirrors slugify.competitionUrl exactly.
function competitionPublicPath(c) {
  if (c.slug && c.season) return `/competitions/${c.season}/${c.slug}`
  if (c.competitionPath)  return `/competition/${c.competitionPath}`
  return `/competitions/${c.id}`
}

async function readSportCompetitions(sport) {
  const snap = await sportDbFor(sport).collection('competitions').limit(TOURN_CAP).get()
  const out = []
  for (const doc of snap.docs) {
    const c = { id: doc.id, ...doc.data() }
    if (c.published === false) continue      // unpublished = hidden from public
    out.push({
      id: c.id, sport,
      name:      c.name ?? 'Untitled competition',
      season:    c.season ?? null,
      gender:    c.gender ?? null,
      ageGroup:  c.ageGroup ?? null,
      type:      c.type ?? null,
      logoUrl:   c.logoUrl ?? null,
      bannerUrl: c.bannerUrl ?? null,
      status:    compLifecycle(c),
      startDate: compToMs(c.startDate),
      endDate:   compToMs(c.endDate),
      url:       `https://${sport}.matchpulse.co.za${competitionPublicPath(c)}`,
    })
  }
  return out
}

exports.getTournaments = onCall({ region: REGION }, async () => {
  if (TOURN_CACHE.data && Date.now() - TOURN_CACHE.at < AGG_TTL_MS) {
    return { tournaments: TOURN_CACHE.data }
  }
  const per = await Promise.all(SPORT_KEYS.map(async (sport) => {
    try { return await readSportCompetitions(sport) }
    catch (err) { logger.warn('getTournaments sport failed', { sport, message: err.message }); return [] }
  }))
  const tournaments = per.flat()
  TOURN_CACHE.data = tournaments
  TOURN_CACHE.at = Date.now()
  return { tournaments }
})
