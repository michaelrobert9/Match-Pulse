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

let app, identityDb, auth, functions

export const googleProvider = new GoogleAuthProvider()

if (configured) {
  app = initializeApp(firebaseConfig)
  // The main site reads and writes ONLY the (default) database: identity
  // (users, userProfiles, people) plus org/plan/entitlement. Sport content
  // lives in per-sport named databases that this site never touches.
  identityDb = getFirestore(app)
  auth       = getAuth(app)
  // Functions are deployed to europe-west1 — africa-south1 is the Firestore
  // region only. Getting this wrong fails at call time, not build time.
  functions  = getFunctions(app, 'europe-west1')
}

export { identityDb, auth, functions }
export default app
