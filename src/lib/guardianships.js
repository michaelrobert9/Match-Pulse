// Guardianships — the central record of parent↔child claims. Sport apps write
// one doc per parent claim into the (default) DB; the main site reads them and,
// as a platform admin, approves/rejects (mainSiteStatus) or removes them.
import { collection, doc, getDocs, query, where, orderBy, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore'
import { identityDb } from '../firebase'

const COL = 'guardianships'

// Children/players a given parent has claimed, across every sport.
export async function listGuardianshipsForParent(uid) {
  const snap = await getDocs(query(collection(identityDb, COL), where('parentUid', '==', uid)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (a.personName || '').localeCompare(b.personName || '', undefined, { sensitivity: 'base' }))
}

// Every claim, newest first — for an admin review queue.
export async function listAllGuardianships() {
  try {
    const snap = await getDocs(query(collection(identityDb, COL), orderBy('createdAt', 'desc')))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    // No index / missing createdAt on older docs → fall back to an unordered read.
    const snap = await getDocs(collection(identityDb, COL))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }
}

// Admin: approve / reject a claim on the main site (does not touch sport control).
export async function setGuardianshipStatus(id, mainSiteStatus) {
  await updateDoc(doc(identityDb, COL, id), { mainSiteStatus, mainSiteUpdatedAt: serverTimestamp() })
}

// Admin: remove the central claim record.
export async function deleteGuardianship(id) {
  await deleteDoc(doc(identityDb, COL, id))
}

export const SPORT_LABEL = { hockey: 'Hockey', netball: 'Netball', rugby: 'Rugby', waterpolo: 'Water Polo' }
