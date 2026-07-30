import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import {
  initializeAuth,
  indexedDBLocalPersistence,
  browserLocalPersistence,
  browserSessionPersistence,
  inMemoryPersistence,
  browserPopupRedirectResolver,
  GoogleAuthProvider,
} from 'firebase/auth'
import { getFunctions } from 'firebase/functions'

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY             || '',
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN         || 'match-pulse-4560e.firebaseapp.com',
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID          || 'match-pulse-4560e',
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET      || 'match-pulse-4560e.appspot.com',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId:             import.meta.env.VITE_FIREBASE_APP_ID              || '',
}

// A missing web API key yields a valid-but-dead bundle. CI refuses to ship one;
// locally this flag lets the UI say so plainly instead of failing at runtime.
export const configured = !!firebaseConfig.apiKey

// Confirm against the console (Build → Functions shows the region per function)
// or `firebase functions:list`. Override with VITE_FUNCTIONS_REGION if it differs.
// This is NOT the Firestore region (africa-south1) — a mismatch fails at call
// time, not build time.
export const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west1'

let app, identityDb, auth, functions

export const googleProvider = new GoogleAuthProvider()

if (configured) {
  app = initializeApp(firebaseConfig)
  // The main site reads and writes ONLY the (default) database: identity
  // (users, userProfiles, people) plus org/plan/entitlement. Sport content
  // lives in per-sport named databases that this site never touches.
  identityDb = getFirestore(app)

  // Explicit persistence fallback chain (netball's finding, applied platform-wide).
  // getAuth() can silently settle on in-memory persistence — e.g. when IndexedDB
  // is blocked, as in some private-mode or installed-PWA contexts — which drops
  // the session on the next navigation and reads exactly like "signed in, then
  // signed out." initializeAuth with an ordered list degrades deliberately
  // instead: IndexedDB → localStorage → sessionStorage → memory. The popup
  // resolver is passed explicitly because initializeAuth (unlike getAuth) does
  // not install one, and Google sign-in uses a popup.
  auth = initializeAuth(app, {
    persistence: [
      indexedDBLocalPersistence,
      browserLocalPersistence,
      browserSessionPersistence,
      inMemoryPersistence,
    ],
    popupRedirectResolver: browserPopupRedirectResolver,
  })

  functions = getFunctions(app, FUNCTIONS_REGION)
}

export { identityDb, auth, functions }
export default app
