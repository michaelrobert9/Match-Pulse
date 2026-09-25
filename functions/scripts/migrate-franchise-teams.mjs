// ─────────────────────────────────────────────────────────────────────────
// One-off migration — convert a private (FRANCHISE) association's directly-owned
// teams into franchise CLUBS.
//
// Background: before the franchise/federation model, a private association (e.g.
// PSI) had its teams created directly under the association org, distinguished
// only by a per-team custom name (teamName, e.g. "Durban Panthers"). The new
// model makes each of those a real CLUB org (type=club, franchiseOf=<assoc>),
// with the association owning no teams itself. This script performs that move.
//
// For every association with associationKind === 'franchise' (central/default DB):
//   • find, in each sport DB, the teams owned directly by that association;
//   • group them by their custom name (teamName), each group becoming one club;
//   • create the club as a central org (default DB) with franchiseOf set, reserve
//     its slug, and copy its identity down into the sport DB it has teams in;
//   • re-point each team to its new club (organizationId/orgName, drop teamName,
//     regenerate the team slug) and leave redirects from the old team URLs.
//
// Runs with Admin credentials (bypasses security rules) — a privileged one-off.
//
//   USAGE (from functions/, with ADC available — e.g. Cloud Shell):
//     node scripts/migrate-franchise-teams.mjs --dry-run     # preview only
//     node scripts/migrate-franchise-teams.mjs               # real run (idempotent)
//     node scripts/migrate-franchise-teams.mjs --owner <uid> # owner for new clubs
//
// Idempotent: once a team has moved to its club it is no longer owned by the
// association, so a re-run finds nothing left to move.
// ─────────────────────────────────────────────────────────────────────────
import admin from 'firebase-admin'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'

if (!process.env.GOOGLE_APPLICATION_CREDENTIALS?.trim()) {
  delete process.env.GOOGLE_APPLICATION_CREDENTIALS
}

const PROJECT_ID = 'match-pulse-4560e'
const SPORT_DB_IDS = ['hockey', 'netball', 'rugby', 'waterpolo']

const args = process.argv.slice(2)
const DRY = args.includes('--dry-run')
const OWNER_ARG = (() => { const i = args.indexOf('--owner'); return i >= 0 ? args[i + 1] : null })()

const log = (...a) => console.log(...a)

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
// Match the sport apps' team-URL helpers so redirects line up.
const teamPathSegment = (teamSlug, orgSlug) =>
  (orgSlug && teamSlug?.startsWith(`${orgSlug}-`)) ? teamSlug.slice(orgSlug.length + 1) : teamSlug
const redirectKey = (path) => String(path || '').replace(/^\//, '').replace(/\//g, '~')

const ORG_IDENTITY_FIELDS = [
  'name', 'matchName', 'type', 'slug', 'logoUrl', 'genderProfile',
  'primaryColor', 'secondaryColor', 'bio', 'region', 'website',
  'contactEmail', 'phone', 'socialLinks', 'homeVenueId',
  'associationKind', 'franchiseOf',
]
const pickIdentity = (d = {}) => {
  const out = {}
  for (const k of ORG_IDENTITY_FIELDS) out[k] = d[k] ?? null
  return out
}

admin.initializeApp({ projectId: PROJECT_ID })
const db = getFirestore()                        // (default) — central orgs + slugs
const sportDb = Object.fromEntries(SPORT_DB_IDS.map(id => [id, getFirestore(admin.app(), id)]))

async function resolveOwnerUid() {
  if (OWNER_ARG) return OWNER_ARG
  const snap = await db.collection('users').where('platformAdmin', '==', true).limit(1).get()
  if (snap.empty) throw new Error('No platformAdmin user; pass --owner <uid>.')
  return snap.docs[0].id
}

async function reservedSlugs() {
  const taken = new Set()
  const [orgs, slugs] = await Promise.all([
    db.collection('organizations').get(),
    db.collection('orgSlugs').get(),
  ])
  orgs.forEach(d => { if (d.data().slug) taken.add(d.data().slug) })
  slugs.forEach(d => taken.add(d.id))
  return taken
}
function uniqueSlug(name, taken) {
  const base = slugify(name) || 'club'
  if (!taken.has(base)) { taken.add(base); return base }
  for (let n = 2; n < 1000; n++) { const c = `${base}-${n}`; if (!taken.has(c)) { taken.add(c); return c } }
  const c = `${base}-${Date.now().toString(36)}`; taken.add(c); return c
}
function uniqueTeamSlug(base, taken) {
  if (!taken.has(base)) { taken.add(base); return base }
  for (let n = 2; n < 1000; n++) { const c = `${base}-${n}`; if (!taken.has(c)) { taken.add(c); return c } }
  const c = `${base}-${Date.now().toString(36)}`; taken.add(c); return c
}

async function run() {
  const ownerUid = DRY ? '(dry-run)' : await resolveOwnerUid()
  const taken = await reservedSlugs()

  const assocSnap = await db.collection('organizations')
    .where('type', '==', 'association').get()
  const franchises = assocSnap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(o => o.associationKind === 'franchise')

  if (franchises.length === 0) { log('No franchise associations found. Nothing to do.'); return }

  let clubsCreated = 0, teamsMoved = 0

  for (const assoc of franchises) {
    log(`\n=== ${assoc.name} (${assoc.id}) ===`)
    for (const dbId of SPORT_DB_IDS) {
      const sdb = sportDb[dbId]
      const teamSnap = await sdb.collection('teams').where('organizationId', '==', assoc.id).get()
      const teams = teamSnap.docs.map(d => ({ id: d.id, ref: d.ref, ...d.data() }))
      if (teams.length === 0) continue

      // Existing team slugs in this sport DB (for uniqueness of new slugs).
      const teamSlugsTaken = new Set()
      ;(await sdb.collection('teams').get()).forEach(d => { if (d.data().slug) teamSlugsTaken.add(d.data().slug) })

      const groups = new Map()
      for (const t of teams) {
        const key = (t.teamName || t.displayName || 'Club').trim()
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key).push(t)
      }

      log(`  [${dbId}] ${teams.length} team(s) → ${groups.size} club(s)`)
      for (const [clubName, members] of groups) {
        log(`    • ${clubName} — ${members.length} team(s)`)
        if (DRY) continue

        const sample = members[0]
        const clubSlug = uniqueSlug(clubName, taken)
        const clubId = db.collection('organizations').doc().id
        const identity = {
          name: clubName, matchName: clubName, type: 'club', slug: clubSlug,
          logoUrl: sample.logoUrl || assoc.logoUrl || null,
          genderProfile: null,
          primaryColor: sample.primaryColor || assoc.primaryColor || '#059669',
          secondaryColor: sample.secondaryColor || assoc.secondaryColor || '#0B1220',
          bio: '', region: assoc.region || '', website: '', contactEmail: '', phone: '',
          socialLinks: {}, homeVenueId: null,
          associationKind: null, franchiseOf: assoc.id,
        }
        // 1) Central org (default DB) + slug reservation + owner grant.
        await db.doc(`organizations/${clubId}`).set({
          ...identity, ownerUserId: ownerUid, createdBy: ownerUid,
          createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp(),
          migratedFrom: assoc.id,
        })
        await db.doc(`orgSlugs/${clubSlug}`).set({ orgId: clubId, createdBy: ownerUid, createdAt: FieldValue.serverTimestamp() })
        await db.doc(`organizations/${clubId}/staff/${ownerUid}`).set({ role: 'owner', teamId: null, createdBy: ownerUid, createdAt: FieldValue.serverTimestamp() })
        // 2) Mirror identity into THIS sport DB (so the club exists there immediately).
        await sdb.doc(`organizations/${clubId}`).set({ ...pickIdentity(identity), syncedAt: FieldValue.serverTimestamp() }, { merge: true })
        clubsCreated++

        // 3) Re-point each team under the club + leave redirects.
        for (const t of members) {
          const oldSlug = t.slug || null
          const label = t.displayName || ''
          const newSeg = slugify(label) || 'team'
          const newSlug = uniqueTeamSlug(`${clubSlug}-${newSeg}`, teamSlugsTaken)
          await t.ref.update({
            organizationId: clubId,
            orgName: clubName,
            teamName: FieldValue.delete(),
            slug: newSlug,
            searchName: [clubName, label].filter(Boolean).join(' ').toLowerCase(),
            updatedAt: FieldValue.serverTimestamp(),
          })
          teamsMoved++
          // Redirects: old association-owned URLs → new club URL.
          if (oldSlug && assoc.slug) {
            const oldSeg = teamPathSegment(oldSlug, assoc.slug)
            const clubSeg = teamPathSegment(newSlug, clubSlug)
            const to = `/clubs/${clubSlug}/${clubSeg}`
            const froms = [
              `/associations/${assoc.slug}/${oldSeg}`,
              `/${assoc.slug}/${oldSeg}`,
              `/team/${oldSlug}`,
            ]
            for (const from of froms) {
              await sdb.doc(`redirects/${redirectKey(from)}`).set({
                fromPath: from, toPath: to, kind: 'team',
                createdAt: FieldValue.serverTimestamp(),
              }, { merge: true }).catch(() => {})
            }
          }
        }
      }
    }
  }

  log(`\n${DRY ? 'DRY RUN — nothing written.' : 'Done.'} Clubs: ${clubsCreated}, teams moved: ${teamsMoved}.`)
}

run().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
