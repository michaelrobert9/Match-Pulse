// Org applications — a user asks for a school/club/association/league to be
// created; a platform admin reviews it. Users can no longer self-create orgs.
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, where, serverTimestamp } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { identityDb, functions } from '../firebase'

const COL = 'orgApplications'

// Submit an application (status pending). `fields`: { orgName, type, region, role, motivation }.
export async function submitOrgApplication(user, fields) {
  const ref = await addDoc(collection(identityDb, COL), {
    uid:           user.uid,
    applicantName: user.displayName || '',
    applicantEmail:(user.email || '').toLowerCase(),
    orgName:       (fields.orgName || '').trim(),
    type:          fields.type || 'school',
    region:        (fields.region || '').trim(),
    role:          (fields.role || '').trim(),
    motivation:    (fields.motivation || '').trim(),
    status:        'pending',
    createdAt:     serverTimestamp(),
  })
  return { id: ref.id }
}

// A user's own applications.
export async function listMyApplications(uid) {
  const snap = await getDocs(query(collection(identityDb, COL), where('uid', '==', uid)))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0))
}

// Admin review queue.
export async function listAllApplications() {
  try {
    const snap = await getDocs(query(collection(identityDb, COL), orderBy('createdAt', 'desc')))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  } catch {
    const snap = await getDocs(collection(identityDb, COL))
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
  }
}

// Applicant withdraws a pending application.
export async function withdrawApplication(id) {
  await deleteDoc(doc(identityDb, COL, id))
}

// Admin: approve (creates the org owned by the applicant) or reject.
export async function reviewApplication(applicationId, action, reason = '') {
  const call = httpsCallable(functions, 'reviewOrgApplication')
  const { data } = await call({ applicationId, action, reason })
  return data
}

export const APP_STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Rejected' }
