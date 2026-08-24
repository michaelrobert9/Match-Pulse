// Venue registry client access. Reads come straight from the (default) database
// (public read on active venues); all writes go through the callables.
import { httpsCallable } from 'firebase/functions'
import { collection, doc, getDoc, getDocs, query, where, limit } from 'firebase/firestore'
import { functions, identityDb } from '../firebase'

const call = (name) => httpsCallable(functions, name)

export async function createVenue(data)            { const { data: r } = await call('createVenue')(data); return r }
export async function updateVenue(venueId, patch)  { const { data: r } = await call('updateVenue')({ venueId, patch }); return r }
export async function mergeVenues(sourceId, targetId) { const { data: r } = await call('mergeVenues')({ sourceId, targetId }); return r }

// Active venues owned by one org (public read).
export async function listVenuesByOrg(orgId) {
  const snap = await getDocs(query(collection(identityDb, 'venues'), where('ownerOrgId', '==', orgId), where('active', '==', true)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}
// Every venue incl. inactive/merged — platform admin only (rules gate it).
export async function listAllVenues() {
  const snap = await getDocs(collection(identityDb, 'venues'))
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))
}
export async function getVenueBySlug(slug) {
  const snap = await getDocs(query(collection(identityDb, 'venues'), where('slug', '==', slug), where('active', '==', true), limit(1)))
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() }
}
export async function getOrgLite(orgId) {
  const s = await getDoc(doc(identityDb, 'organizations', orgId))
  return s.exists() ? { id: s.id, ...s.data() } : null
}

// ── Map + address helpers ────────────────────────────────────────────────────
// Maps Embed API behind an env key (referrer-restricted). When absent, callers
// show the address + a directions link and no iframe. Directions always work.
export const MAPS_KEY = import.meta.env.VITE_MAPS_EMBED_KEY || ''
export const venueMapQuery = (v) => v?.mapQuery || [v?.name, v?.address?.suburb, v?.address?.city].filter(Boolean).join(', ')
export const venueDirectionsUrl = (v) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(venueMapQuery(v))}`
export const venueEmbedUrl = (v) => MAPS_KEY ? `https://www.google.com/maps/embed/v1/place?key=${MAPS_KEY}&q=${encodeURIComponent(venueMapQuery(v))}` : ''
export function formatVenueAddress(a) {
  if (!a) return ''
  return [a.line1, a.suburb, a.city, a.province, a.postalCode].filter(Boolean).join(', ')
}
