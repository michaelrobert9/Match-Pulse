import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

// Primary nav — real routes (not homepage hash sections). Every item is a public
// front-end page; "Schools & Clubs" is the public directory for everyone (owners
// reach management via the separate Manage/Admin button, not this link).
const SECTIONS = [
  { to: '/',              label: 'Home' },
  { to: '/products',      label: 'Pricing' },
  { to: '/organizations', label: 'Schools & Clubs' },
  { to: '/tournaments',   label: 'Tournaments' },
]

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [open,     setOpen]     = useState(false)
  const { user, profile, loading } = useAuth()
  const isAdmin                    = profile?.platformAdmin === true
  const location                = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    window.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Collapse the mobile menu whenever the route changes.
  useEffect(() => { setOpen(false) }, [location.pathname, location.hash])

  const name    = user?.displayName || profile?.displayName || user?.email?.split('@')[0] || 'Account'
  const initial = (name || '?').slice(0, 1).toUpperCase()
  const photo   = profile?.photoURL || user?.photoURL || null
  const isActive = (to) => (to === '/' ? location.pathname === '/' : location.pathname.startsWith(to))

  return (
    <header className={scrolled ? 'scrolled' : ''}>
      <div className="wrap nav">
        <Link to="/" className="wordmark" aria-label="MatchPulse home">
          <span className="m">Match</span><span className="p">Pulse</span>
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {SECTIONS.map(s => {
            const to = (user && s.authedTo) ? s.authedTo : s.to
            return <Link key={s.label} className={'link' + (isActive(s.to) ? ' active' : '')} to={to}>{s.label}</Link>
          })}
        </nav>

        <div className="nav-cta">
          {user && (
            <Link className={'btn btn-sm nav-admin-btn' + (location.pathname.startsWith('/admin') ? ' active' : '')} to="/admin">{isAdmin ? 'Admin' : 'Manage'}</Link>
          )}
          {loading ? null : user ? (
            <Link className="nav-acct" to="/account" aria-label="Your account">
              {photo
                ? <img className="nav-acct-av" src={photo} alt="" />
                : <span className="nav-acct-av">{initial}</span>}
              <span className="nav-acct-name">{name}</span>
            </Link>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm nav-signin" to="/login">Sign In</Link>
              <Link className="btn btn-primary btn-sm nav-signup" to="/signup">Create an Account</Link>
            </>
          )}
          <button
            className="menu-btn"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            onClick={() => setOpen(o => !o)}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <div id="mnav">
          <div className="wrap">
            {SECTIONS.map(s => <Link key={s.label} to={(user && s.authedTo) ? s.authedTo : s.to}>{s.label}</Link>)}
            {user && <Link className="mnav-admin" to="/admin">{isAdmin ? 'Admin' : 'Manage'}</Link>}
            <div className="mnav-sep" />
            {user ? (
              <Link to="/account">{name} · My account</Link>
            ) : (
              <><Link to="/login">Sign In</Link><Link to="/signup">Create an Account</Link></>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
