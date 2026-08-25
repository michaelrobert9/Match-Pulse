import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { SPORTS } from '../../lib/sports'
import { PLANS, formatRand } from '../../lib/payfast'
import ProductVisual from './ProductVisual'
import * as C from '../../lib/homeContent'

/* ── shared primitives ─────────────────────────────────────────────────── */

// Heading that accepts a string or an array of lines (each on its own line).
// `tag` picks the element so the page keeps a correct outline (one h1, in the
// hero; h2 everywhere else).
function Heading({ text, className = 'h2', tag: Tag = 'h2' }) {
  const lines = Array.isArray(text) ? text : [text]
  return (
    <Tag className={className}>
      {lines.map((l, i) => (
        <span key={i} className="hline">{l}{i < lines.length - 1 ? <br /> : null}</span>
      ))}
    </Tag>
  )
}

function SectionHead({ label, heading, sub, center }) {
  return (
    <div className={`sec-head ${center ? 'center' : ''}`}>
      {label && <p className="label reveal">{label}</p>}
      <div className="reveal"><Heading text={heading} /></div>
      {sub && <p className={`sub reveal ${center ? 'center' : ''}`}>{sub}</p>}
    </div>
  )
}

// A CTA that either starts a plan purchase or navigates a route. Plans are sold
// by EFT invoice: signed out → create an account first (then straight on to the
// invoice), signed in → the bill-to form. One purchase path, reused everywhere.
// (The PayFast checkout in lib/payfast.js is dormant, kept for a possible
// return to card payments — nothing links to it.)
export function useBuy() {
  const { user } = useAuth()
  const navigate = useNavigate()
  return (plan) => {
    if (!plan) { navigate('/signup'); return }
    if (!user) { navigate(`/signup?plan=${plan}`); return }
    navigate(`/invoice/new?plan=${plan}`)
  }
}

function Cta({ to, plan, className, children }) {
  const buy = useBuy()
  if (plan) {
    return <button type="button" className={className} onClick={() => buy(plan)}>{children}</button>
  }
  // hash link on the home page, or a route — Link handles both.
  return <Link className={className} to={to}>{children}</Link>
}

/* ── 2. Sport finder ───────────────────────────────────────────────────── */
export function SportFinder() {
  return (
    <section className="sportfinder" id="find" aria-labelledby="find-h">
      <div className="wrap">
        <p className="sf-eyebrow">{C.sportFinder.eyebrow}</p>
        {/* A styled <p>, not a heading: this strip precedes the page's h1 (the
            hero), and a heading here would put the document outline out of order. */}
        <p id="find-h" className="sf-heading">{C.sportFinder.heading}</p>
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

/* ── 3. Hero ───────────────────────────────────────────────────────────── */
export function Hero() {
  return (
    <section className="mp-hero">
      <div className="wrap mp-hero-grid">
        <div className="mp-hero-copy">
          <p className="eyebrow">{C.hero.eyebrow}</p>
          <Heading text={C.hero.heading} className="mp-hero-h1" tag="h1" />
          <p className="mp-hero-body">{C.hero.body}</p>
          <div className="mp-hero-cta">
            <Cta to={C.hero.primary.to} className="btn btn-primary">{C.hero.primary.label}</Cta>
            <Cta to={C.hero.secondary.to} className="btn btn-ghost">{C.hero.secondary.label}</Cta>
          </div>
          <p className="mp-hero-support">{C.hero.supporting}</p>
        </div>
        <div className="mp-hero-visual reveal">
          <ProductVisual />
        </div>
      </div>
    </section>
  )
}

/* ── 4. Problem ────────────────────────────────────────────────────────── */
export function ProblemSection() {
  return (
    <section className="block tint" id="problem">
      <div className="wrap prob">
        <div className="reveal"><Heading text={C.problem.heading} /></div>
        <div className="prob-body">
          {C.problem.paragraphs.map((p, i) => <p key={i} className="reveal">{p}</p>)}
          <ul className="prob-points reveal">
            {C.problem.points.map((p, i) => <li key={i}>{p}</li>)}
          </ul>
          <p className="prob-closing reveal">{C.problem.closing}</p>
        </div>
      </div>
    </section>
  )
}

/* ── 5. How it works ───────────────────────────────────────────────────── */
export function HowItWorks() {
  return (
    <section className="block" id="how">
      <div className="wrap">
        <SectionHead label="How it works" heading={C.howItWorks.heading} center />
        <div className="flow">
          {C.howItWorks.steps.map(s => (
            <div key={s.n} className="step reveal">
              <span className="bar" /><span className="idx tnum">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </div>
          ))}
        </div>
        <p className="how-closing reveal">{C.howItWorks.closing}</p>
      </div>
    </section>
  )
}

/* ── 5. What you can do — six real features ────────────────────────────── */
export function WhatYouCanDo() {
  return (
    <section className="block" id="features">
      <div className="wrap">
        <SectionHead label={C.features.eyebrow} heading={C.features.heading} sub={C.features.intro} center />
        <div className="feat-grid">
          {C.features.items.map((f, i) => (
            <div key={i} className="feat-card reveal">
              <span className="feat-n tnum">{String(i + 1).padStart(2, '0')}</span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── 6. My School. My Club. My Association. — ownership + sport homes ───── */
export function SportsNetwork() {
  return (
    <section className="block tint" id="sports">
      <div className="wrap">
        <SectionHead label={C.sportsNetwork.eyebrow} heading={C.sportsNetwork.heading} sub={C.sportsNetwork.body} center />
        <div className="net-grid">
          {SPORTS.map(s => (
            <div key={s.key} className="net-card reveal" style={{ '--hue': s.hue }}>
              <span className="net-bar" style={{ background: s.hue }} />
              <h3>MatchPulse {s.name}{s.newlyLaunched && <span className="net-newtag">Newly launched</span>}</h3>
              <p>{C.sportsNetwork.descriptions[s.key] || s.blurb}</p>
              <a className="net-go" href={s.host} style={{ color: s.hue }}>
                Go to MatchPulse {s.name}
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </a>
            </div>
          ))}
        </div>
        <p className="net-closing reveal">{C.sportsNetwork.closing}</p>
      </div>
    </section>
  )
}

/* ── 7. Pricing ────────────────────────────────────────────────────────── */
function priceOf(card) {
  if (!card.plan) return { big: card.freeLabel || 'Free', per: null }
  const p = PLANS[card.plan]
  return { big: formatRand(p.amount), per: p.once ? 'once-off' : '/ year' }
}

function PricingCard({ card }) {
  const { big, per } = priceOf(card)
  return (
    <article className={`pc ${card.featured ? 'pc-featured' : ''}`}>
      {card.featured && <span className="pc-flag">Most chosen</span>}
      <h3 className="pc-name">{card.name}</h3>
      <p className="pc-price"><span className="pc-amount">{big}</span>{per && <span className="pc-per">{per}</span>}</p>
      <p className="pc-desc">{card.description}</p>
      {card.headline && <p className="pc-headline">{card.headline}</p>}
      {card.examples && (
        <p className="pc-examples">e.g. {card.examples.join(' · ')}</p>
      )}
      <ul className="pc-features">
        {card.items.map((it, i) => <li key={i}>{it}</li>)}
      </ul>
      <div className="pc-cta">
        {card.plan
          ? <Cta plan={card.plan} className="btn btn-primary">{card.button}</Cta>
          : <Cta to="/signup" className="btn btn-ghost">{card.button}</Cta>}
      </div>
      {card.note && <p className="pc-note">{card.note}</p>}
    </article>
  )
}

// The three pricing cards, shared by the homepage pricing section and /products
// so naming, pricing and features can never drift apart.
export function PricingCards() {
  return (
    <div className="pc-grid">
      {C.pricing.cards.map(card => <PricingCard key={card.key} card={card} />)}
    </div>
  )
}

// "How activation works" + fine print, shared by both pricing surfaces.
export function ActivationNote() {
  const a = C.pricing.activation
  return (
    <div className="pc-activation reveal">
      <h3>{a.heading}</h3>
      <ol className="pc-steps">
        {a.steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
      <p className="pc-fine">{a.fine}</p>
    </div>
  )
}

export function PricingSection() {
  return (
    <section className="block" id="pricing">
      <div className="wrap">
        <SectionHead label="Pricing" heading={C.pricing.heading} center />
        <PricingCards />
        <ActivationNote />
      </div>
    </section>
  )
}

/* ── 8. FAQ ────────────────────────────────────────────────────────────── */
function FaqItem({ q, a }) {
  return (
    <details className="faq-item">
      <summary>
        <span>{q}</span>
        <span className="faq-mark" aria-hidden="true" />
      </summary>
      <div className="faq-answer"><p>{a}</p></div>
    </details>
  )
}

export function FAQ() {
  return (
    <section className="block tint" id="faq">
      <div className="wrap faq-wrap">
        <SectionHead label="Help" heading="Questions, answered." center />
        <div className="faq-list">
          {C.faqs.map((f, i) => <FaqItem key={i} q={f.q} a={f.a} />)}
        </div>
      </div>
    </section>
  )
}

/* ── 16. Final CTA ─────────────────────────────────────────────────────── */
export function FinalCTA() {
  return (
    <section className="finalcta">
      <div className="wrap finalcta-inner">
        <div className="reveal"><Heading text={C.finalCta.heading} className="finalcta-h" /></div>
        <p className="finalcta-body reveal">{C.finalCta.body}</p>
        <div className="finalcta-cta reveal">
          <Cta to={C.finalCta.primary.to} className="btn btn-primary">{C.finalCta.primary.label}</Cta>
          <Cta to={C.finalCta.secondary.to} className="btn btn-ghost btn-ghost-invert">{C.finalCta.secondary.label}</Cta>
        </div>
        <p className="finalcta-support reveal">{C.finalCta.supporting}</p>
      </div>
    </section>
  )
}
