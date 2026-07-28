import { Routes, Route, Navigate } from 'react-router-dom'
import Nav from './components/Nav'
import Footer from './components/Footer'
import ProtectedRoute from './components/ProtectedRoute'
import Home from './pages/Home'
import Login from './pages/Login'
import Signup from './pages/Signup'
import Account from './pages/Account'
import Portal from './pages/Portal'
import { configured } from './firebase'

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

export default function App() {
  return (
    <>
      <Nav />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login"  element={configured ? <Login />  : <NotConfigured />} />
        <Route path="/signup" element={configured ? <Signup /> : <NotConfigured />} />
        {/* PayFast return_url — where a buyer lands after paying. */}
        <Route path="/portal" element={
          <ProtectedRoute><Portal /></ProtectedRoute>
        } />
        {/* PayFast cancel_url — send them back to the pricing section. */}
        <Route path="/plans" element={<Navigate to="/#plans" replace />} />
        <Route path="/account" element={
          <ProtectedRoute><Account /></ProtectedRoute>
        } />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Footer />
    </>
  )
}
