import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { CONTACT_EMAIL } from '../../lib/config'
import * as C from '../../lib/homeContent'
import { planPrice } from '../../lib/homeContent'
import { SPORTS } from '../../lib/sports'

/* ── shared primitives ─────────────────────────────────────────────────── */

// Plans are sold by EFT invoice: signed out → create an account first (then on
// to the invoice), signed in → the bill-to form. One purchase path, reused.
export function useBuy() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (plan) => {
    if (!plan) { navigate('/signup'); return }
    if (!user) { navigate(`/signup?plan=${plan}`); return }
    navigate(`/invoice/new?plan=${plan}`)
  }
}

// A CTA that either starts a plan purchase, follows a route, or opens a mailto.
function Cta({ to, plan, mailto, className, children }) {
  const buy = useBuy()
  if (plan)   return <button type="button" className={className} onClick={() => buy(plan)}>{children}</button>
  if (mailto) return <a className={className} href={mailto}>{children}</a>
  return <Link className={className} to={to}>{children}</Link>
}

function BandHead({ eyebrow, heading, sub }) {
  return (
    <div className="hband-head">
      {eyebrow && <p className="eyebrow reveal">{eyebrow}</p>}
      <h2 className="reveal">{heading}</h2>
      {sub && <p className="hsub reveal">{sub}</p>}
    </div>
  )
}

/* ── 1. Hero ───────────────────────────────────────────────────────────── */
export function Hero() {
  const h = C.hero
  return (
    <section className="hband hband--white hhero">
      <div className="wrap hhero-grid">
        <div className="hhero-copy">
          <p className="eyebrow">{h.eyebrow}</p>
          <h1 className="hhero-h1">{h.headingA} <span className="green">{h.headingB}</span></h1>
          <p className="hsub hhero-sub">{h.sub}</p>
          <div className="hhero-ctas">
            <Cta to={h.primary.to} className="btn btn-primary">{h.primary.label}</Cta>
            <Cta to={h.secondary.to} className="btn btn-ghost">{h.secondary.label}</Cta>
          </div>
          <div className="hjump">
            <small>{h.jumpLabel}</small>
            {h.jumps.map(j => <a key={j.to} href={j.to}>{j.label}</a>)}
          </div>
        </div>
        <div className="hboard reveal">
          <div className="hboard-head"><b>{h.board.title}</b><span className="hboard-live"><span className="hboard-dot" aria-hidden="true" />LIVE</span></div>
          {h.board.rows.map((r, i) => (
            <div key={i} className="hboard-row">
              <span>{r.home} <b>{r.a}</b> – <b>{r.b}</b> {r.away}</span>
              <span className="hboard-sport">{r.sport}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Sport finder — the slim strip above the hero, a quick route to each ──
   sport's own site where its live scores, matches and results live. */
export function SportFinder() {
  const f = C.sportFinder
  return (
    <section className="sportfinder" id="find" aria-labelledby="find-h">
      <div className="wrap">
        <p className="sf-eyebrow">{f.eyebrow}</p>
        {/* A styled <p>, not a heading: this strip precedes the page's h1 (the
            hero), and a heading here would put the document outline out of order. */}
        <p id="find-h" className="sf-heading">{f.heading}</p>
        <div className="sf-grid">
          {SPORTS.map(s => (
            <a key={s.key} className="sf-card" style={{ '--hue': s.hue }} href={s.host}>
              <span className="sf-dot" style={{ background: s.hue }} />
              <span className="sf-name">{s.name}</span>
              <span className="sf-go" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </span>
            </a>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Match Day spotlight (inside the school band) ──────────────────────── */
function MatchDay({ md }) {
  return (
    <div className="hmd reveal">
      <div className="hmd-txt">
        <h3>{md.headingA}<span>{md.headingB}</span></h3>
        <p>{md.body}</p>
      </div>
      <div className="hmd-card">
        <div className="hmd-top"><span>{md.card.top}</span></div>
        <div className="hmd-sub">{md.card.sub}</div>
        {md.card.rows.map((r, i) => (
          <div key={i} className={'hmd-row' + (r.first ? ' hmd-row--first' : '')}><span>{r.t}</span><span>{r.s}</span></div>
        ))}
        <div className="hmd-stats">
          {md.card.stats.map((s, i) => (
            <div key={i} className="hmd-stat"><b>{s.b}</b><span>{s.s}</span></div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ── Recommendation blocks ─────────────────────────────────────────────── */
function RecBlocks({ rec }) {
  return (
    <>
      <p className="hrec-title reveal">{rec.title}</p>
      <div className={'hrec-grid reveal' + (rec.wide ? ' hrec-grid--wide' : '')}>
        {rec.cards.map((c, i) => (
          <div key={i} className={'hrec' + (c.lead ? ' hrec--lead' : '')}>
            <span className="hrec-plan">{c.plan} · <span className="green">{c.price}</span>{c.suffix || ''}</span>
            <p>{c.body}</p>
          </div>
        ))}
      </div>
      {rec.footnote && <p className="hfn reveal">{rec.footnote}</p>}
    </>
  )
}

/* ── Share buttons ─────────────────────────────────────────────────────── */
function WaIcon() {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.2 4.79 1.2h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm4.52 11.99c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.13-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43l-.48-.01c-.17 0-.43.06-.66.31-.23.25-.86.85-.86 2.07 0 1.22.89 2.4 1.01 2.56.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29z"/>
    </svg>
  )
}
function ShareRow({ share }) {
  return (
    <div className="hshare reveal">
      <span className="hshare-lead">{share.leadIn}</span>
      <a className="hshare-wa" href={share.wa.href} target="_blank" rel="noreferrer"><WaIcon />{share.wa.label}</a>
      <a className="hshare-em" href={share.em.href}>{share.em.label}</a>
    </div>
  )
}

/* ── 2–6. Audience band ────────────────────────────────────────────────── */
export function AudienceBand({ band }) {
  return (
    <section className={`hband hband--${band.tone}`} id={band.id}>
      <div className="wrap">
        <BandHead eyebrow={band.eyebrow} heading={band.heading} sub={band.sub} />
        <div className="hfeat-grid">
          {band.feats.map((f, i) => (
            <div key={i} className="hfeat reveal"><h3>{f.h}</h3><p>{f.p}</p></div>
          ))}
        </div>
        {band.matchDay && <MatchDay md={band.matchDay} />}
        {band.rec && <RecBlocks rec={band.rec} />}
        {band.note && <p className="hnote reveal">{band.note}</p>}
        {band.share && <ShareRow share={band.share} />}
      </div>
    </section>
  )
}

/* ── 7. Home Ground ────────────────────────────────────────────────────── */
export function HomeGround() {
  const g = C.homeGround
  return (
    <section className="hband hband--dark">
      <div className="wrap hg">
        <div className="hg-txt">
          <p className="eyebrow eyebrow--mint reveal">{g.eyebrow}</p>
          <h2 className="reveal">{g.headingA}<br />{g.headingB}</h2>
          <p className="hsub reveal">{g.body}</p>
          <ul className="hg-list reveal">
            {g.bullets.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
          <div className="hg-price reveal"><b>{planPrice(C.plans.find(p => p.key === 'homeground'))}</b><span>{g.priceSuffix}</span></div>
        </div>
        <div className="hg-visual reveal">
          <div className="hg-school">{g.visual.school}</div>
          {g.visual.rows.map((r, i) => (
            <div key={i} className="hg-row"><span className="hg-nm">{r.nm}</span><span className="hg-res">{r.res}</span></div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── 8. Pricing / plans ────────────────────────────────────────────────── */
function PlanCard({ plan, showCta }) {
  return (
    <article className={'hplan reveal' + (plan.pop ? ' hplan--pop' : '')}>
      {plan.badge && <span className={'hplan-badge' + (plan.badgeDark ? ' hplan-badge--dark' : '')}>{plan.badge}</span>}
      <h3>{plan.name}</h3>
      <div className="hplan-pr">{planPrice(plan)}</div>
      <div className="hplan-per">{plan.per}</div>
      <p>{plan.desc}</p>
      <div className="hplan-for">{plan.for}</div>
      {showCta && plan.cta && (
        <div className="hplan-cta">
          <Cta to={plan.cta.to} plan={plan.cta.plan} className="btn btn-primary btn-sm">{plan.cta.label}</Cta>
        </div>
      )}
    </article>
  )
}

// Shared by the homepage pricing band and /products. `showCta` adds buy actions
// on /products; the homepage grid stays informational to match the draft.
export function PlansGrid({ showCta = false }) {
  return (
    <div className="hplans">
      {C.plans.map(p => <PlanCard key={p.key} plan={p} showCta={showCta} />)}
    </div>
  )
}

export function PricingSection() {
  return (
    <section className="hband hband--white" id="pricing">
      <div className="wrap">
        <div className="hband-head hband-head--center">
          <p className="eyebrow reveal">{C.pricing.eyebrow}</p>
          <h2 className="reveal">{C.pricing.heading}</h2>
        </div>
        <PlansGrid />
      </div>
    </section>
  )
}

/* ── 9. Sport request strip ────────────────────────────────────────────── */
export function SportRequest() {
  const s = C.sportRequest
  const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Please add our sport to MatchPulse')}`
  return (
    <div className="hsport-ask">
      <p>{s.text} <a href={href}>{s.linkLabel}</a> {s.tail}</p>
    </div>
  )
}

/* ── 10. Final CTA ─────────────────────────────────────────────────────── */
export function FinalCTA() {
  const f = C.finalCta
  const demo = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent('Book a demo at our school')}`
  return (
    <section className="hband hband--dark hfinal">
      <div className="wrap">
        <h2 className="reveal">{f.heading}</h2>
        <p className="hsub hfinal-sub reveal">{f.body}</p>
        <div className="hfinal-ctas reveal">
          <Cta to={f.primary.to} className="btn btn-primary">{f.primary.label}</Cta>
          <a className="btn btn-ghost btn-ghost-invert" href={demo}>{f.secondary.label}</a>
        </div>
        <div className="hfinal-tag reveal">{f.tagline}</div>
      </div>
    </section>
  )
}

/* ── FAQ (rendered on /products) ───────────────────────────────────────── */
function FaqItem({ q, a }) {
  return (
    <details className="faq-item">
      <summary><span>{q}</span><span className="faq-mark" aria-hidden="true" /></summary>
      <div className="faq-answer"><p>{a}</p></div>
    </details>
  )
}
export function FAQ() {
  return (
    <section className="hband hband--grey" id="faq">
      <div className="wrap faq-wrap">
        <div className="hband-head hband-head--center">
          <p className="eyebrow">Help</p>
          <h2>Questions, answered.</h2>
        </div>
        <div className="faq-list">
          {C.faqs.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
        </div>
      </div>
    </section>
  )
}
