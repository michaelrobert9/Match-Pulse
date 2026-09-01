// ─────────────────────────────────────────────────────────────────────────
// Brief 1C — create the historical rugby venues on central Match Pulse, named to
// match their Organisation exactly, so Brief 2B's match import can resolve each
// match's venue by exact name. Admin SDK (bypasses rules); run from Cloud Shell.
//
//   cd functions
//   node scripts/brief1c-import-venues.mjs --dry-run   # preview, writes nothing
//   node scripts/brief1c-import-venues.mjs             # apply (idempotent)
//
// Naming: the venue NAME is final_venue_name (the org name). google_maps_search_term
// is only a locator — NOT stored as a field (per the brief). The 109 manifest rows
// collapse to 106 unique names (three names have two source rows); for a collapsed
// name we keep the search term from the most-used row.
//
// LOCATION CAVEAT: the source has no coordinates, only name strings, and the
// current venue model stores a pasted Google Maps LINK from which it extracts
// @lat,lng (there is no geocode-a-search-term step any more). So we store a
// Google Maps *search* URL built from the locator term as mapsUrl: directions
// open that search (the right place), the embed falls back to by-name, and
// location stays null. Precise pins can be added later by editing a venue with a
// real share link. This does NOT affect Brief 2B, which links by name only.
//
// Dedup: exact name match against existing venues — reconcile (fill a missing
// mapsUrl), never duplicate. Idempotent, safe to re-run.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import admin from 'firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) delete process.env.GOOGLE_APPLICATION_CREDENTIALS

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ID = 'match-pulse-4560e'
const DRY = process.argv.includes('--dry-run')
const argVal = (f) => { const i = process.argv.indexOf(f); return i >= 0 ? process.argv[i + 1] : null }
const CREATOR_ARG = argVal('--creator')
// Venues land verified (authoritative admin import). Pass --unverified to leave
// them for master review instead.
const VERIFIED = !process.argv.includes('--unverified')

admin.initializeApp({ projectId: PROJECT_ID })
const db = getFirestore()
const log = (...a) => console.log(...a)

// Same helpers as functions/index.js so slugs/normalisation agree.
function normaliseVenueName(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}
function venueSlugify(name) {
  return String(name || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}
const mapsSearchUrl = (term) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(term)}`

async function resolveCreatorUid() {
  if (CREATOR_ARG) return CREATOR_ARG
  const snap = await db.collection('users').where('platformAdmin', '==', true).limit(1).get()
  if (snap.empty) throw new Error('No platformAdmin user found. Pass --creator <uid>.')
  return snap.docs[0].id
}

async function uniqueVenueSlug(name, taken) {
  const base = venueSlugify(name) || 'venue'
  let slug = base, n = 1
  while (taken.has(slug) || !(await db.collection('venues').where('slug', '==', slug).limit(1).get()).empty) {
    slug = `${base}-${++n}`
  }
  return slug
}

// Collapse the manifest to one entry per final_venue_name, keeping the locator
// term from the most historically-used source row.
function collapse(rows) {
  const byName = new Map()
  for (const r of rows) {
    const cur = byName.get(r.final_venue_name)
    const used = Number(r.times_used_in_historical_matches || 0)
    if (!cur || used > cur.used) {
      byName.set(r.final_venue_name, { name: r.final_venue_name, term: r.google_maps_search_term, used })
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(HERE, 'brief1c_venues.json'), 'utf8'))
  const venues = collapse(manifest)
  log(`Brief 1C venues — ${manifest.length} rows → ${venues.length} unique${DRY ? '  [DRY RUN]' : ''}`)

  const creator = await resolveCreatorUid()
  log(`createdByUserId: ${creator}${CREATOR_ARG ? '' : '  (auto: platformAdmin)'}  |  verified: ${VERIFIED}\n`)

  // Existing venues, indexed by exact name + reserved slugs.
  const existingByName = new Map()
  const takenSlugs = new Set()
  const snap = await db.collection('venues').get()
  for (const d of snap.docs) {
    const v = { id: d.id, ...d.data() }
    existingByName.set(v.name, v)
    if (v.slug) takenSlugs.add(v.slug)
  }
  log(`Existing venues: ${existingByName.size}\n`)

  const result = []
  let created = 0, reconciled = 0, skipped = 0
  for (const v of venues) {
    const term = v.term || v.name
    const mapsUrl = mapsSearchUrl(term)
    const existing = existingByName.get(v.name)

    if (existing) {
      // Reconcile: only fill a missing Maps link; never clobber a real pin.
      if (!existing.mapsUrl) {
        if (!DRY) await db.doc(`venues/${existing.id}`).set({ mapsUrl, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
        reconciled++
        log(`  ↻ ${v.name}  (filled Maps link)`)
        result.push({ name: v.name, venueId: existing.id, slug: existing.slug, action: 'reconcile' })
      } else {
        skipped++
        result.push({ name: v.name, venueId: existing.id, slug: existing.slug, action: 'skip' })
      }
      continue
    }

    const slug = await uniqueVenueSlug(v.name, takenSlugs)
    takenSlugs.add(slug)
    const id = db.collection('venues').doc().id
    if (!DRY) {
      await db.doc(`venues/${id}`).set({
        slug, name: v.name, nameNormalised: normaliseVenueName(v.name),
        createdByOrgId: null,
        description: '',
        town: '',
        address: null,
        mapsUrl, location: null,
        timezone: 'Africa/Johannesburg',
        images: [],
        facilities: [],
        verified: VERIFIED, active: true,
        createdByUserId: creator,
        createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
      })
    }
    created++
    log(`  ＋ ${v.name}  /${slug}`)
    result.push({ name: v.name, venueId: DRY ? '(dry)' : id, slug, action: 'create' })
  }

  if (!DRY) writeFileSync(join(HERE, 'brief1c_venue_result.json'), JSON.stringify(result, null, 2))

  log(`\n─ Summary ─────────────────────────────`)
  log(`  unique venues:  ${venues.length}`)
  log(`  created:        ${created}`)
  log(`  reconciled:     ${reconciled}  (existing, filled a missing Maps link)`)
  log(`  skipped:        ${skipped}  (existing, already complete)`)
  if (!DRY) log(`  name→id map:    ${join(HERE, 'brief1c_venue_result.json')}  (for Brief 2B QA)`)
  if (DRY) log(`\n[DRY RUN] Nothing written. Re-run without --dry-run to apply.`)
}

main().then(() => process.exit(0)).catch(e => { console.error('\nFAILED:', e); process.exit(1) })
