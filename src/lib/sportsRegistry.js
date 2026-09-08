// The sports registry — the admin-editable version of the sport list.
//
// `src/lib/sports.js` holds the built-in defaults (the sports that have real
// apps/databases). This module layers a Firestore-backed override on top,
// stored at `_meta/sports` in the (default) database, so a platform admin can:
//   • turn a sport on/off for the PUBLIC hub (homepage cards + footer),
//   • edit its name/colour/website/blurb, reorder it, and
//   • add a brand-new "coming soon" sport that has no website yet.
//
// Turning a sport OFF only hides it from the public hub — the sport's own site
// and data are untouched, and the functional lists (org activation, venues,
// tournaments) keep using the built-in `SPORTS`. Written only by a platform
// admin (see firestore.rules `_meta/sports`); read publicly.

import { useEffect, useState } from 'react'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { identityDb } from '../firebase'
import { SPORTS } from './sports'

// The built-in sports, shaped as registry rows (all active by default).
export function defaultRegistry() {
  return SPORTS.map((s, i) => ({
    key: s.key,
    name: s.name,
    hue: s.hue,
    host: s.host,
    blurb: s.blurb,
    newlyLaunched: !!s.newlyLaunched,
    comingSoon: false,
    active: true,
    order: i,
  }))
}

function normalise(list) {
  return list
    .map((s, i) => ({ active: true, comingSoon: false, order: i, ...s }))
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
}

// One shared in-flight load per page, so the Footer and the homepage don't each
// hit Firestore. Reset by saveRegistry and by loadRegistry({ fresh: true }).
let cache = null

export function loadRegistry({ fresh = false } = {}) {
  if (fresh) cache = null
  if (cache) return cache
  cache = (async () => {
    if (!identityDb) return defaultRegistry()
    try {
      const snap = await getDoc(doc(identityDb, '_meta', 'sports'))
      const arr = snap.exists() ? snap.data().sports : null
      if (Array.isArray(arr) && arr.length) return normalise(arr)
    } catch {
      /* offline or blocked — fall back to the built-in defaults */
    }
    return defaultRegistry()
  })()
  return cache
}

export async function saveRegistry(sports) {
  const clean = sports.map((s, i) => ({
    key: (s.key || '').trim(),
    name: (s.name || '').trim(),
    hue: s.hue || '#059669',
    host: (s.host || '').trim(),
    blurb: (s.blurb || '').trim(),
    newlyLaunched: !!s.newlyLaunched,
    comingSoon: !!s.comingSoon,
    active: s.active !== false,
    order: i,
  }))
  await setDoc(
    doc(identityDb, '_meta', 'sports'),
    { sports: clean, updatedAt: serverTimestamp() },
    { merge: true },
  )
  cache = Promise.resolve(clean)
  return clean
}

// Active sports for the public hub. Starts from the built-in defaults so the
// first paint is never empty, then reconciles with the stored registry.
export function useHubSports() {
  const [sports, setSports] = useState(() => defaultRegistry())
  useEffect(() => {
    let alive = true
    loadRegistry().then((list) => {
      if (alive) setSports(list)
    })
    return () => {
      alive = false
    }
  }, [])
  return sports.filter((s) => s.active !== false)
}
