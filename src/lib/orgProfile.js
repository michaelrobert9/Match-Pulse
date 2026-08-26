// ─────────────────────────────────────────────────────────────────────────
// Cross-sport org profile — public URL shape + the callable wrappers.
// URLs are TYPE-PREFIXED to match the sport sites: /{prefix}/{slug}.
// ─────────────────────────────────────────────────────────────────────────
import { doc, getDoc, getDocs, collection } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { functions, identityDb } from '../firebase'

// type → URL prefix, exactly as the sport sites use.
export const TYPE_PREFIX = {
  school:      'schools',
  club:        'clubs',
  association: 'associations',
  league:      'leagues',
}
export const PREFIX_TYPE = Object.fromEntries(Object.entries(TYPE_PREFIX).map(([t, p]) => [p, t]))

export const orgPublicPath = (org) =>
  `/${TYPE_PREFIX[org?.type] || 'schools'}/${org?.slug || ''}`

export const orgPublicPathFrom = (type, slug) =>
  `/${TYPE_PREFIX[type] || 'schools'}/${slug}`

// Client-side lightweight resolve of a slug → its prefixed public path, using
// the public orgSlugs registry + public org doc. Used by the legacy redirector.
// Returns the path (e.g. '/schools/fatima') or null.
export async function resolveOrgPathBySlug(slug) {
  const resv = await getDoc(doc(identityDb, 'orgSlugs', String(slug).toLowerCase()))
  if (!resv.exists()) return null
  const orgSnap = await getDoc(doc(identityDb, 'organizations', resv.data().orgId))
  if (!orgSnap.exists()) return null
  const o = orgSnap.data()
  return orgPublicPathFrom(o.type, o.slug)
}

// Public directory: list every central organisation (rules allow public read
// of the organizations collection). Sorted by name client-side so a doc missing
// `name` isn't silently dropped by an orderBy.
export async function listPublicOrganizations() {
  const snap = await getDocs(collection(identityDb, 'organizations'))
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .filter(o => o.slug)   // needs a slug for the public link
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

// Server-side: resolve slug → org, enforce the paid gate, aggregate matches.
export async function getOrgProfile(slug) {
  const call = httpsCallable(functions, 'getOrgProfile')
  const { data } = await call({ slug })
  return data
}

// Owner/admin: raise an EFT invoice for Home Ground (the monthly org-level page).
export async function createProfileInvoice(orgId, billTo) {
  const call = httpsCallable(functions, 'createInvoice')
  const { data } = await call({ product: 'orgProfile', orgId, billTo })
  return data
}

// Admin: grant/revoke the subscription directly (comp / off-invoice EFT).
export async function adminSetProfileSubscription(orgId, action, years = 1) {
  const call = httpsCallable(functions, 'adminSetProfileSubscription')
  const { data } = await call({ orgId, action, years })
  return data
}
