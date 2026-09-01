// Venue registry client access. Reads come straight from the (default) database
// (public read on active venues); all writes go through the callables. Venues are
// NOT owned — a venue is a neutral listing anyone can schedule onto.
import { httpsCallable } from 'firebase/functions'
import { collection, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore'
import { functions, identityDb } from '../firebase'

const call = (name) => httpsCallable(functions, name)

export async function createVenue(data)              { const { data: r } = await call('createVenue')(data); return r }
export async function updateVenue(venueId, patch)    { const { data: r } = await call('updateVenue')({ venueId, patch }); return r }
export async function mergeVenues(sourceId, targetId){ const { data: r } = await call('mergeVenues')({ sourceId, targetId }); return r }
// Set (or clear, with venueId '') an org's Home venue. Org admin or master.
export async function setOrgHomeVenue(orgId, venueId){ const { data: r } = await call('setOrgHomeVenue')({ orgId, venueId: venueId || '' }); return r }

// Every venue incl. inactive/merged — platform admin only (rules gate it).
export async function listAllVenues() {
  const snap = await getDocs(collection(identityDb, 'venues'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}
export async function getVenueBySlug(slug) {
  const snap = await getDocs(query(collection(identityDb, 'venues'), where('slug', '==', slug), where('active', '==', true), limit(1)))
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
}
// A single venue by id (public read; only active venues are readable to non-admins).
export async function getVenueById(id) {
  if (!id) return null
  const s = await getDoc(doc(identityDb, 'venues', id))
  return s.exists() ? { id: s.id, ...s.data() } : null
}
export async function getOrgLite(orgId) {
  const s = await getDoc(doc(identityDb, 'organizations', orgId))
  return s.exists() ? { id: s.id, ...s.data() } : null
}
// Reverse lookup: the org (if any) that calls this venue its Home venue. Single
// equality filter — covered by Firestore's automatic single-field index.
export async function getOrgByHomeVenue(venueId) {
  if (!venueId) return null
  const snap = await getDocs(query(collection(identityDb, 'organizations'), where('homeVenueId', '==', venueId), limit(1)))
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
}
// A retired (merged) slug → its target slug, or null. Public.
export async function getVenueRedirect(slug) {
  const s = await getDoc(doc(identityDb, 'venueRedirects', slug))
  return s.exists() ? s.data() : null
}
// The lightweight typeahead index (active venues) — for the Home-venue picker.
export async function listVenueIndex() {
  const s = await getDoc(doc(identityDb, 'venueIndex', 'current'))
  const venues = s.exists() ? (s.data().venues || []) : []
  return [...venues].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}

// ── Map helpers ──────────────────────────────────────────────────────────────
// Maps Embed API behind an env key (referrer-restricted). When absent, callers
// show a directions link and no iframe. Directions always work.
export const MAPS_KEY = import.meta.env.VITE_MAPS_EMBED_KEY || ''

// The locality line: the new free-text town, falling back to legacy address city.
export const venueLocality = (v) => v?.town || v?.address?.city || ''
// Text query used only for embed-by-name when we have no coordinates.
const venueMapQuery = (v) => [v?.name, venueLocality(v)].filter(Boolean).join(', ')

// Directions use the stored Maps URL when present; otherwise fall back to a
// name search (covers legacy venues that predate the stored link).
export const venueDirectionsUrl = (v) =>
  v?.mapsUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueMapQuery(v))}`

// Embed uses coordinates when present; otherwise embeds by name. '' when no key.
export function venueEmbedUrl(v) {
  if (!MAPS_KEY) return ''
  const q = (v?.location && typeof v.location.lat === 'number' && typeof v.location.lng === 'number')
    ? `${v.location.lat},${v.location.lng}`
    : venueMapQuery(v)
  return q ? `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(q)}` : ''
}
