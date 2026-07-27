#!/usr/bin/env node
/**
 * Read-only audit of the `(default)` database.
 *
 * `(default)` was originally the hockey database. When hockey moved to its own
 * named database the old collections were left behind and walled off — the rules
 * file dropped their match blocks and the index file was emptied — but dropping
 * rules does not delete data. Firestore needs an explicit recursive delete.
 *
 * So `(default)` most likely still holds a full, frozen copy of the pre-split
 * hockey content, invisible to every client. This script says exactly what is
 * there, how big it is, and how stale, so the cleanup decision is made on facts
 * rather than assumption.
 *
 * WRITES NOTHING. Deletes nothing. Safe to run any time.
 *
 * Usage:
 *   GOOGLE_APPLICATION_CREDENTIALS=./sa.json node scripts/audit-default-db.mjs
 *
 * Requires: npm i firebase-admin
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'match-pulse-4560e'

// Collections the main site legitimately owns in (default).
const KEEP = new Set(['users', 'userProfiles', 'people', 'authHandoffs', 'organizations'])

const app = initializeApp({ credential: applicationDefault(), projectId: PROJECT })
const db  = getFirestore(app)

const log = (...a) => console.log(...a)

const ts = (v) => {
  const d = v?.toDate ? v.toDate() : (v ? new Date(v) : null)
  return d && !isNaN(d) ? d.toISOString().slice(0, 10) : null
}

/** Newest updatedAt/createdAt across a sample — a proxy for "how stale". */
function newestDate(docs) {
  let newest = null
  for (const d of docs) {
    const v = d.data()
    for (const f of ['updatedAt', 'createdAt', 'scheduledAt']) {
      const s = ts(v?.[f])
      if (s && (!newest || s > newest)) newest = s
    }
  }
  return newest
}

async function main() {
  log(`\nMatchPulse — (default) database audit`)
  log(`project: ${PROJECT}`)
  log(`READ-ONLY — nothing is written or deleted\n`)

  const cols = await db.listCollections()
  if (!cols.length) { log('No collections found.'); return }

  const owned = [], orphaned = []

  for (const col of cols) {
    // Count via an ID-only read; cheap enough at this scale and exact.
    const snap   = await col.select().get()
    const sample = await col.limit(25).get()
    const row    = { id: col.id, count: snap.size, newest: newestDate(sample.docs) }
    ;(KEEP.has(col.id) ? owned : orphaned).push(row)
  }

  const table = (rows) => {
    if (!rows.length) { log('  (none)\n'); return }
    const w = Math.max(...rows.map(r => r.id.length), 12)
    for (const r of rows.sort((a, b) => b.count - a.count)) {
      log(`  ${r.id.padEnd(w)}  ${String(r.count).padStart(7)} docs   newest: ${r.newest ?? '—'}`)
    }
    log('')
  }

  log('OWNED by the main site — keep:')
  table(owned)

  log('ORPHANED pre-split hockey leftovers — candidates for deletion:')
  table(orphaned)

  const total = orphaned.reduce((n, r) => n + r.count, 0)
  log(`──────────────────────────────────────────`)
  log(`  orphaned collections : ${orphaned.length}`)
  log(`  orphaned documents   : ${total}`)
  log(`──────────────────────────────────────────`)
  log(`
Next steps if the orphaned list looks right:
  1. Confirm the same data exists and is CURRENT in the \`hockey\` database.
  2. Export a backup first:
       gcloud firestore export gs://<bucket>/pre-cleanup --database='(default)'
  3. Only then delete, one collection at a time:
       firebase firestore:delete --recursive --database '(default)' /<collection>

  Note: \`organizations\` is listed as OWNED because it is the migration target —
  its stale copy is refreshed by migrate-orgs-to-default.mjs, not deleted.
`)
}

main().catch(err => { console.error('\nAudit failed:', err); process.exit(1) })
