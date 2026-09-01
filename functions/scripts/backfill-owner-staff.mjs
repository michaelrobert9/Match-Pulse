// ─────────────────────────────────────────────────────────────────────────
// Backfill owner staff docs. The sport apps grant an org owner access from an
// organizations/{orgId}/staff/{uid} doc (role owner, org-wide) — but historically
// ownership was recorded only as org.ownerUserId, with no staff doc, so those
// owners are locked out of every sport. This writes the missing owner staff doc
// for each such org.
//
// The doc write then cascades on its own, via already-deployed triggers:
//   staff/{uid}  →  syncOrgRoleClaim  →  users/{uid}.orgRoles  →  syncUserClaims (claim)
//   staff/{uid}  →  centralOrgStaffSync  →  copied into every ACTIVATED sport DB
//
//   cd functions
//   node scripts/backfill-owner-staff.mjs --dry-run   # counts only, no writes
//   node scripts/backfill-owner-staff.mjs             # apply (idempotent)
//
// Idempotent: an org with no ownerUserId is skipped; an org whose owner already
// has a staff/{ownerUserId} doc is left untouched. Safe to re-run.
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
  log(`Owner staff backfill${DRY ? '  [DRY RUN]' : ''}`)
  const snap = await db.collection('organizations').get()

  let total = 0, noOwner = 0, already = 0, written = 0
  for (const d of snap.docs) {
    total++
    const owner = d.data().ownerUserId
    if (!owner) { noOwner++; continue }
    const staffRef = db.doc(`organizations/${d.id}/staff/${owner}`)
    if ((await staffRef.get()).exists) { already++; continue }
    if (!DRY) {
      await staffRef.set({
        role: 'owner', teamId: null,
        createdAt: FieldValue.serverTimestamp(),
        createdBy: owner,
      })
    }
    written++
    log(`  ${DRY ? 'would add' : 'added'}  ${d.data().name || d.id}  owner=${owner}`)
  }

  log(`\n─ Summary ─────────────────────────────`)
  log(`  organizations total:     ${total}`)
  log(`  no ownerUserId (skipped): ${noOwner}`)
  log(`  owner doc already present: ${already}`)
  log(`  owner doc ${DRY ? 'to write' : 'written'}:        ${written}`)
  if (DRY) log(`\n[DRY RUN] Nothing written. Re-run without --dry-run to apply.`)
  else log(`\nTriggers will now populate orgRoles for each owner and copy the doc into every activated sport DB.`)
}

main().then(() => process.exit(0)).catch(e => { console.error('\nFAILED:', e); process.exit(1) })
