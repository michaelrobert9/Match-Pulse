import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Where PayFast returns the buyer after a successful payment.
//
// The ITN webhook lands a moment AFTER the browser gets redirected here, so the
// plan is briefly still the old one. Rather than showing someone who just paid
// their old plan, poll for a short while and refresh the auth token — sport
// subdomains gate on the entitlement claim, so the token has to catch up too.
const MAX_TRIES = 6
const RETRY_MS  = 1500

export default function Portal() {
  const { user, plan, refresh, loading } = useAuth()
  const [settling, setSettling] = useState(true)
  const tries = useRef(0)

  useEffect(() => {
    if (loading || !user) { setSettling(false); return }
    if (plan.hasPlan) { setSettling(false); return }   // already landed

    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      tries.current += 1
      await refresh()
      // Pull fresh custom claims so the sports know about the new plan.
      await user.getIdToken(true).catch(() => {})
      if (cancelled) return
      if (tries.current >= MAX_TRIES) { setSettling(false); return }
      setTimeout(tick, RETRY_MS)
    }
    const t = setTimeout(tick, RETRY_MS)
    return () => { cancelled = true; clearTimeout(t) }
  }, [loading, user, plan.hasPlan, refresh])

  if (loading || settling) {
    return (
      <div className="auth-shell">
        <div className="auth-card" style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 18px' }} role="status" aria-label="Activating" />
          <h1 className="auth-title">Activating your plan…</h1>
          <p className="auth-sub" style={{ marginBottom: 0 }}>
            This usually takes a few seconds. You can leave this page — your plan will be
            active either way.
          </p>
        </div>
      </div>
    )
  }

  const activated = plan.hasPlan

  return (
    <div className="auth-shell">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <p className="auth-eyebrow">{activated ? 'Payment received' : 'Thanks'}</p>
        <h1 className="auth-title">{activated ? `You’re on ${plan.label}.` : 'Payment received.'}</h1>
        <p className="auth-sub">
          {activated
            ? 'Everything is unlocked. Pick a sport and get your competition started.'
            : 'Your payment went through. Activation can take a minute or two — refresh, or check your account shortly. If it still looks wrong, email billing@matchpulse.co.za and we’ll sort it out.'}
        </p>
        <Link className="btn btn-primary auth-submit" to="/account">Go to my account</Link>
        <p className="auth-foot"><Link to="/#sports">Choose a sport</Link></p>
      </div>
    </div>
  )
}
