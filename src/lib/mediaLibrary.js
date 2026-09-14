// Per-organisation media library (main site).
// Registry of images an org has uploaded, so a logo/banner can be re-selected
// instead of re-uploaded. Stored in the (default) database at
// organizations/{orgId}/media. Registration is best-effort — it never blocks
// the underlying upload, and silently no-ops if the rules aren't deployed yet.
import {
  collection, addDoc, deleteDoc, doc, getDocs, query, orderBy, where, limit, serverTimestamp,
} from 'firebase/firestore'
import { identityDb, auth } from '../firebase'

const mediaCol = (orgId) => collection(identityDb, 'organizations', orgId, 'media')

export async function fetchOrgMedia(orgId) {
  if (!orgId) return []
  try {
    const snap = await getDocs(query(mediaCol(orgId), orderBy('uploadedAt', 'desc')))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch { return [] }
}

export async function registerOrgMedia(orgId, { url, name, path = null, contentType = null, size = null } = {}) {
  if (!orgId || !url) return null
  try {
    const dup = await getDocs(query(mediaCol(orgId), where('url', '==', url), limit(1)))
    if (!dup.empty) return dup.docs[0].id
    const ref = await addDoc(mediaCol(orgId), {
      url,
      name: (name || 'Image').slice(0, 120),
      path, contentType, size,
      uploadedBy: auth?.currentUser?.uid ?? null,
      uploadedAt: serverTimestamp(),
    })
    return ref.id
  } catch { return null }
}

export async function removeOrgMedia(orgId, mediaId) {
  if (!orgId || !mediaId) return
  await deleteDoc(doc(identityDb, 'organizations', orgId, 'media', mediaId))
}
