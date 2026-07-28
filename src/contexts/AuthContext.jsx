import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile as fbUpdateProfile,
  sendPasswordResetEmail,
  signOut as fbSignOut,
} from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, identityDb, configured, googleProvider } from '../firebase'

const AuthContext = createContext(null)

// Entitlement fields on users/{uid}. Written ONLY by the PayFast ITN via the
// Admin SDK — never from this client. Rules enforce that; this is read-only.
function entitlementOf(data) {
  return {
    entitlement:          data?.entitlement ?? 'none',
    eventCredits:         data?.eventCredits ?? 0,
    entitlementExpiresAt: data?.entitlementExpiresAt ?? null,
  }
}

// Resolve the raw fields into a plan the UI can render.
export function planStatus(e) {
  const tier = e?.entitlement ?? 'none'
  if (tier === 'pro') {
    const exp = e.entitlementExpiresAt?.toDate?.()
      ?? (e.entitlementExpiresAt ? new Date(e.entitlementExpiresAt) : null)
    if (exp && exp > new Date()) return { key: 'pro', label: 'Pro', active: true, expiresAt: exp }
    return { key: 'expired', label: 'Pro (expired)', active: false, expiresAt: exp }
  }
  if (tier === 'event') {
    const credits = e?.eventCredits ?? 0
    return credits > 0
      ? { key: 'plus', label: 'Plus', active: true, credits }
      : { key: 'plus_spent', label: 'Plus (no credits left)', active: false, credits: 0 }
  }
  return { key: 'free', label: 'Free', active: true }
}

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null)
  const [profile,    setProfile]    = useState(null)
  const [loading,    setLoading]    = useState(true)

  useEffect(() => {
    if (!configured) { setLoading(false); return }

    return onAuthStateChanged(auth, async (u) => {
      if (!u) { setUser(null); setProfile(null); setLoading(false); return }
      setUser(u)
      // Refresh the token so entitlement custom claims (set by syncUserClaims)
      // are current — sport subdomains gate on these, so a stale token after a
      // purchase would lock the buyer out of what they just paid for.
      u.getIdToken(true).catch(() => {})
      try {
        const ref  = doc(identityDb, 'users', u.uid)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          // Bootstrap a fresh account. Rules require these start unprivileged.
          const seed = {
            email:         (u.email ?? '').toLowerCase(),
            displayName:   u.displayName ?? '',
            platformAdmin: false,
            orgRoles:      {},
            createdAt:     serverTimestamp(),
            updatedAt:     serverTimestamp(),
          }
          await setDoc(ref, seed)
          setDoc(doc(identityDb, 'userProfiles', u.uid), {
            email:       (u.email ?? '').toLowerCase(),
            displayName: u.displayName ?? '',
            photoURL:    u.photoURL ?? null,
          }, { merge: true }).catch(() => {})
          setProfile({ ...seed, ...entitlementOf(null) })
        } else {
          setProfile(snap.data())
        }
      } catch {
        setProfile(null)
      }
      setLoading(false)
    })
  }, [])

  const refresh = useCallback(async () => {
    if (!auth?.currentUser) return
    try {
      const snap = await getDoc(doc(identityDb, 'users', auth.currentUser.uid))
      if (snap.exists()) setProfile(snap.data())
    } catch { /* keep the last good profile */ }
  }, [])

  async function signUp(email, password, displayName) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) await fbUpdateProfile(cred.user, { displayName })
    await setDoc(doc(identityDb, 'users', cred.user.uid), {
      email:         (email ?? '').toLowerCase(),
      displayName:   displayName ?? '',
      platformAdmin: false,
      orgRoles:      {},
      createdAt:     serverTimestamp(),
      updatedAt:     serverTimestamp(),
    }, { merge: true }).catch(() => {})
    setDoc(doc(identityDb, 'userProfiles', cred.user.uid), {
      email:       (email ?? '').toLowerCase(),
      displayName: displayName ?? '',
    }, { merge: true }).catch(() => {})
    return cred
  }

  const login           = (email, password) => signInWithEmailAndPassword(auth, email, password)
  const signInWithGoogle = () => signInWithPopup(auth, googleProvider)
  const resetPassword   = (email) => sendPasswordResetEmail(auth, email)
  const logout          = () => fbSignOut(auth)

  return (
    <AuthContext.Provider value={{
      user,
      uid: user?.uid ?? null,
      profile,
      plan: planStatus(entitlementOf(profile)),
      loading,
      login, signUp, signInWithGoogle, resetPassword, logout, refresh,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
