#!/usr/bin/env node
/**
 * Backfill: copy `organizations` from the `hockey` database into `(default)`.
 *
 * This is step 2 of the expand → migrate → contract plan in ARCHITECTURE.md §5.
 * It is a COPY, not a move: the source is never modified, so it is safe to run
 * while hockey is live and can be re-run freely.
 *
 * Document IDs are PRESERVED. That is the whole point — every reference in the
 * platform is by `ownerOrgId`, so preserving IDs means no reference anywhere
 * needs rewriting.
 *
 * Idempotent: re-running skips docs already present in the target unless
 * --overwrite is passed. Entitlement fields on an existing target doc are never
 * clobbered by default (the target is authoritative for billing once live).
 *
 * Usage:
 *   # dry run (default — writes nothing, prints what it would do)
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/migrate-orgs-to-default.mjs
 *
 *   # execute
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/migrate-orgs-to-default.mjs --commit
 *
 *   # execute, replacing non-billing fields on docs that already exist
 *   ... --commit --overwrite
 *
 * Requires: npm i firebase-admin
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const COMMIT    = process.argv.includes('--commit')
const OVERWRITE = process.argv.includes('--overwrite')
const PROJECT   = process.env.FIREBASE_PROJECT_ID || 'match-pulse-4560e'

// Billing fields are written only by the PayFast ITN (Admin SDK). Once a target
// doc exists, these are authoritative there and must never be overwritten by a
// stale copy from the source database.
const BILLING_FIELDS = ['entitlement', 'eventCredits', 'entitlementExpiresAt', 'entitlementUpdatedAt']

// Subcollections carried across with each org. `staff` is the authority source
// for membership, so it must travel with the org.
const SUBCOLLECTIONS = ['staff']

const app       = initializeApp({ credential: applicationDefault(), projectId: PROJECT })
const dbHockey  = getFirestore(app, 'hockey')
const dbDefault = getFirestore(app)

function log(...a) { console.log(...a) }

async function copySubcollections(srcRef, dstRef, stats) {
  for (const name of SUBCOLLECTIONS) {
    const snap = await srcRef.collection(name).get()
    if (snap.empty) continue
    for (const doc of snap.docs) {
      stats.subdocs++
      if (!COMMIT) continue
      await dstRef.collection(name).doc(doc.id).set(doc.data(), { merge: true })
    }
    log(`      └─ ${name}: ${snap.size} doc(s)`)
  }
}

async function main() {
  log(`\nMatchPulse — organizations backfill  (hockey → default)`)
  log(`project : ${PROJECT}`)
  log(`mode    : ${COMMIT ? 'COMMIT — writing' : 'DRY RUN — no writes'}${OVERWRITE ? ' (overwrite on)' : ''}\n`)

  const src = await dbHockey.collection('organizations').get()
  if (src.empty) { log('No organizations found in the hockey database. Nothing to do.'); return }

  const stats = { total: src.size, created: 0, skipped: 0, updated: 0, subdocs: 0 }

  for (const doc of src.docs) {
    const dstRef = dbDefault.collection('organizations').doc(doc.id)   // ID preserved
    const dst    = await dstRef.get()
    const data   = doc.data()

    if (dst.exists && !OVERWRITE) {
      stats.skipped++
      log(`  =  ${doc.id}  ${data.name ?? '(unnamed)'} — exists, skipped`)
      continue
    }

    // Never let a stale source copy clobber live billing state in the target.
    const payload = { ...data }
    if (dst.exists) {
      for (const f of BILLING_FIELDS) delete payload[f]
      stats.updated++
      log(`  ~  ${doc.id}  ${data.name ?? '(unnamed)'} — updating (billing fields preserved)`)
    } else {
      stats.created++
      log(`  +  ${doc.id}  ${data.name ?? '(unnamed)'} — creating`)
    }

    payload.migratedFrom = 'hockey'
    payload.migratedAt   = new Date()

    if (COMMIT) await dstRef.set(payload, { merge: true })
    await copySubcollections(doc.ref, dstRef, stats)
  }

  log(`\n──────────────────────────────────────────`)
  log(`  source orgs : ${stats.total}`)
  log(`  created     : ${stats.created}`)
  log(`  updated     : ${stats.updated}`)
  log(`  skipped     : ${stats.skipped}`)
  log(`  sub-docs    : ${stats.subdocs}`)
  log(`──────────────────────────────────────────`)
  if (!COMMIT) log(`\nDry run only — nothing was written. Re-run with --commit to apply.\n`)
  else         log(`\nDone. Source database was not modified.\n`)
}

main().catch(err => { console.error('\nMigration failed:', err); process.exit(1) })
