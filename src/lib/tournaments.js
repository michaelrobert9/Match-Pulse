// Cross-sport tournaments directory — reads every sport's published
// competitions server-side and returns cards that link OUT to each
// competition's overview page on its own sport subdomain.
import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

export async function getTournaments() {
  const call = httpsCallable(functions, 'getTournaments')
  const { data } = await call({})
  return data?.tournaments || []
}
