import { Link } from 'react-router-dom'
import { CONTACT_EMAIL } from '../lib/config'
import { faqs } from '../lib/homeContent'
import { SPORTS } from '../lib/sports'

// Help Centre — a real support page: quick links, a getting-started walk-through,
// the FAQ (shared with /products), and how to reach a person.
function FaqItem({ q, a }) {
  return (
    <details className="faq-item">
      <summary><span>{q}</span><span className="faq-mark" aria-hidden="true" /></summary>
      <div className="faq-answer"><p>{a}</p></div>
    </details>
  )
}

const CARDS = [
  { title: 'Getting started', body: 'Create an account and get your school or club onto MatchPulse.', to: '#start', label: 'See the steps' },
  { title: 'Plans and pricing', body: 'What is free, and what a competition costs.', to: '/products', label: 'View plans' },
  { title: 'Find results', body: 'Search for a school or club and follow their matches.', to: '/organizations', label: 'Browse schools & clubs' },
  { title: 'Manage your school', body: 'Edit your details, people, venues and images in one place.', to: '/admin', label: 'Open management' },
]

const STEPS = [
  { h: 'Create a free account', p: <>Sign up with your email. One account works across every MatchPulse sport. <Link to="/signup">Create an account</Link>.</> },
  { h: 'Get your school or club on MatchPulse', p: <>Apply to add your school or club. Once it is approved you can manage its sport for free with an Everyday MatchPulse account. <Link to="/admin">Apply or manage</Link>.</> },
  { h: 'Add teams and score matches', p: <>Open your sport&rsquo;s own site to add teams, capture results and score matches live. Matches, results and Match Days are free.</> },
  { h: 'Run a competition when you need to', p: <>Leagues, tournaments and festivals are a paid feature. Choose the plan that fits. <Link to="/products">Compare plans</Link>.</> },
]

export default function Support() {
  const contact = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('MatchPulse support')}`
  return (
    <main className="support">
      <div className="wrap">
        <header className="support-head">
          <p className="label">Help centre</p>
          <h1>How can we help?</h1>
          <p>Everything you need to get set up, find results, and run a competition. If you cannot find an answer here, we are one email away.</p>
        </header>

        <section className="support-cards" aria-label="Quick links">
          {CARDS.map(c => (
            <div key={c.title} className="support-card">
              <h2>{c.title}</h2>
              <p>{c.body}</p>
              {c.to.startsWith('#')
                ? <a className="support-card-link" href={c.to}>{c.label} &rarr;</a>
                : <Link className="support-card-link" to={c.to}>{c.label} &rarr;</Link>}
            </div>
          ))}
        </section>

        <section className="support-block" id="start">
          <h2>Getting started</h2>
          <ol className="support-steps">
            {STEPS.map((s, i) => (
              <li key={i}>
                <span className="support-step-n" aria-hidden="true">{i + 1}</span>
                <div>
                  <h3>{s.h}</h3>
                  <p>{s.p}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="support-block" id="faq">
          <h2>Frequently asked questions</h2>
          <div className="faq-list">
            {faqs.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
          </div>
        </section>

        <section className="support-block support-find">
          <h2>Find your sport</h2>
          <p>Results live on each sport&rsquo;s own site. Open the one you follow:</p>
          <div className="support-sports">
            {SPORTS.map(s => (
              <a key={s.key} className="support-sport" style={{ '--hue': s.hue }} href={s.host}>
                <span className="support-sport-dot" style={{ background: s.hue }} />
                {s.name}
              </a>
            ))}
          </div>
        </section>

        <section className="support-contact">
          <h2>Still need help?</h2>
          <p>Email us and a person will get back to you, usually within one working day.</p>
          <a className="btn btn-primary" href={contact}>Email {CONTACT_EMAIL}</a>
        </section>
      </div>
    </main>
  )
}
