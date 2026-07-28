import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { SPORTS, displayHost } from '../lib/sports'
import { paymentUrl } from '../lib/payfast'
import { gotoSport, loginThenSport } from '../lib/handoff'

function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('.reveal')
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('in')); return
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.12 })
    items.forEach((el, i) => { el.style.transitionDelay = `${Math.min(i % 6, 5) * 55}ms`; io.observe(el) })
    return () => io.disconnect()
  }, [])
}

const Arrow = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
)

// A sport card. Signed in → mint a handoff ticket and go authenticated.
// Signed out → straight to the public site (it's readable without an account).
function SportCard({ sport, user }) {
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function open(e) {
    if (!user) return                       // let the plain link through
    e.preventDefault()
    setBusy(true)
    try {
      await gotoSport(sport)
    } catch {
      // Handoff failed — fall back to the public site rather than dead-ending.
      window.location.assign(sport.host)
    }
  }

  return (
    <a
      className="sport reveal"
      style={{ '--hue': sport.hue }}
      href={sport.host}
      onClick={open}
      aria-busy={busy}
    >
      <span className="sport-pill">{sport.name}</span>
      <h3>{sport.name}</h3>
      <p>{sport.blurb}</p>
      <div className="sport-foot">
        <span className="sport-domain">{displayHost(sport)}</span>
        <span className="sport-go">
          {busy ? 'Signing you in…' : user ? 'Enter' : 'Visit'}
          {!busy && <Arrow />}
        </span>
      </div>
    </a>
  )
}


// Paid-plan CTA. A payment has to carry the buyer's uid (see lib/payfast.js), so
// anyone not signed in creates an account first — otherwise PayFast takes the
// money and the ITN has no idea whose plan to activate.
function PlanCta({ plan, user, className, children }) {
  const navigate = useNavigate()

  function start(e) {
    e.preventDefault()
    if (!user) { navigate(`/signup?plan=${plan}`); return }
    window.location.assign(paymentUrl(plan, { uid: user.uid, email: user.email }))
  }

  return <a className={className} href="#plans" onClick={start}>{children}</a>
}

export default function Home() {
  useReveal()
  const { user, plan } = useAuth()

  return (
    <main id="top">

      {/* ── HERO ────────────────────────────────────────────────────────── */}
      <section className="hero">
        <div className="wrap">
          <p className="eyebrow"><span className="dot" />Live school &amp; club sport</p>
          <h1>Every match. <span className="accent">On the record.</span></h1>
          <p className="lede">
            MatchPulse is the home of school and club sport. Pick your sport below to create
            fixtures, score live and publish results the moment the whistle goes.
          </p>

          <div className="netstrip" aria-label="Live across MatchPulse">
            <span className="netchip">
              <span className="code"><span className="swatch" style={{ background: '#059669' }} />Hockey</span>
              <span className="vs">Rustenburg</span><span className="tnum sc">4</span>
              <span className="vs">–</span><span className="tnum sc">2</span><span className="vs">Herschel</span>
              <span className="livepill"><i />Live</span>
            </span>
            <span className="netchip">
              <span className="code"><span className="swatch" style={{ background: '#15803D' }} />Rugby</span>
              <span className="vs">Grey</span><span className="tnum sc">17</span>
              <span className="vs">–</span><span className="tnum sc">12</span><span className="vs">Paul Roos</span>
              <span className="livepill"><i />Live</span>
            </span>
          </div>
        </div>
      </section>

      {/* ── SPORTS HUB (primary focus) ──────────────────────────────────── */}
      <section id="sports">
        <div className="wrap">
          <div className="sports-head">
            <p className="label">Choose your sport</p>
            <h2>Pick your sport to jump straight in.</h2>
            <p>Each sport runs on its own MatchPulse platform, built for how it’s played and scored.</p>
          </div>

          <div className="sports">
            {SPORTS.map(s => <SportCard key={s.key} sport={s} user={user} />)}
          </div>

          <p className="sports-note">
            {user
              ? <>Signed in as <strong>{user.displayName || user.email}</strong> · <Link to="/account">Manage account</Link></>
              : <>Play a sport we haven’t launched yet? <a href="#contact">Tell us what you play</a> and we’ll bump it up the list.</>}
          </p>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────────────────────────────── */}
      <section className="block tint" id="how">
        <div className="wrap">
          <div className="sec-head">
            <p className="label reveal">From first whistle to final table</p>
            <h2 className="h2 reveal">Three steps. One source of truth.</h2>
          </div>
          <div className="flow">
            <div className="step reveal">
              <span className="bar" /><span className="idx tnum">01</span>
              <h3>Create a fixture</h3>
              <p>Set the teams, date and venue in any sport. MatchPulse handles the draw, the log and the rest.</p>
            </div>
            <div className="step reveal">
              <span className="bar" /><span className="idx tnum">02</span>
              <h3>Score it live</h3>
              <p>Tap to add scores and cards as they happen. The clock, the periods and the scoreline update in real time on every screen watching.</p>
            </div>
            <div className="step reveal">
              <span className="bar" /><span className="idx tnum">03</span>
              <h3>Publish instantly</h3>
              <p>The moment you hit full time, the result is on the record — feeding competitions, team pages and player stats automatically.</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────────────────────────────── */}
      <section className="block" id="why">
        <div className="wrap">
          <div className="sec-head">
            <p className="label reveal">Why MatchPulse</p>
            <h2 className="h2 reveal">Everything a fixture needs, in one place.</h2>
            <p className="sub reveal">Built for coaches on the sideline, organisers in the office and parents on the stand — whatever the sport.</p>
          </div>
          <div className="features">
            <div className="feat reveal">
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2 2M9 2h6" /></svg></div>
              <h3>Live scoring console</h3>
              <p>A pitch-side console built for one-handed tapping. Periods, clock, scores and cards. Big targets, no fumbling.</p>
            </div>
            <div className="feat reveal">
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3v12M6 21a3 3 0 100-6 3 3 0 000 6zM18 9a3 3 0 100-6 3 3 0 000 6zM18 9v3a6 6 0 01-12 0" /></svg></div>
              <h3>Competitions that run themselves</h3>
              <p>Build draws and competitions that organise themselves. Every fixture rolls into the right league, season and table.</p>
            </div>
            <div className="feat reveal">
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg></div>
              <h3>A page for every team</h3>
              <p>One home for every team — schools, clubs and age groups, with crests, squads and a full match history.</p>
            </div>
            <div className="feat reveal">
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10" /></svg></div>
              <h3>Instant publishing</h3>
              <p>Results go public the second the whistle blows. No exports, no waiting, no end-of-day admin.</p>
            </div>
            <div className="feat reveal">
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="12" width="3" height="6" /><rect x="12" y="8" width="3" height="10" /><rect x="17" y="4" width="3" height="14" /></svg></div>
              <h3>Live tables</h3>
              <p>Standings recalculate automatically off real results. Always current, never a stale spreadsheet.</p>
            </div>
            <div className="feat reveal">
              <div className="ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg></div>
              <h3>Every result, on the record</h3>
              <p>Every goal, try, card and final score kept permanently. Look back at any fixture, any season, any time.</p>
            </div>
          </div>

          <div className="record reveal">
            <div className="big tnum">0<small>sec</small></div>
            <p>That’s the gap between the final whistle and a published result. The match is on the record before you’ve left the field.</p>
          </div>
        </div>
      </section>

      {/* ── PLANS ───────────────────────────────────────────────────────── */}
      <section className="block tint" id="plans">
        <div className="wrap">
          <div className="sec-head center">
            <p className="label reveal">Pricing</p>
            <h2 className="h2 reveal">One platform. Three ways to run it.</h2>
            <p className="sub center reveal">Free where it should be. Fair where it counts. The same complete platform, every sport, every plan.</p>
            <div className="plans-callout reveal">
              <p className="co-head">Built for the organiser.</p>
              <p className="co-sub">Not a spreadsheet. Not a WhatsApp group. A platform your competition actually deserves.</p>
            </div>
          </div>

          <div className="tier-grid">
            <div className="tier reveal">
              <p className="eyebrow2">For clubs &amp; schools</p>
              <h3>Free</h3>
              <p className="tagline">Your team, your fixtures, your records. Always free.</p>
              <div className="price-row"><span className="price">R0</span></div>
              <p className="note">No card. No trial. No end date.</p>
              <hr />
              <ul>
                <li>One organisation</li>
                <li>Unlimited teams</li>
                <li>Unlimited fixtures, forever</li>
              </ul>
              <Link className="cta dark" to={user ? '/account' : '/signup'}>
                {plan?.key === 'free' && user ? 'Your current plan' : 'Start free'}
              </Link>
            </div>

            <div className="tier featured reveal">
              <span className="tier-badge">Single event</span>
              <p className="eyebrow2">For organisers</p>
              <h3>Plus</h3>
              <p className="tagline">One competition, run beautifully. Pay once. Keep it forever.</p>
              <div className="price-row"><span className="price">R2,000</span><span className="per">once-off</span></div>
              <p className="note">One price. No setup fee. Nothing more to pay.</p>
              <hr />
              <ul>
                <li>One tournament, league or festival</li>
                <li>Unlimited teams</li>
                <li>Unlimited fixtures</li>
              </ul>
              <PlanCta plan="event" user={user} className="cta primary">Run an event</PlanCta>
            </div>

            <div className="tier reveal">
              <p className="eyebrow2">For associations</p>
              <h3>Pro</h3>
              <p className="tagline">Your entire season, every division, under one roof.</p>
              <div className="price-row"><span className="price">R15,000</span><span className="per">/ year</span></div>
              <p className="note">Unlimited everything. One annual fee.</p>
              <hr />
              <ul>
                <li>Unlimited tournaments, leagues &amp; festivals</li>
                <li>Unlimited teams</li>
                <li>Unlimited fixtures, all year</li>
              </ul>
              <PlanCta plan="pro" user={user} className="cta dark">Go Pro</PlanCta>
            </div>
          </div>

          <div className="sec-head center" style={{ marginTop: 72 }}>
            <p className="label reveal">Standard on every plan</p>
            <h2 className="h2 reveal">The whole platform. Every time.</h2>
            <p className="sub center reveal">There’s no cut-down version of MatchPulse. Free or Pro, you get all of it.</p>
          </div>
          <div className="feat-groups">
            <div className="feat-group reveal">
              <h4>Fixtures &amp; scheduling</h4>
              <ul>
                <li>Auto-generate a full fixture list in seconds</li>
                <li>Hand-build your draw when you want full control</li>
                <li>Smart auto-scheduler</li>
                <li>Automatic knockout rounds: quarters, semis and finals</li>
                <li>Run matches across multiple fields at once</li>
                <li>Share any fixture list as a print-ready PDF</li>
              </ul>
            </div>
            <div className="feat-group reveal">
              <h4>Match day &amp; the clock</h4>
              <ul>
                <li>Live scoring, updated the moment it happens</li>
                <li>Match countdown timers</li>
                <li>30-second warning before full time</li>
                <li>Period-break timers with their own warning</li>
                <li>Fully configurable periods: count, length and break</li>
              </ul>
            </div>
            <div className="feat-group reveal">
              <h4>Results, standings &amp; story</h4>
              <ul>
                <li>Points, logs and standings update themselves</li>
                <li>Custom tie-breaker rules, applied automatically</li>
                <li>Full team and player statistics</li>
                <li>A complete match timeline of every key moment</li>
                <li>Every action credited to the player who made it</li>
                <li>Your organisation’s logo across everything</li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ─────────────────────────────────────────────────────── */}
      <section className="block" id="contact">
        <div className="wrap">
          <div className="sec-head">
            <p className="label reveal">Contact</p>
            <h2 className="h2 reveal">Get in touch.</h2>
            <p className="sub reveal">Running a league, a festival or a whole association? Tell us your sport and we’ll help you get set up.</p>
          </div>

          <div className="contact-grid">
            <div className="contact-info reveal">
              <h3>We’d love to hear from you.</h3>
              <p>Have a question or need a hand getting a competition off the ground? Send us a message and we’ll get back to you by email.</p>
              <div className="contact-list">
                <div className="contact-item">
                  <span className="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg></span>
                  <div><div className="ci-label">General</div><div className="ci-value">hello@matchpulse.co.za</div></div>
                </div>
                <div className="contact-item">
                  <span className="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M7 6V4h10v2M6 6l1 14h10l1-14" /></svg></span>
                  <div><div className="ci-label">Billing &amp; invoices</div><div className="ci-value">billing@matchpulse.co.za</div></div>
                </div>
                <div className="contact-item">
                  <span className="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" /><circle cx="12" cy="10" r="3" /></svg></span>
                  <div><div className="ci-label">Based in</div><div className="ci-value">South Africa</div></div>
                </div>
              </div>
            </div>

            <form className="contact-form reveal" onSubmit={e => e.preventDefault()}>
              <div className="field">
                <label htmlFor="c-name">Your name</label>
                <input id="c-name" type="text" placeholder="Full name" autoComplete="name" />
              </div>
              <div className="field">
                <label htmlFor="c-email">Email address</label>
                <input id="c-email" type="email" placeholder="you@example.com" autoComplete="email" />
              </div>
              <div className="field">
                <label htmlFor="c-phone">Cellphone number</label>
                <input id="c-phone" type="tel" placeholder="e.g. 082 123 4567" autoComplete="tel" />
              </div>
              <div className="field">
                <label htmlFor="c-msg">Message</label>
                <textarea id="c-msg" rows={4} placeholder="Which sport do you run, and how can we help?" />
              </div>
              <button type="submit" className="btn btn-primary">Send message</button>
              <p className="form-fine">
                By sending this message you agree to our <a href="#legal">Terms</a> and{' '}
                <a href="#legal">Privacy Policy</a>. The form is wired up once the contact
                function is deployed.
              </p>
            </form>
          </div>
        </div>
      </section>
    </main>
  )
}
