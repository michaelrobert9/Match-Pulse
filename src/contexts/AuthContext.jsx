import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  createUserWithEmailAndPassword,
  updateProfile as fbUpdateProfile,
  sendPasswordResetEmail,
  sendEmailVerification,
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
// `hasPlan` separates a plain account (just a user — no paid plan, little admin)
// from an account carrying a plan that needs activation and management. A bare
// signup is entitlement 'none' → a "User", NOT auto-enrolled in any plan.
export function planStatus(e) {
  const tier = e?.entitlement ?? 'none'
  if (tier === 'pro') {
    const exp = e.entitlementExpiresAt?.toDate?.()
      ?? (e.entitlementExpiresAt ? new Date(e.entitlementExpiresAt) : null)
    if (exp && exp > new Date()) return { key: 'pro', label: 'All-In', active: true, hasPlan: true, expiresAt: exp }
    return { key: 'expired', label: 'All-In (expired)', active: false, hasPlan: true, expiresAt: exp }
  }
  if (tier === 'event') {
    const credits = e?.eventCredits ?? 0
    return credits > 0
      ? { key: 'plus', label: 'Single Competition', active: true, hasPlan: true, credits }
      : { key: 'plus_spent', label: 'Single Competition (no credits left)', active: false, hasPlan: true, credits: 0 }
  }
  return { key: 'none', label: 'User', active: false, hasPlan: false }
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

  async function signUp(email, password, displayName, phone = '') {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) await fbUpdateProfile(cred.user, { displayName })
    // Confirm the address is real and reachable. Non-blocking — the account
    // works, but we nudge them to verify (Account shows a banner + resend).
    sendEmailVerification(cred.user).catch(() => {})
    await setDoc(doc(identityDb, 'users', cred.user.uid), {
      email:         (email ?? '').toLowerCase(),
      displayName:   displayName ?? '',
      phone:         (phone ?? '').trim(),
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
  const resendVerification = () => (auth.currentUser ? sendEmailVerification(auth.currentUser) : Promise.reject(new Error('Not signed in')))
  const logout          = () => fbSignOut(auth)

  return (
    <AuthContext.Provider value={{
      user,
      uid: user?.uid ?? null,
      profile,
      plan: planStatus(entitlementOf(profile)),
      loading,
      login, signUp, signInWithGoogle, resetPassword, resendVerification, logout, refresh,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
