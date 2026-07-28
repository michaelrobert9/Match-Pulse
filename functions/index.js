/**
 * MatchPulse main site — Cloud Functions.
 *
 * Scope: account, auth handoff, and (next) plan purchase. Nothing sport-specific.
 * Region is europe-west1 to match the rest of the platform — africa-south1 is
 * the Firestore region only.
 */

const { onCall, onRequest, HttpsError } = require('firebase-functions/v2/https')
const logger = require('firebase-functions/logger')
const admin  = require('firebase-admin')
const crypto = require('crypto')

admin.initializeApp()

const db = admin.firestore()          // (default) — identity, orgs, entitlements
// Deploy region for every function here. Must match what the clients call with
// (src/lib and each sport's getFunctions call) and the hosting rewrite below —
// a mismatch fails at call time, not deploy time. Firestore's africa-south1 is a
// SEPARATE setting and does not constrain this.
const REGION = process.env.FUNCTIONS_REGION || 'europe-west1'

// ── Sport registry ────────────────────────────────────────────────────────────
// Mirrors src/lib/sports.js. This copy is the SECURITY BOUNDARY: it is the
// allowlist of hosts we will ever redirect a ticket to. Never build a redirect
// target from client input.
const SPORT_HOSTS = {
  hockey:    'https://match-pulse-hockey.web.app',
  netball:   'https://match-pulse-netball-9701f.web.app',
  rugby:     'https://match-pulse-4560e-ff0fe.web.app',
  waterpolo: 'https://match-pulse-waterpolo-f9b4c.web.app',
}

const TICKET_TTL_MS = 60 * 1000   // 60 seconds — long enough for a redirect

const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex')

// Only ever accept a relative path, so `path` can't be turned into an offsite
// redirect. Reject protocol-relative ("//evil.com") and absolute URLs.
function safePath(input) {
  const p = typeof input === 'string' ? input.trim() : '/'
  if (!p.startsWith('/') || p.startsWith('//')) return '/'
  return p
}

// ── createHandoffTicket ───────────────────────────────────────────────────────
// Called by a SIGNED-IN user on the main site. Returns a URL carrying a
// single-use ticket in the fragment. See ARCHITECTURE.md §2.
exports.createHandoffTicket = onCall({ region: REGION }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first.')

  const sport = request.data?.sport
  const host  = SPORT_HOSTS[sport]
  if (!host) throw new HttpsError('invalid-argument', `Unknown sport: ${sport}`)

  const path   = safePath(request.data?.path)
  const ticket = crypto.randomBytes(32).toString('base64url')

  // Store only the HASH. A database leak then yields nothing usable.
  await db.collection('authHandoffs').doc(sha256(ticket)).set({
    uid,
    sport,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + TICKET_TTL_MS),
    usedAt:    null,
  })

  logger.info('Handoff ticket issued', { uid, sport })
  return {
    url: `${host}/auth/handoff#t=${ticket}&p=${encodeURIComponent(path)}`,
    expiresInMs: TICKET_TTL_MS,
  }
})

// ── redeemHandoffTicket ───────────────────────────────────────────────────────
// Called by the SPORT app, which has no session yet — so this is deliberately
// unauthenticated. The ticket itself is the credential. Burning it is atomic:
// a replay loses the transaction and gets nothing.
exports.redeemHandoffTicket = onCall({ region: REGION }, async (request) => {
  const ticket = request.data?.ticket
  if (typeof ticket !== 'string' || !ticket) {
    throw new HttpsError('invalid-argument', 'Missing ticket.')
  }

  const ref = db.collection('authHandoffs').doc(sha256(ticket))

  const uid = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('permission-denied', 'This sign-in link is not valid.')

    const d = snap.data()
    if (d.usedAt) throw new HttpsError('permission-denied', 'This sign-in link has already been used.')
    if (d.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError('deadline-exceeded', 'This sign-in link has expired. Please try again.')
    }

    tx.update(ref, { usedAt: admin.firestore.FieldValue.serverTimestamp() })
    return d.uid
  })

  const token = await admin.auth().createCustomToken(uid)
  logger.info('Handoff ticket redeemed', { uid })
  return { token }
})

// ── syncUserClaims — DEPLOYED FROM THE HOCKEY REPO, DO NOT DUPLICATE ──────────
// This trigger mirrors entitlement onto each user's Auth custom claims whenever
// users/{uid} changes. The ITN below depends on it: without it a payment updates
// the document but never reaches the token the sport subdomains actually gate on.
//
// It is NOT defined here because Cloud Function names are unique per project —
// declaring it in a second codebase collides at deploy time. So hockey MUST keep
// deploying it until it is moved here in a single coordinated change.
// See ARCHITECTURE.md §6.

// ── PayFast ITN webhook ───────────────────────────────────────────────────────
// PayFast POSTs here after every payment event. This is the ONLY thing that
// grants a plan — the checkout itself is a hosted PayFast page, so nothing else
// in the platform learns that money changed hands.
//
// Reached at https://matchpulse.co.za/payfast/itn via the hosting rewrite, which
// is exactly the notify_url baked into the payment buttons.
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
    const res  = await fetch(`${PAYFAST_HOSTS[sandbox ? 'sandbox' : 'live']}/eng/query/validate`, {
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
      // Money took, account unknown. Leave processed:false and shout — this is
      // the case a human must reconcile from the payments collection.
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
