#!/usr/bin/env node
/**
 * Refresh `organizations` in `(default)` from the authoritative `hockey` copy.
 *
 * IMPORTANT CONTEXT — the target is NOT empty.
 * `(default)` was originally the hockey database. When hockey moved to its own
 * named database, the old collections were left behind and merely walled off
 * (rules dropped, indexes emptied) — dropping rules does not delete data. So
 * `(default)/organizations` almost certainly still holds a STALE copy of every
 * org, frozen at the split date, with the SAME document IDs.
 *
 * Meanwhile `hockey` has kept taking live writes — including org billing
 * (`consumeEventCredit` and `fetchOrgEntitlement` both target the hockey DB).
 *
 * Therefore, until cutover: **`hockey` is authoritative and overwrites the
 * target wholesale, billing fields included.** That is the opposite of what you
 * want AFTER cutover, when `(default)` becomes the source of truth — pass
 * --preserve-billing then.
 *
 * Document IDs are PRESERVED. Every reference in the platform is by
 * `ownerOrgId`, so preserving IDs means nothing needs reference rewriting.
 *
 * The source database is never modified. Safe to run repeatedly while live.
 *
 * Usage:
 *   # dry run (default) — reports drift between source and stale target
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/migrate-orgs-to-default.mjs
 *
 *   # apply
 *   ... --commit
 *
 *   # post-cutover re-run: keep the target's billing fields
 *   ... --commit --preserve-billing
 *
 *   # leave already-present docs untouched (rarely what you want here)
 *   ... --commit --skip-existing
 *
 * Requires: npm i firebase-admin
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const COMMIT          = process.argv.includes('--commit')
const PRESERVE_BILLING = process.argv.includes('--preserve-billing')
const SKIP_EXISTING   = process.argv.includes('--skip-existing')
const PROJECT         = process.env.FIREBASE_PROJECT_ID || 'match-pulse-4560e'

// Written only by the PayFast ITN / credit consumption. Pre-cutover these live
// in the hockey DB and must be carried across; post-cutover the target owns
// them and --preserve-billing protects them.
const BILLING_FIELDS = ['entitlement', 'eventCredits', 'entitlementExpiresAt', 'entitlementUpdatedAt']

// `staff` is the authority source for org membership, so it travels with the org.
const SUBCOLLECTIONS = ['staff']

const app       = initializeApp({ credential: applicationDefault(), projectId: PROJECT })
const dbHockey  = getFirestore(app, 'hockey')
const dbDefault = getFirestore(app)

const log = (...a) => console.log(...a)

const ts = (v) => {
  const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null)
  return d && !isNaN(d) ? d.toISOString().slice(0, 10) : '—'
}

/** Compare source vs stale target so the dry run is actually informative. */
function describeDrift(src, dst) {
  if (!dst) return 'target missing — will create'
  const bits = []
  if (src.name !== dst.name) bits.push(`name "${dst.name}" → "${src.name}"`)
  for (const f of BILLING_FIELDS) {
    const a = JSON.stringify(dst[f] ?? null), b = JSON.stringify(src[f] ?? null)
    if (a !== b) bits.push(`${f} ${a} → ${b}`)
  }
  const su = ts(src.updatedAt), du = ts(dst.updatedAt)
  if (su !== du) bits.push(`updatedAt ${du} → ${su}`)
  return bits.length ? bits.join('; ') : 'identical'
}

async function copySubcollections(srcRef, dstRef, stats) {
  for (const name of SUBCOLLECTIONS) {
    const snap = await srcRef.collection(name).get()
    if (snap.empty) continue
    for (const doc of snap.docs) {
      stats.subdocs++
      if (COMMIT) await dstRef.collection(name).doc(doc.id).set(doc.data(), { merge: true })
    }
    log(`      └─ ${name}: ${snap.size} doc(s)`)
  }
}

async function main() {
  log(`\nMatchPulse — organizations refresh  (hockey ➜ default)`)
  log(`project : ${PROJECT}`)
  log(`mode    : ${COMMIT ? 'COMMIT — writing' : 'DRY RUN — no writes'}`)
  log(`billing : ${PRESERVE_BILLING ? 'preserved on target (post-cutover)' : 'overwritten from hockey (pre-cutover)'}\n`)

  const src = await dbHockey.collection('organizations').get()
  if (src.empty) { log('No organizations in the hockey database. Nothing to do.'); return }

  const stats = { total: src.size, created: 0, refreshed: 0, identical: 0, skipped: 0, subdocs: 0 }

  for (const doc of src.docs) {
    const dstRef = dbDefault.collection('organizations').doc(doc.id)   // ID preserved
    const dstSnap = await dstRef.get()
    const data    = doc.data()
    const dstData = dstSnap.exists ? dstSnap.data() : null
    const drift   = describeDrift(data, dstData)

    if (dstSnap.exists && SKIP_EXISTING) {
      stats.skipped++
      log(`  =  ${doc.id}  ${data.name ?? '(unnamed)'} — skipped`)
      continue
    }

    const payload = { ...data }
    if (dstSnap.exists && PRESERVE_BILLING) for (const f of BILLING_FIELDS) delete payload[f]

    if (!dstSnap.exists)            { stats.created++;   log(`  +  ${doc.id}  ${data.name ?? '(unnamed)'} — creating`) }
    else if (drift === 'identical') { stats.identical++; log(`  =  ${doc.id}  ${data.name ?? '(unnamed)'} — already current`) }
    else                            { stats.refreshed++; log(`  ~  ${doc.id}  ${data.name ?? '(unnamed)'}\n      drift: ${drift}`) }

    payload.syncedFrom = 'hockey'
    payload.syncedAt   = new Date()

    if (COMMIT) await dstRef.set(payload, { merge: true })
    await copySubcollections(doc.ref, dstRef, stats)
  }

  log(`\n──────────────────────────────────────────`)
  log(`  source orgs   : ${stats.total}`)
  log(`  created       : ${stats.created}`)
  log(`  refreshed     : ${stats.refreshed}`)
  log(`  already current: ${stats.identical}`)
  log(`  skipped       : ${stats.skipped}`)
  log(`  staff docs    : ${stats.subdocs}`)
  log(`──────────────────────────────────────────`)
  log(COMMIT
    ? `\nDone. The hockey database was not modified.\n`
    : `\nDry run only — nothing written. Re-run with --commit to apply.\n`)
}

main().catch(err => { console.error('\nRefresh failed:', err); process.exit(1) })
