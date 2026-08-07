import { Link } from 'react-router-dom'
import { PLANS, formatRand } from '../lib/payfast'
import { useAuth } from '../contexts/AuthContext'

// Plans are sold by EFT invoice: the button raises an invoice (with our bank
// details and a unique payment reference), and the plan activates when the
// payment reflects. PayFast checkout is dormant — kept in lib/payfast.js in
// case card payments return, but nothing links to it.
function PayButton({ planKey, children }) {
  const { user } = useAuth()
  const to = user ? `/invoice/new?plan=${planKey}` : `/signup?plan=${planKey}`
  return <Link className="btn btn-primary" to={to}>{children}</Link>
}

function EftBlock() {
  return (
    <details className="eft-panel">
      <summary>How payment works</summary>
      <div className="eft-body">
        <p className="eft-lede">
          Payment is by EFT. Choosing a plan creates an invoice made out to whoever
          should be billed — you, your school or your club — with our bank details and
          a unique payment reference on it. Your plan activates as soon as the payment
          reflects. The invoice stays on your account, and the billing details can be
          corrected after it's issued if your accounts department needs a change.
        </p>
      </div>
    </details>
  )
}

export default function Products() {
  const plus = PLANS.event
  const pro  = PLANS.pro

  return (
    <main className="products">
      <div className="wrap">
        <header className="products-head">
          <p className="label">Plans</p>
          <h1>One account. One plan. Every sport.</h1>
          <p className="products-sub">
            Buy once on the main site and access unlocks across every MatchPulse sport
            you play. All prices in South African Rand, VAT inclusive.
          </p>
        </header>

        <div className="products-grid">
          {/* Free */}
          <article className="product-card">
            <header>
              <h2>Free</h2>
              <p className="product-price"><span className="amount">R0</span></p>
              <p className="product-tagline">Unlimited teams &amp; fixtures. Zero cost, forever.</p>
            </header>
            <ul className="product-features">
              <li>Unlimited teams, players and matches</li>
              <li>Live match capture on any device</li>
              <li>Public team &amp; player pages, always free to view</li>
              <li>Sign in on any MatchPulse sport with one account</li>
            </ul>
            <div className="product-cta">
              <Link className="btn btn-ghost" to="/signup">Create an account</Link>
            </div>
          </article>

          {/* Plus */}
          <article className="product-card featured" id="event">
            <span className="product-flag">Most popular</span>
            <header>
              <h2>Plus</h2>
              <p className="product-price">
                <span className="amount">{formatRand(plus.amount)}</span>
                <span className="unit">once-off</span>
              </p>
              <p className="product-tagline">Run a competition when you need one. No subscription.</p>
            </header>
            <ul className="product-features">
              <li>Everything in Free</li>
              <li>Run a competition (league, cup or tournament)</li>
              <li>Live standings, fixtures &amp; results pages</li>
              <li>Team &amp; player awards, top-scorer tables</li>
              <li>Invoice issued up front, kept on your account</li>
            </ul>
            <div className="product-cta">
              <PayButton planKey="event">Buy Plus — {formatRand(plus.amount)}</PayButton>
            </div>
            <EftBlock />
          </article>

          {/* Pro */}
          <article className="product-card" id="pro">
            <header>
              <h2>Pro</h2>
              <p className="product-price">
                <span className="amount">{formatRand(pro.amount)}</span>
                <span className="unit">/ year</span>
              </p>
              <p className="product-tagline">
                Unlimited competitions across every sport, all season long.
              </p>
            </header>
            <ul className="product-features">
              <li>Everything in Plus</li>
              <li>Unlimited competitions across every sport</li>
              <li>Priority email support</li>
              <li>Annual invoice, VAT inclusive</li>
            </ul>
            <div className="product-cta">
              <PayButton planKey="pro">Go Pro — {formatRand(pro.amount)} / yr</PayButton>
            </div>
            <EftBlock />
          </article>
        </div>

        <section className="products-fine">
          <h3>How activation works</h3>
          <ul>
            <li><strong>Choose a plan</strong> and tell us who the invoice should be made out to — you, your school or your club.</li>
            <li><strong>Pay the invoice by EFT</strong>, using the invoice number as your payment reference.</li>
            <li><strong>Your plan activates</strong> as soon as the payment reflects — usually within one business day.</li>
            <li>Every invoice stays on your account, and its billing details can be corrected after it's issued.</li>
            <li>Questions? Use the <Link to="/#contact">contact form</Link>.</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
