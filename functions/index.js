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
