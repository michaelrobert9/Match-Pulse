// ─────────────────────────────────────────────────────────────────────────
// Pass 2 venue migration — venues are no longer owned. For every venue that
// still carries ownerOrgId: set that org's homeVenueId (only if it has none),
// then remove ownerOrgId from the venue. Writing the org doc fires the identity
// sync, so the sport-database copies pick up homeVenueId; removing ownerOrgId
// from the venue fires rebuildVenueIndex, which no longer emits ownerOrgId.
//
// The `address` object is left untouched (nullable legacy — migrate nothing).
//
//   cd functions
//   node scripts/pass2-venue-ownership-migration.mjs --dry-run   # preview
//   node scripts/pass2-venue-ownership-migration.mjs             # apply (idempotent)
//
// Idempotent: a venue with no ownerOrgId is skipped; an org that already has a
// homeVenueId is not overwritten. Safe to re-run.
// ─────────────────────────────────────────────────────────────────────────
import admin from 'firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

// Ignore an empty GOOGLE_APPLICATION_CREDENTIALS so Cloud Shell's built-in ADC is used.
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) delete process.env.GOOGLE_APPLICATION_CREDENTIALS

const PROJECT_ID = 'match-pulse-4560e'
const DRY = process.argv.includes('--dry-run')

admin.initializeApp({ projectId: PROJECT_ID })
const db = getFirestore()
const log = (...a) => console.log(...a)

async function main() {
  log(`Venue ownership migration${DRY ? '  [DRY RUN]' : ''}`)
  const snap = await db.collection('venues').get()

  // Which orgs already have a homeVenueId (so we never overwrite one), tracking
  // in-run assignments too so two venues of one org don't fight.
  const orgHome = new Map()   // orgId -> homeVenueId (existing or assigned this run)
  const orgSnap = await db.collection('organizations').get()
  for (const o of orgSnap.docs) { const h = o.data().homeVenueId; if (h) orgHome.set(o.id, h) }

  let assigned = 0, cleared = 0, skipped = 0
  for (const d of snap.docs) {
    const v = d.data()
    if (!v.ownerOrgId) { skipped++; continue }
    const orgId = v.ownerOrgId

    // Assign the org's home venue if it has none yet.
    if (!orgHome.has(orgId)) {
      const orgRef = db.doc(`organizations/${orgId}`)
      const orgDoc = await orgRef.get()
      if (orgDoc.exists) {
        if (!DRY) await orgRef.set({ homeVenueId: d.id, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        orgHome.set(orgId, d.id)
        assigned++
        log(`  home  ${orgDoc.data().name || orgId}  ->  ${v.name} (${d.id})`)
      } else {
        log(`  !  venue ${v.name} (${d.id}) references missing org ${orgId} — clearing ownerOrgId only`)
      }
    }

    // Drop ownerOrgId from the venue (fires rebuildVenueIndex).
    if (!DRY) await d.ref.update({ ownerOrgId: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() })
    cleared++
    log(`  clear ${v.name} (${d.id})`)
  }

  log(`\n─ Summary ─────────────────────────────`)
  log(`  venues total:        ${snap.size}`)
  log(`  homeVenueId assigned: ${assigned}`)
  log(`  ownerOrgId cleared:   ${cleared}`)
  log(`  already clean:        ${skipped}`)
  if (DRY) log(`\n[DRY RUN] Nothing written. Re-run without --dry-run to apply.`)
}

main().then(() => process.exit(0)).catch(e => { console.error('\nFAILED:', e); process.exit(1) })
