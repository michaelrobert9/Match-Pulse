import { useEffect } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import Nav from './components/Nav'
import Footer from './components/Footer'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Account from './pages/Account'
import Portal from './pages/Portal'
import Products from './pages/Products'
import NewInvoice from './pages/NewInvoice'
import Invoice from './pages/Invoice'
import Organisations from './pages/Organisations'
import OrgForm from './pages/OrgForm'
import OrgProfile from './pages/OrgProfile'
import OrgRedirect from './pages/OrgRedirect'
import SubscribeProfile from './pages/SubscribeProfile'
import Admin from './pages/Admin'
import Terms from './pages/legal/Terms'
import Privacy from './pages/legal/Privacy'
import AcceptableUse from './pages/legal/AcceptableUse'
import Cookies from './pages/legal/Cookies'
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
  return (
    <>
      <ScrollToTop />
      <Nav />
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
      <Footer />
    </>
  )
}
