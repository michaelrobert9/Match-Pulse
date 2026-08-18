// ─────────────────────────────────────────────────────────────────────────
// Central organisation record — authored here on the main site in the (default)
// database, then copied one-way down to each sport (that sync is a later brief).
// This module owns the schema, the platform-wide slug reservation, and the
// create/update/asset-upload helpers.
//
// Billing fields (entitlement, eventCredits, entitlementExpiresAt) are NOT part
// of this schema and are never written here — they belong to the billing flow
// and the rules reject any client attempt to set them.
// ─────────────────────────────────────────────────────────────────────────
import {
  doc, collection, getDoc, getDocs, query, where,
  runTransaction, updateDoc, serverTimestamp,
} from 'firebase/firestore'
import { ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage'
import { httpsCallable } from 'firebase/functions'
import { identityDb, storage, functions } from '../firebase'

// type: schools/clubs field a "match name" (short name shown in fixtures);
// associations/leagues do not, so matchName is forced null for those.
export const ORG_TYPES = [
  { key: 'school',      label: 'School',      hasMatchName: true  },
  { key: 'club',        label: 'Club',        hasMatchName: true  },
  { key: 'association', label: 'Association', hasMatchName: false },
  { key: 'league',      label: 'League',      hasMatchName: false },
]
export const typeHasMatchName = (type) => ORG_TYPES.find(t => t.key === type)?.hasMatchName === true

export const GENDER_PROFILES = [
  { key: 'boys',  label: 'Boys' },
  { key: 'girls', label: 'Girls' },
  { key: 'coed',  label: 'Co-ed' },
]

export const DEFAULT_PRIMARY   = '#059669'
export const DEFAULT_SECONDARY = '#0B1220'

// A blank identity record for the create form. Billing fields intentionally
// absent — they are never authored here.
export const emptyOrg = () => ({
  name:           '',
  matchName:      '',
  type:           'school',
  genderProfile:  'coed',
  logoUrl:        '',
  bannerUrl:      '',
  primaryColor:   DEFAULT_PRIMARY,
  secondaryColor: DEFAULT_SECONDARY,
  bio:            '',
  region:         '',
  website:        '',
  contactEmail:   '',
  phone:          '',
  socialLinks:    {},   // { facebook, instagram, x, ... }
})

// ── Slugs ────────────────────────────────────────────────────────────────
export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

// Best-effort dedupe against the orgSlugs registry. The transaction in
// createOrg is the real authority against races; this just picks a free-looking
// candidate to present. Registry docs are the single platform-wide namespace,
// so pre-seeding hockey's existing slugs = writing orgSlugs/{slug} docs.
export async function generateUniqueOrgSlug(name) {
  const base = slugify(name) || 'org'
  let candidate = base
  for (let n = 2; n < 1000; n++) {
    const snap = await getDoc(doc(identityDb, 'orgSlugs', candidate))
    if (!snap.exists()) return candidate
    candidate = `${base}-${n}`
  }
  // Extremely unlikely fallback — a timestamp suffix is guaranteed spare.
  return `${base}-${Date.now().toString(36)}`
}

export async function slugIsFree(slug) {
  const snap = await getDoc(doc(identityDb, 'orgSlugs', slug))
  return !snap.exists()
}

// Force schema-consistent values before a write (matchName rule, trims).
function normalise(fields) {
  const t = fields.type
  const clean = (v) => (typeof v === 'string' ? v.trim() : v)
  return {
    name:           clean(fields.name),
    matchName:      typeHasMatchName(t) ? (clean(fields.matchName) || clean(fields.name)) : null,
    type:           t,
    genderProfile:  fields.genderProfile,
    logoUrl:        clean(fields.logoUrl) || null,
    bannerUrl:      clean(fields.bannerUrl) || null,
    primaryColor:   clean(fields.primaryColor) || DEFAULT_PRIMARY,
    secondaryColor: clean(fields.secondaryColor) || DEFAULT_SECONDARY,
    bio:            clean(fields.bio) || '',
    region:         clean(fields.region) || '',
    website:        clean(fields.website) || '',
    contactEmail:   clean(fields.contactEmail || '').toLowerCase(),
    phone:          clean(fields.phone) || '',
    socialLinks:    fields.socialLinks || {},
  }
}

// ── Create ────────────────────────────────────────────────────────────────
// Reserves the slug and writes the org doc atomically. Both writes must pass
// their own rules: orgSlugs create (createdBy == uid) and organizations create
// (ownerUserId == uid, no billing). Returns { id, slug }.
export async function createOrg({ uid, slug, fields }) {
  const orgRef  = doc(collection(identityDb, 'organizations')) // fresh id
  const slugRef = doc(identityDb, 'orgSlugs', slug)
  await runTransaction(identityDb, async (tx) => {
    const taken = await tx.get(slugRef)
    if (taken.exists()) throw new Error(`The slug "${slug}" is already taken. Pick another.`)
    tx.set(slugRef, {
      orgId:     orgRef.id,
      createdBy: uid,
      createdAt: serverTimestamp(),
    })
    tx.set(orgRef, {
      ...normalise(fields),
      slug,
      ownerUserId: uid,
      createdBy:   uid,
      createdAt:   serverTimestamp(),
      updatedAt:   serverTimestamp(),
    })
  })
  return { id: orgRef.id, slug }
}

// ── Update ──────────────────────────────────────────────────────────────
// Identity edit. Slug is immutable (not written). ownerUserId is passed only
// for a deliberate transfer; omit it to leave ownership unchanged. Never writes
// billing fields.
export async function updateOrg(orgId, fields, { transferOwnerUserId } = {}) {
  const patch = { ...normalise(fields), updatedAt: serverTimestamp() }
  if (transferOwnerUserId) patch.ownerUserId = transferOwnerUserId
  await updateDoc(doc(identityDb, 'organizations', orgId), patch)
}

// ── Assets ────────────────────────────────────────────────────────────────
// Uploads to org-logos/{orgId} or org-banners/{orgId} in the (default) bucket
// and returns the download URL to store on the doc. contentType is set so the
// URL renders regardless of extension.
export async function uploadOrgAsset(kind, orgId, file) {
  const folder = kind === 'banner' ? 'org-banners' : 'org-logos'
  const cap    = kind === 'banner' ? 5 : 2
  if (file.size > cap * 1024 * 1024) throw new Error(`Pick an image under ${cap} MB.`)
  if (!file.type.startsWith('image/')) throw new Error('Pick an image file (JPEG, PNG, WebP).')
  const ref = storageRef(storage, `${folder}/${orgId}`)
  await uploadBytes(ref, file, { contentType: file.type })
  return getDownloadURL(ref)
}

// ── Reads ─────────────────────────────────────────────────────────────────
export async function getOrg(orgId) {
  const snap = await getDoc(doc(identityDb, 'organizations', orgId))
  return snap.exists() ? { id: snap.id, ...snap.data() } : null
}

export async function listOrgsOwnedBy(uid) {
  const q = query(collection(identityDb, 'organizations'), where('ownerUserId', '==', uid))
  const snap = await getDocs(q)
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

export async function listAllOrgs() {
  const snap = await getDocs(collection(identityDb, 'organizations'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// ── Activation (copy-down) ──────────────────────────────────────────────────
// Calls the main-site centralOrgActivate function, which copies identity + the
// staff roster into the sport's named DB and records it in activatedSports.
// Idempotent server-side. Returns { sport, slug, staffCount, alreadyActive? }.
export async function activateOrgInSport(orgId, sport) {
  const call = httpsCallable(functions, 'centralOrgActivate')
  const { data } = await call({ orgId, sport })
  return data
}
