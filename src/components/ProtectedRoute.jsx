import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// `adminOnly` additionally requires the platformAdmin flag on the user's central
// profile — the same authority sport rules gate on via the custom claim. Signed
// in but not admin lands on /account rather than /login.
export default function ProtectedRoute({ children, adminOnly = false }) {
  const { user, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="spinner" role="status" aria-label="Loading" />
      </div>
    )
  }
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/login?next=${next}`} replace />
  }
  if (adminOnly && !profile?.platformAdmin) {
    return <Navigate to="/account" replace />
  }
  return children
}
