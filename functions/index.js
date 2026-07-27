/**
 * MatchPulse main site — Cloud Functions.
 *
 * Scope: account, auth handoff, and (next) plan purchase. Nothing sport-specific.
 * Region is europe-west1 to match the rest of the platform — africa-south1 is
 * the Firestore region only.
 */

const { onCall, HttpsError } = require('firebase-functions/v2/https')
const logger = require('firebase-functions/logger')
const admin  = require('firebase-admin')
const crypto = require('crypto')

admin.initializeApp()

const db = admin.firestore()          // (default) — identity, orgs, entitlements
const REGION = 'europe-west1'

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

// ── syncUserClaims ────────────────────────────────────────────────────────────
// NOTE: this trigger already exists in the hockey repo, watching the same
// users/{uid} documents in (default). It is intentionally NOT duplicated here —
// two deployments of the same trigger would double-write claims. It moves to
// this repo as part of the billing migration (ARCHITECTURE.md §6, item 3).
