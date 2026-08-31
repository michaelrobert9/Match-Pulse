// ─────────────────────────────────────────────────────────────────────────
// Brief 1 — load the 104 rugby schools into MatchPulse's central Organisation
// directory, with province + website + a re-hosted logo, and activate each for
// rugby. Run once from an environment with Admin credentials AND normal internet
// (the user's Cloud Shell). Uses the Admin SDK, so Firestore security rules are
// bypassed by design — this is a privileged one-off import.
//
//   USAGE (from the repo, with firebase-admin resolvable — i.e. functions/):
//     cd functions
//     # ADC: Cloud Shell already has it; elsewhere run
//     #   gcloud auth application-default login
//     node scripts/brief1-import-schools.mjs --dry-run     # preview, writes nothing
//     node scripts/brief1-import-schools.mjs               # real run (idempotent)
//
//   OPTIONS:
//     --dry-run          Plan only. No Firestore/Storage writes.
//     --owner <uid>      ownerUserId for created orgs. Default: the first user
//                        with platformAdmin==true (the platform admin owns the
//                        central records until a verified rep is transferred in).
//     --limit <n>        Process only the first n rows (smoke test).
//     --skip-logos       Create/reconcile records but don't fetch/upload logos.
//
// Idempotent: re-running matches existing orgs by normalised name (slugify),
// reconciles their name/province/website, ensures a logo, and ensures rugby is
// active. It never creates a second record for a school it already imported.
//
// Output: writes scripts/brief1_import_result.json — a team_id → orgId → slug
// map for Brief 2 (matches) to reference. team_id is NOT stored on the org doc
// (the brief forbids new fields); the map lives only in this handoff artifact.
// ─────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import admin from 'firebase-admin'
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'

// Defuse a poisoned credential path. Some shells export
// GOOGLE_APPLICATION_CREDENTIALS='' (empty), which makes the Google auth library
// try to parse an empty credential and fail with "Cannot create property
// 'refresh_token' on string ''" before it ever falls back to the environment's
// built-in Application Default Credentials (e.g. Cloud Shell's VM credentials).
// Deleting the empty var here lets that fallback work.
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS
}

const HERE = dirname(fileURLToPath(import.meta.url))
const PROJECT_ID = 'match-pulse-4560e'
const BUCKET = 'match-pulse-4560e.appspot.com'
const RUGBY_DB = 'rugby'

// The five curated provinces (Brief §4). Klerksdorp Hoërskool has no suggestion;
// its North West is folded into Gauteng, matching how the manifest already
// buckets the other North West schools (Lichtenburg, Wesvalia, Rustenburg …).
const VALID_PROVINCES = new Set(['Gauteng', 'Western Cape', 'Eastern Cape', 'KZN', 'Free State'])
const PROVINCE_FALLBACK = { 'Klerksdorp Hoërskool': 'Gauteng' }

// ── args ───────────────────────────────────────────────────────────────────
const args = process.argv.slice(2)
const has = (f) => args.includes(f)
const val = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : null }
const DRY = has('--dry-run')
const SKIP_LOGOS = has('--skip-logos')
const LIMIT = val('--limit') ? parseInt(val('--limit'), 10) : null
const OWNER_ARG = val('--owner')

// ── same slugify as src/lib/orgs.js (must agree for dedup + slug reservation) ─
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// ORG_IDENTITY_FIELDS from functions/index.js — the set copied down to a sport.
const ORG_IDENTITY_FIELDS = [
  'name', 'matchName', 'type', 'slug', 'logoUrl', 'genderProfile',
  'primaryColor', 'secondaryColor', 'bio', 'region', 'website',
  'contactEmail', 'phone', 'socialLinks',
]
const pickIdentity = (d = {}) => {
  const out = {}
  for (const k of ORG_IDENTITY_FIELDS) out[k] = d[k] ?? null
  return out
}

const DEFAULT_PRIMARY = '#059669'
const DEFAULT_SECONDARY = '#0B1220'

admin.initializeApp({ projectId: PROJECT_ID, storageBucket: BUCKET })
const db = getFirestore()                 // (default) — identity, orgs, slugs
const rugbyDb = getFirestore(RUGBY_DB)    // named DB for the rugby product
const bucket = getStorage().bucket(BUCKET)

const log = (...a) => console.log(...a)
const warn = (...a) => console.warn('  ! ', ...a)

// ── owner resolution ─────────────────────────────────────────────────────────
async function resolveOwnerUid() {
  if (OWNER_ARG) return OWNER_ARG
  const snap = await db.collection('users').where('platformAdmin', '==', true).limit(1).get()
  if (snap.empty) {
    throw new Error(
      'No platformAdmin user found. Pass --owner <uid> (the uid that should own the ' +
      'imported school records until a verified rep is transferred in).')
  }
  return snap.docs[0].id
}

// ── existing orgs, indexed by normalised name and by slug ────────────────────
async function loadExisting() {
  const byName = new Map()   // slugify(name) -> { id, ...data }
  const slugs = new Set()    // reserved slugs (orgSlugs registry)
  const orgSnap = await db.collection('organizations').get()
  for (const d of orgSnap.docs) {
    const data = { id: d.id, ...d.data() }
    const key = slugify(data.name || '')
    if (key && !byName.has(key)) byName.set(key, data)
    if (data.slug) slugs.add(data.slug)
  }
  const slugSnap = await db.collection('orgSlugs').get()
  for (const d of slugSnap.docs) slugs.add(d.id)
  return { byName, slugs }
}

// Pick a free slug against the live registry + slugs claimed earlier this run.
function uniqueSlug(name, taken) {
  const base = slugify(name) || 'org'
  if (!taken.has(base)) return base
  for (let n = 2; n < 1000; n++) {
    const c = `${base}-${n}`
    if (!taken.has(c)) return c
  }
  return `${base}-${Date.now().toString(36)}`
}

// ── logo fetch + re-host ─────────────────────────────────────────────────────
// Fetch the rugbyignite image and upload it to org-logos/{orgId}, returning a
// Firebase-style tokenised download URL (same shape the client's getDownloadURL
// produces), so the app renders it identically.
// Some hosts refuse non-browser requests (hotlink protection), so send a
// browser UA + Referer, and retry once on a transient failure.
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36',
  'Referer': 'https://rugbyignite.co.za/',
  'Accept': 'image/avif,image/webp,image/png,image/*,*/*;q=0.8',
}
async function fetchWithRetry(url) {
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(url, { redirect: 'follow', headers: FETCH_HEADERS })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r
    } catch (e) {
      if (attempt >= 2) throw e
      await new Promise(r => setTimeout(r, 800))
    }
  }
}
async function rehostLogo(orgId, logoUrl) {
  const res = await fetchWithRetry(logoUrl)
  let type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
  const buf = Buffer.from(await res.arrayBuffer())
  if (!type.startsWith('image/')) {
    // Fall back to sniffing the URL's extension when the host mislabels it.
    const m = logoUrl.toLowerCase().match(/\.(png|jpe?g|webp|avif|gif|svg)(?:\.\w+)?(?:\?|$)/)
    type = m ? (m[1] === 'jpg' ? 'image/jpeg' : `image/${m[1].replace('jpeg', 'jpeg')}`) : 'image/png'
  }
  if (buf.length === 0) throw new Error('empty image body')
  const token = randomUUID()
  const objectPath = `org-logos/${orgId}`
  await bucket.file(objectPath).save(buf, {
    resumable: false,
    contentType: type,
    metadata: { metadata: { firebaseStorageDownloadTokens: token } },
  })
  const enc = encodeURIComponent(objectPath)
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${enc}?alt=media&token=${token}`
}

// ── activation (replicates activateOrgIntoSport for rugby) ───────────────────
async function activateRugby(orgId, identity, ownerUid, centralUpdatedMs) {
  const ref = rugbyDb.doc(`organizations/${orgId}`)
  await ref.set({
    ...identity,
    updatedAt:  Timestamp.fromMillis(centralUpdatedMs || Date.now()),
    syncedFrom: 'central',
    syncedAt:   FieldValue.serverTimestamp(),
    managed:    true,
    deactivatedAt: null,
  }, { merge: true })
  // No staff to copy (fresh central records). Stamp central activation.
  await db.doc(`organizations/${orgId}`).set({
    activatedSports: { [RUGBY_DB]: {
      activatedAt: FieldValue.serverTimestamp(),
      activatedBy: ownerUid,
    } },
  }, { merge: true })
}

// ── field mapping from a manifest row ────────────────────────────────────────
function provinceFor(row) {
  const p = (row.suggested_province || '').trim()
  if (VALID_PROVINCES.has(p)) return p
  return PROVINCE_FALLBACK[row.org_name] || ''
}
function baseFields(row, slug, logoUrl) {
  const name = row.org_name.trim()
  return {
    name,
    matchName:      name,           // schools carry a matchName; default = name
    type:           'school',
    genderProfile:  'coed',
    logoUrl:        logoUrl || null,
    bannerUrl:      null,
    primaryColor:   DEFAULT_PRIMARY,
    secondaryColor: DEFAULT_SECONDARY,
    bio:            '',
    region:         provinceFor(row),
    website:        (row.official_website || '').trim() || '',
    contactEmail:   '',
    phone:          '',
    socialLinks:    {},
    slug,
  }
}

async function main() {
  const manifest = JSON.parse(readFileSync(join(HERE, 'brief1_schools_manifest.json'), 'utf8'))
  const rows = LIMIT ? manifest.slice(0, LIMIT) : manifest
  log(`Brief 1 import — ${rows.length} schools${DRY ? '  [DRY RUN]' : ''}`)

  const ownerUid = await resolveOwnerUid()
  log(`Owner for created records: ${ownerUid}${OWNER_ARG ? '' : '  (auto: platformAdmin)'}`)

  const { byName, slugs } = await loadExisting()
  log(`Existing: ${byName.size} orgs by name, ${slugs.size} reserved slugs\n`)

  const taken = new Set(slugs)
  const result = []   // { team_id, org_name, orgId, slug, action, province, hadWebsite, logo }
  const flags = []    // ambiguities for a human
  let created = 0, reconciled = 0, logosDone = 0, logosFailed = 0

  for (const row of rows) {
    const name = row.org_name.trim()
    const key = slugify(name)
    const existing = byName.get(key)
    const province = provinceFor(row)
    if (!province) flags.push(`No province resolved for "${name}" — set manually.`)

    // Resolve the org id + slug (existing vs new).
    let orgId, slug, action
    if (existing) {
      orgId = existing.id
      slug = existing.slug || uniqueSlug(name, taken)
      action = 'reconcile'
      if (existing.name && existing.name !== name)
        flags.push(`Name reconciled: "${existing.name}" -> "${name}" (${orgId})`)
    } else {
      orgId = db.collection('organizations').doc().id
      slug = uniqueSlug(name, taken)
      action = 'create'
    }
    taken.add(slug)

    // Logo: fetch + re-host unless skipped or already hosted in our bucket.
    let logoUrl = existing?.logoUrl || null
    const alreadyOurs = logoUrl && logoUrl.includes('firebasestorage.googleapis.com') && logoUrl.includes(`org-logos%2F${orgId}`)
    if (!SKIP_LOGOS && !alreadyOurs) {
      if (DRY) {
        logoUrl = `(would re-host ${row.logo_url})`
      } else {
        try { logoUrl = await rehostLogo(orgId, row.logo_url); logosDone++ }
        catch (e) { logosFailed++; warn(`logo failed for ${name}: ${e.message}`); logoUrl = existing?.logoUrl || null }
      }
    }

    const fields = baseFields(row, slug, DRY ? (existing?.logoUrl || null) : logoUrl)

    if (!DRY) {
      const now = FieldValue.serverTimestamp()
      // Reserve slug (only if new — reconciles keep their slug).
      if (action === 'create') {
        await db.doc(`orgSlugs/${slug}`).set(
          { orgId, createdBy: ownerUid, createdAt: now }, { merge: true })
      }
      // Write the org doc. Never touches billing fields; owner only set on create.
      const patch = { ...fields, updatedAt: now }
      if (action === 'create') { patch.ownerUserId = ownerUid; patch.createdBy = ownerUid; patch.createdAt = now }
      await db.doc(`organizations/${orgId}`).set(patch, { merge: true })

      // Activate rugby (identity down + central activatedSports.rugby).
      const identity = pickIdentity({ ...fields })
      await activateRugby(orgId, identity, ownerUid, Date.now())
    }

    if (action === 'create') created++; else reconciled++
    result.push({
      team_id: row.team_id, org_name: name, orgId, slug, action,
      province, hadWebsite: !!(row.official_website || '').trim(),
      logo: DRY ? '(dry)' : (logoUrl ? 'hosted' : 'none'),
    })
    log(`  ${action === 'create' ? '＋' : '↻'} ${name}  [${province || 'NO PROVINCE'}]  /${slug}`)
  }

  const outPath = join(HERE, 'brief1_import_result.json')
  if (!DRY) writeFileSync(outPath, JSON.stringify(result, null, 2))

  log(`\n─ Summary ─────────────────────────────`)
  log(`  created:    ${created}`)
  log(`  reconciled: ${reconciled}`)
  log(`  logos:      ${logosDone} hosted, ${logosFailed} failed`)
  log(`  rugby:      all ${rows.length} activated`)
  if (!DRY) log(`  map:        ${outPath}  (team_id -> orgId, for Brief 2)`)
  if (flags.length) {
    log(`\n─ Needs a human eye (${flags.length}) ─`)
    for (const f of flags) log(`  • ${f}`)
  }
  if (DRY) log(`\n[DRY RUN] Nothing was written. Re-run without --dry-run to apply.`)
}

main().then(() => process.exit(0)).catch(e => { console.error('\nFAILED:', e); process.exit(1) })
