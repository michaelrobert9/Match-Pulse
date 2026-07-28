// Auth handoff — main-site side. See ARCHITECTURE.md §2.
//
// The user is signed in here; the sport subdomain is a different origin, so it
// has no session. We ask the server for a single-use, 60-second ticket and put
// it in the URL FRAGMENT. The sport app exchanges the ticket for a custom token
// and calls signInWithCustomToken.
//
// The fragment matters: fragments are never sent to servers, so the ticket
// stays out of access logs and Referer headers. And because it is single-use
// and short-lived, a leaked URL is worthless almost immediately.

import { httpsCallable } from 'firebase/functions'
import { functions } from '../firebase'

/**
 * Send a signed-in user to a sport subdomain, authenticated.
 * @param {object} sport  entry from SPORTS
 * @param {string} path   path to land on within the sport app
 */
export async function gotoSport(sport, path = '/') {
  const call = httpsCallable(functions, 'createHandoffTicket')
  const { data } = await call({ sport: sport.key, path })
  window.location.assign(data.url)
}

/**
 * Where to send someone who is NOT signed in but asked for a sport.
 * They sign in here, then get bounced onward with a fresh ticket.
 */
export function loginThenSport(sport, path = '/') {
  const params = new URLSearchParams({ sport: sport.key, path })
  return `/login?${params.toString()}`
}
