import { useEffect, lazy, Suspense } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import Footer from './components/Footer'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
// Every route below the landing page is code-split: its JavaScript is fetched
// only when that page is first visited, so the initial load stays small/fast.
// After a redeploy an old cached index.html can point at chunk hashes that no
// longer exist; a failed chunk import then blanks the route. lazyReload catches
// that and reloads ONCE to pull the fresh index.html, instead of vanishing.
function lazyReload(factory) {
  return lazy(() => factory().catch((err) => {
    const KEY = 'mp-chunk-reload'
    try {
      if (!sessionStorage.getItem(KEY)) {
        sessionStorage.setItem(KEY, String(Date.now()))
        window.location.reload()
        return new Promise(() => {})   // hang while the page reloads
      }
    } catch { /* storage blocked — fall through and surface the error */ }
    throw err
  }))
}
const Login = lazyReload(() => import('./pages/Login'))
const Signup = lazyReload(() => import('./pages/Signup'))
const Account = lazyReload(() => import('./pages/Account'))
const Portal = lazyReload(() => import('./pages/Portal'))
const Products = lazyReload(() => import('./pages/Products'))
const NewInvoice = lazyReload(() => import('./pages/NewInvoice'))
const Invoice = lazyReload(() => import('./pages/Invoice'))
const Organisations = lazyReload(() => import('./pages/Organisations'))
const OrgForm = lazyReload(() => import('./pages/OrgForm'))
const OrgProfile = lazyReload(() => import('./pages/OrgProfile'))
const OrgRedirect = lazyReload(() => import('./pages/OrgRedirect'))
const OrgDirectory = lazyReload(() => import('./pages/OrgDirectory'))
const SubscribeProfile = lazyReload(() => import('./pages/SubscribeProfile'))
const Tournaments = lazyReload(() => import('./pages/Tournaments'))
const Venue = lazyReload(() => import('./pages/Venue'))
const Admin = lazyReload(() => import('./pages/Admin'))
const Terms = lazyReload(() => import('./pages/legal/Terms'))
const Privacy = lazyReload(() => import('./pages/legal/Privacy'))
const AcceptableUse = lazyReload(() => import('./pages/legal/AcceptableUse'))
const Cookies = lazyReload(() => import('./pages/legal/Cookies'))
import { configured } from './firebase'
import { useSiteSeo } from './lib/seo'

// Shown instead of the app when the Firebase web config is missing, rather than
// letting every auth call fail with an opaque runtime error.
function NotConfigured() {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1 className="auth-title">Not configured yet</h1>
        <p className="auth-sub">
          The Firebase web config is missing from this build. Add the
          {' '}<code>VITE_FIREBASE_*</code> secrets and redeploy.
        </p>
      </div>
    </div>
  )
}

// Reset scroll on route change. Without this an SPA keeps the previous page's
// scroll depth, so a short page opened from deep in the homepage renders with
// its heading stranded above the sticky nav. Hash links (/#pricing) scroll to
// their section instead — React Router doesn't do that on its own either.
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) { el.scrollIntoView(); return }
    }
    window.scrollTo(0, 0)
  }, [pathname, hash])
  return null
}

export default function App() {
  useSiteSeo()
  const { pathname } = useLocation()
  // The admin section is a self-contained shell (its own sidebar + mobile
  // hamburger), like the sport sites — so the public nav/footer step aside there.
  const bareChrome = pathname.startsWith('/admin')
  return (
    <>
      <ScrollToTop />
      {!bareChrome && <Nav />}
      <Suspense fallback={<div className="route-loading">Loading…</div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/login"  element={configured ? <Login />  : <NotConfigured />} />
        <Route path="/signup" element={configured ? <Signup /> : <NotConfigured />} />
        {/* PayFast return_url — where a buyer lands after paying. */}
        <Route path="/portal" element={
          <ProtectedRoute><Portal /></ProtectedRoute>
        } />
        {/* PayFast cancel_url — send them back to the pricing section. */}
        <Route path="/plans" element={<Navigate to="/products" replace />} />
        <Route path="/account" element={
          <ProtectedRoute><Account /></ProtectedRoute>
        } />
        <Route path="/invoice/new" element={
          <ProtectedRoute><NewInvoice /></ProtectedRoute>
        } />
        <Route path="/invoices/:id" element={
          <ProtectedRoute><Invoice /></ProtectedRoute>
        } />
        <Route path="/organisations" element={
          <ProtectedRoute><Organisations /></ProtectedRoute>
        } />
        <Route path="/organisations/new" element={
          <ProtectedRoute><OrgForm /></ProtectedRoute>
        } />
        <Route path="/organisations/:id/edit" element={
          <ProtectedRoute><OrgForm /></ProtectedRoute>
        } />
        <Route path="/subscribe/:orgId" element={
          <ProtectedRoute><SubscribeProfile /></ProtectedRoute>
        } />

        {/* Public directories (front doors), indexable. */}
        <Route path="/organizations" element={<OrgDirectory />} />
        <Route path="/tournaments"   element={<Tournaments />} />
        <Route path="/venues/:slug"  element={<Venue />} />

        {/* Public, type-prefixed org profiles (free identity + gated matches). */}
        <Route path="/schools/:slug"      element={<OrgProfile prefix="schools" />} />
        <Route path="/clubs/:slug"        element={<OrgProfile prefix="clubs" />} />
        <Route path="/associations/:slug" element={<OrgProfile prefix="associations" />} />
        <Route path="/leagues/:slug"      element={<OrgProfile prefix="leagues" />} />
        {/* Legacy → prefixed redirects. `new` is matched above, so it never hits this. */}
        <Route path="/o/:slug"            element={<OrgRedirect />} />
        <Route path="/organisations/:slug" element={<OrgRedirect />} />
        <Route path="/admin" element={
          <ProtectedRoute adminOnly><Admin /></ProtectedRoute>
        } />
        <Route path="/legal/terms"          element={<Terms />} />
        <Route path="/legal/privacy"        element={<Privacy />} />
        <Route path="/legal/acceptable-use" element={<AcceptableUse />} />
        <Route path="/legal/cookies"        element={<Cookies />} />
        <Route path="/legal"                element={<Navigate to="/legal/terms" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      {!bareChrome && <Footer />}
    </>
  )
}
