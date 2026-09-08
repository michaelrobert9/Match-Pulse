import { Link } from 'react-router-dom'
import { useHubSports } from '../lib/sportsRegistry'
import { CONTACT_EMAIL } from '../lib/config'

export default function Footer() {
  const sports = useHubSports()
  return (
    <footer>
      <div className="wrap">
        <div className="foot-top">
          <div className="foot-brand">
            <Link to="/" className="wordmark"><span className="m">Match</span><span className="p">Pulse</span></Link>
            <p>
              MatchPulse is the simpler way for schools, clubs and competition organisers to
              collect, publish and follow sports results.
            </p>
          </div>

          <div className="foot-col">
            <h5>Find Your Sport</h5>
            <ul>
              {sports.filter(s => s.host).map(s => (
                <li key={s.key}><a href={s.host}>{s.name}</a></li>
              ))}
            </ul>
          </div>

          <div className="foot-col">
            <h5>Use MatchPulse</h5>
            <ul>
              <li><Link to="/products">Plans</Link></li>
              <li><Link to="/organizations">Schools &amp; Clubs</Link></li>
              <li><Link to="/tournaments">Tournaments</Link></li>
              <li><Link to="/products#faq">FAQ</Link></li>
            </ul>
          </div>

          <div className="foot-col">
            <h5>Support</h5>
            <ul>
              <li><Link to="/products#faq">Help Centre</Link></li>
              <li><a href={`mailto:${CONTACT_EMAIL}`}>Contact</a></li>
            </ul>
          </div>

          <div className="foot-col">
            <h5>Account</h5>
            <ul>
              <li><Link to="/signup">Create an Account</Link></li>
              <li><Link to="/login">Sign In</Link></li>
            </ul>
          </div>

          <div className="foot-col">
            <h5>Legal</h5>
            <ul>
              <li><Link to="/legal/terms">Terms of Use</Link></li>
              <li><Link to="/legal/privacy">Privacy Policy</Link></li>
            </ul>
          </div>
        </div>

        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} MatchPulse. All rights reserved.</span>
          <span className="legal-links">
            <Link to="/legal/terms">Terms</Link>
            <Link to="/legal/privacy">Privacy</Link>
            <Link to="/legal/cookies">Cookies</Link>
            <a href={`mailto:${CONTACT_EMAIL}`}>Contact</a>
          </span>
        </div>
      </div>
    </footer>
  )
}
