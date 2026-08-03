import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { httpsCallable } from 'firebase/functions'
import { useAuth } from '../contexts/AuthContext'
import { functions } from '../firebase'
import { SPORTS, displayHost } from '../lib/sports'
import { paymentUrl } from '../lib/payfast'

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

// A sport card links straight to that sport's own site, where the user signs in
// (or is already signed in). Each sport runs its own auth on its own origin —
// there is no cross-origin handoff, because iOS home-screen apps can't receive
// one. The main site just points the way.
function SportCard({ sport }) {
  return (
    <a className="sport reveal" style={{ '--hue': sport.hue }} href={sport.host}>
      <span className="sport-pill">{sport.name}</span>
      <h3>{sport.name}</h3>
      <p>{sport.blurb}</p>
      <div className="sport-foot">
        <span className="sport-domain">{displayHost(sport)}</span>
        <span className="sport-go">Enter<Arrow /></span>
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
            {SPORTS.map(s => <SportCard key={s.key} sport={s} />)}
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

          <p className="reveal" style={{ textAlign: 'center', marginTop: 22, fontSize: 14.5 }}>
            Full details, VAT invoices &amp; <strong>EFT payment option</strong>: <Link to="/products">See plans →</Link>
          </p>

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
      <ContactSection />
    </main>
  )
}

// ── Contact section ─────────────────────────────────────────────────────────
// The two visible email addresses are gone — reduces scraping. In their place:
// (a) a Call button whose tel: number is assembled from string parts inside a
// useEffect, so an HTML-only bot never sees it, and (b) a form that posts to
// the submitContactForm callable. Message copy sits in /admin > Messages until
// the SMTP-based email hop is wired.
function CallButton() {
  const [tel, setTel] = useState('')
  useEffect(() => {
    // Assembled at runtime — do not fold this into a single literal.
    setTel(['082', '886', '5413'].join(''))
  }, [])
  const pretty = tel ? `${tel.slice(0, 3)} ${tel.slice(3, 6)} ${tel.slice(6)}` : 'Call us'
  if (!tel) return <button className="btn btn-dark ci-call" disabled aria-label="Call us">Call us</button>
  return (
    <a className="btn btn-dark ci-call" href={`tel:${tel}`} aria-label={`Call ${pretty}`}>
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c.9.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" />
      </svg>
      Call {pretty}
    </a>
  )
}

function ContactSection() {
  const { user } = useAuth()
  const [form, setForm] = useState({ name: '', email: '', phone: '', message: '' })
  const [busy, setBusy] = useState(false)
  const [msg,  setMsg]  = useState(null)

  // Pre-fill from the signed-in profile so a member doesn't retype their basics.
  useEffect(() => {
    if (!user) return
    setForm(f => ({
      ...f,
      name:  f.name  || user.displayName || '',
      email: f.email || user.email       || '',
    }))
  }, [user])

  const bind = (key) => ({
    id:       `c-${key}`,
    value:    form[key],
    onChange: (e) => setForm(f => ({ ...f, [key]: e.target.value })),
  })

  async function submit(e) {
    e.preventDefault()
    setBusy(true); setMsg(null)
    try {
      const call = httpsCallable(functions, 'submitContactForm')
      await call(form)
      setMsg({ kind: 'ok', text: 'Thanks — your message is on its way. We\'ll be in touch shortly.' })
      setForm({ name: '', email: '', phone: '', message: '' })
    } catch (err) {
      setMsg({ kind: 'err', text: err?.message || 'Something went wrong. Please try again.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="block" id="contact">
      <div className="wrap">
        <div className="sec-head">
          <p className="label reveal">Contact</p>
          <h2 className="h2 reveal">Get in touch.</h2>
          <p className="sub reveal">Running a league, a festival or a whole association? Tell us your sport and we'll help you get set up.</p>
        </div>

        <div className="contact-grid">
          <div className="contact-info reveal">
            <h3>We'd love to hear from you.</h3>
            <p>Prefer to talk? Give us a call. Prefer to write? Use the form and we'll come back to you by email.</p>
            <div className="contact-list">
              <div className="contact-item">
                <span className="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2-.5c.9.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" /></svg></span>
                <div>
                  <div className="ci-label">Call</div>
                  <div className="ci-value"><CallButton /></div>
                </div>
              </div>
              <div className="contact-item">
                <span className="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 6L2 7" /></svg></span>
                <div><div className="ci-label">Write</div><div className="ci-value">Use the form and we'll email you back within one business day.</div></div>
              </div>
              <div className="contact-item">
                <span className="ci-ico"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 6-9 12-9 12S3 16 3 10a9 9 0 1118 0z" /><circle cx="12" cy="10" r="3" /></svg></span>
                <div><div className="ci-label">Based in</div><div className="ci-value">South Africa</div></div>
              </div>
            </div>
          </div>

          <form className="contact-form reveal" onSubmit={submit}>
            <div className="field">
              <label htmlFor="c-name">Your name</label>
              <input type="text" placeholder="Full name" autoComplete="name" required {...bind('name')} />
            </div>
            <div className="field">
              <label htmlFor="c-email">Email address</label>
              <input type="email" placeholder="you@example.com" autoComplete="email" required {...bind('email')} />
            </div>
            <div className="field">
              <label htmlFor="c-phone">Cellphone number <span className="opt">optional</span></label>
              <input type="tel" placeholder="e.g. 082 123 4567" autoComplete="tel" {...bind('phone')} />
            </div>
            <div className="field">
              <label htmlFor="c-message">Message</label>
              <textarea rows={4} placeholder="Which sport do you run, and how can we help?" required {...bind('message')} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send message'}
            </button>
            {msg && (
              <p className={`form-fine ${msg.kind === 'ok' ? 'form-ok' : 'form-err'}`} role="status">
                {msg.text}
              </p>
            )}
            {!msg && (
              <p className="form-fine">
                By sending this message you agree to our <Link to="/legal/terms">Terms</Link> and{' '}
                <Link to="/legal/privacy">Privacy Policy</Link>.
              </p>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}
