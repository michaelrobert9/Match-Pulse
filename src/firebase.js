import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'
import { getAuth, GoogleAuthProvider } from 'firebase/auth'
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
export const FUNCTIONS_REGION = import.meta.env.VITE_FUNCTIONS_REGION || 'europe-west1'

let app, identityDb, auth, functions

export const googleProvider = new GoogleAuthProvider()

if (configured) {
  app = initializeApp(firebaseConfig)
  // The main site reads and writes ONLY the (default) database: identity
  // (users, userProfiles, people) plus org/plan/entitlement. Sport content
  // lives in per-sport named databases that this site never touches.
  identityDb = getFirestore(app)
  auth       = getAuth(app)
  // Functions region. NOT the same as the Firestore region: Firestore is
  // africa-south1, Functions are europe-west1 (matching the hockey deployment).
  // A mismatch fails at CALL time with an opaque error, never at build time, so
  // it is overridable without a code change — see FUNCTIONS_REGION below.
  functions  = getFunctions(app, FUNCTIONS_REGION)
}

export { identityDb, auth, functions }
export default app
