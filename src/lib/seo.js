import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { doc, getDoc } from 'firebase/firestore'
import { identityDb, configured } from '../firebase'

const ORIGIN = 'https://matchpulse.co.za'

// Built-in defaults if the /_meta/seoSettings doc is missing or unreadable.
// Anything the admin saves in the SEO tab overrides these.
const DEFAULTS = {
  siteTitle:       'MatchPulse | School and club sport, live scored and on the record',
  siteDescription: 'School and club sport, live scored and on the record. Results, live scores and Match Days online the moment the whistle goes, across rugby, hockey, netball and water polo. Free to start.',
  ogTitle:         'MatchPulse | School and club sport, live scored and on the record',
  ogDescription:   'Every match, scored once. Seen by everyone. School and club results, live scores and Match Days online the moment the whistle goes.',
  ogImage:         'https://matchpulse.co.za/og-image.png',
  themeColor:      '#059669',
  gaMeasurementId: '',
  headCode:        '',
}

// Per-route page titles. The homepage keeps the full site title; other public
// pages get "Page — MatchPulse". Private routes are also marked noindex.
const ROUTES = {
  '/':                     { title: null },
  '/products':             { title: 'Plans & Pricing — MatchPulse' },
  '/organizations':        { title: 'Schools & Clubs — MatchPulse' },
  '/tournaments':          { title: 'Tournaments & Competitions — MatchPulse' },
  '/signup':               { title: 'Create an Account — MatchPulse' },
  '/login':                { title: 'Sign In — MatchPulse' },
  '/legal/terms':          { title: 'Terms and Conditions — MatchPulse' },
  '/legal/privacy':        { title: 'Privacy Policy — MatchPulse' },
  '/legal/acceptable-use': { title: 'Acceptable Use Policy — MatchPulse' },
  '/legal/cookies':        { title: 'Cookie Policy — MatchPulse' },
  '/account':              { title: 'Your Account — MatchPulse', noindex: true },
  '/admin':                { title: 'Admin — MatchPulse',        noindex: true },
  '/portal':               { title: 'MatchPulse',                noindex: true },
  '/invoice/new':          { title: 'New Invoice — MatchPulse',  noindex: true },
  '/organisations':        { title: 'Manage — MatchPulse', noindex: true },
  '/organisations/new':    { title: 'Add a school or club — MatchPulse', noindex: true },
}

// Dynamic private routes (e.g. /invoices/:id, /organisations/:id/edit,
// /subscribe/:orgId). Public /schools|clubs|... profiles are NOT here — they
// are indexable, with canonical = ORIGIN + their prefixed path.
const NOINDEX_PREFIXES = ['/invoices/', '/organisations/', '/subscribe/', '/admin/']

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

function setLink(rel, href) {
  let el = document.head.querySelector(`link[rel="${rel}"][data-managed]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    el.setAttribute('data-managed', '1')
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function setRobots(noindex) {
  let el = document.head.querySelector('meta[name="robots"][data-managed]')
  if (!noindex) { if (el) el.remove(); return }
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', 'robots')
    el.setAttribute('data-managed', '1')
    document.head.appendChild(el)
  }
  el.setAttribute('content', 'noindex, nofollow')
}

// Inject admin-supplied custom head code (StatCounter, verification tags, …).
// Runs once per tab. innerHTML alone would leave <script> inert, so scripts are
// rebuilt as real elements — that's what makes counters actually execute.
let headCodeInjected = false
function injectHeadCode(html) {
  if (headCodeInjected || !html || !html.trim()) return
  headCodeInjected = true
  const container = document.createElement('div')
  container.innerHTML = html
  for (const node of Array.from(container.childNodes)) {
    if (node.nodeName === 'SCRIPT') {
      const s = document.createElement('script')
      for (const a of node.attributes) s.setAttribute(a.name, a.value)
      s.text = node.textContent
      document.head.appendChild(s)
    } else {
      document.head.appendChild(node.cloneNode(true))
    }
  }
}

// Load the Google Analytics 4 tag (gtag.js) once per tab when a valid
// Measurement ID (G-XXXX) is configured. Real <script> elements — innerHTML
// would leave the remote loader inert.
let gaInjected = false
function injectGoogleAnalytics(id) {
  const mid = (id || '').trim()
  if (gaInjected || !/^G-[A-Z0-9]+$/i.test(mid)) return
  gaInjected = true
  const loader = document.createElement('script')
  loader.async = true
  loader.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(mid)}`
  document.head.appendChild(loader)
  const init = document.createElement('script')
  init.text = `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}`
    + `gtag('js',new Date());gtag('config',${JSON.stringify(mid)});`
  document.head.appendChild(init)
}

function applySite(seo) {
  setMeta('meta[name="description"]',        'content', seo.siteDescription)
  setMeta('meta[property="og:title"]',       'content', seo.ogTitle || seo.siteTitle)
  setMeta('meta[property="og:description"]', 'content', seo.ogDescription || seo.siteDescription)
  setMeta('meta[property="og:image"]',       'content', seo.ogImage)
  setMeta('meta[name="twitter:image"]',      'content', seo.ogImage)
  setMeta('meta[name="twitter:title"]',      'content', seo.ogTitle || seo.siteTitle)
  setMeta('meta[name="twitter:description"]','content', seo.ogDescription || seo.siteDescription)
  setMeta('meta[name="theme-color"]',        'content', seo.themeColor)
  injectGoogleAnalytics(seo.gaMeasurementId)
  injectHeadCode(seo.headCode)
}

function applyRoute(seo, pathname) {
  const route = ROUTES[pathname] || {}
  const prefixNoindex = NOINDEX_PREFIXES.some(p => pathname.startsWith(p))
  // Noindex pages that set no explicit title fall back to a neutral name — the
  // page itself (invoice, org editor, admin) sets a better one once it loads.
  const noindexTitle = pathname.startsWith('/invoices/') ? 'Invoice — MatchPulse'
    : pathname.startsWith('/admin') ? 'Admin — MatchPulse' : 'MatchPulse'
  document.title = route.title || (prefixNoindex ? noindexTitle : seo.siteTitle)
  setLink('canonical', ORIGIN + (pathname === '/' ? '/' : pathname))
  setMeta('meta[property="og:url"]', 'content', ORIGIN + (pathname === '/' ? '/' : pathname))
  setRobots(!!route.noindex || prefixNoindex)
}

// Site-wide SEO + per-route title/canonical. Called once from App, inside the
// Router, so it re-applies on every navigation.
export function useSiteSeo() {
  const { pathname } = useLocation()
  useEffect(() => {
    if (typeof document === 'undefined') return
    let cancelled = false
    loadSeo().then(seo => {
      if (cancelled) return
      applySite(seo)
      applyRoute(seo, pathname)
    })
    return () => { cancelled = true }
  }, [pathname])
}
