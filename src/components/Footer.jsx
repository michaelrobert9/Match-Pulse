import { Link } from 'react-router-dom'
import { SPORTS } from '../lib/sports'

export default function Footer() {
  return (
    <footer>
      <div className="wrap">
        <div className="foot-top">
          <div className="foot-brand">
            <Link to="/" className="wordmark"><span className="m">Match</span><span className="p">Pulse</span></Link>
            <p>The home of school and club sport. Live scores, instant results and automatic tables.</p>
          </div>
          <div className="foot-col">
            <h5>Sports</h5>
            <ul>
              {SPORTS.map(s => (
                <li key={s.key}><a href={s.host}>{s.name}</a></li>
              ))}
            </ul>
          </div>
          <div className="foot-col">
            <h5>Product</h5>
            <ul>
              <li><Link to="/#how">How it works</Link></li>
              <li><Link to="/#why">Features</Link></li>
              <li><Link to="/products">Plans &amp; pricing</Link></li>
              <li><Link to="/#contact">Contact us</Link></li>
            </ul>
          </div>
          <div className="foot-col">
            <h5>Legal</h5>
            <ul>
              <li><Link to="/legal/terms">Terms of Service</Link></li>
              <li><Link to="/legal/privacy">Privacy Policy</Link></li>
              <li><Link to="/legal/cookies">Cookie Policy</Link></li>
              <li><Link to="/legal/acceptable-use">Acceptable Use</Link></li>
            </ul>
          </div>
        </div>
        <div className="foot-bottom">
          <span>© {new Date().getFullYear()} MatchPulse. All rights reserved.</span>
          <span className="legal-links">
            <Link to="/legal/terms">Terms</Link>
            <Link to="/legal/privacy">Privacy</Link>
            <Link to="/legal/cookies">Cookies</Link>
            <Link to="/#contact">Contact</Link>
          </span>
        </div>
      </div>
    </footer>
  )
}
