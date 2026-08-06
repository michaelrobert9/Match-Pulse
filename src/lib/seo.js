import { useEffect } from 'react'
import { doc, getDoc } from 'firebase/firestore'
import { identityDb, configured } from '../firebase'

// Built-in defaults if the /_meta/seoSettings doc is missing or unreadable.
// Kept small on purpose — anything not covered here is left as whatever the
// bundle's index.html shipped with.
const DEFAULTS = {
  siteTitle:       'MatchPulse | Sports Results for Schools, Clubs and Competitions',
  siteDescription: 'MatchPulse lets coaches enter results directly after the match, saving schools, clubs and competition organisers from collecting and re-entering every score.',
  ogTitle:         'MatchPulse | Sports Results for Schools, Clubs and Competitions',
  ogDescription:   'Every coach enters one result. You see them all. Across rugby, hockey, netball and water polo.',
  ogImage:         '',
  themeColor:      '#059669',
}

// Cache the fetched settings for the life of the tab so every route change
// doesn't re-hit Firestore. First read wins; subsequent reads hydrate from cache.
let cached = null
let inflight = null

async function loadSeo() {
  if (cached) return cached
  if (!configured) { cached = DEFAULTS; return cached }
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const snap = await getDoc(doc(identityDb, '_meta', 'seoSettings'))
      cached = snap.exists() ? { ...DEFAULTS, ...snap.data() } : DEFAULTS
    } catch {
      cached = DEFAULTS
    }
    return cached
  })()
  return inflight
}

function setMeta(selector, attr, value) {
  if (!value) return
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement('meta')
    const [ , key, name ] = selector.match(/meta\[(\w+)="([^"]+)"]/) || []
    if (key && name) el.setAttribute(key, name)
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

function apply(seo) {
  if (seo.siteTitle) document.title = seo.siteTitle
  setMeta('meta[name="description"]',      'content', seo.siteDescription)
  setMeta('meta[property="og:title"]',     'content', seo.ogTitle || seo.siteTitle)
  setMeta('meta[property="og:description"]', 'content', seo.ogDescription || seo.siteDescription)
  setMeta('meta[property="og:image"]',     'content', seo.ogImage)
  setMeta('meta[name="theme-color"]',      'content', seo.themeColor)
}

// Apply the site-wide SEO settings. Safe to call from App on mount — noop
// server-side (`document` guarded), cached across route changes.
export function useSiteSeo() {
  useEffect(() => {
    if (typeof document === 'undefined') return
    let cancelled = false
    loadSeo().then(seo => { if (!cancelled) apply(seo) })
    return () => { cancelled = true }
  }, [])
}
