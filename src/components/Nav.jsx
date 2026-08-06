import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const SECTIONS = [
  { href: '/#find',        label: 'Find Your Sport' },
  { href: '/#how',         label: 'How It Works' },
  { href: '/#competition', label: 'Competitions' },
  { href: '/#pricing',     label: 'Pricing' },
  { href: '/#faq',         label: 'Help' },
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

  return (
    <header className={scrolled ? 'scrolled' : ''}>
      <div className="wrap nav">
        <Link to="/" className="wordmark" aria-label="MatchPulse home">
          <span className="m">Match</span><span className="p">Pulse</span>
        </Link>

        <nav className="nav-links" aria-label="Primary">
          {SECTIONS.map(s => (
            <a key={s.href} className="link" href={s.href}>{s.label}</a>
          ))}
        </nav>

        <div className="nav-cta">
          {loading ? null : user ? (
            <>
              {isAdmin && <Link className="btn btn-ghost btn-sm" to="/admin">Admin</Link>}
              <Link className="btn btn-primary btn-sm" to="/account">My account</Link>
            </>
          ) : (
            <>
              <Link className="btn btn-ghost btn-sm" to="/login">Sign In</Link>
              <Link className="btn btn-primary btn-sm" to="/signup">Create an Account</Link>
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
            {SECTIONS.map(s => <a key={s.href} href={s.href}>{s.label}</a>)}
            {user ? (
              <>
                {isAdmin && <Link to="/admin">Admin</Link>}
                <Link to="/account">My account</Link>
              </>
            ) : (
              <><Link to="/login">Sign In</Link><Link to="/signup">Create an Account</Link></>
            )}
          </div>
        </div>
      )}
    </header>
  )
}
