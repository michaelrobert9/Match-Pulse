import { PlansGrid, FAQ } from '../components/home/sections'

// /products shares its plan data with the homepage pricing band (both render
// from lib/homeContent.js `plans`) so names, prices and descriptions can never
// drift apart. Home Ground's price comes from config (placeholder).
export default function Products() {
  return (
    <main className="products">
      <div className="wrap">
        <header className="products-head">
          <p className="label">Plans</p>
          <h1>Free for everyday sport. Simple plans for the big stuff.</h1>
          <p className="products-sub">
            Buy once on the main site and access unlocks across every MatchPulse sport
            you play. All prices in South African Rand.
          </p>
        </header>

        <PlansGrid showCta />

        <section className="products-fine">
          <h3>How activation works</h3>
          <ul>
            <li><strong>Choose a plan</strong> and tell us who the invoice should be made out to.</li>
            <li><strong>Pay the invoice by EFT</strong>, using the invoice number as your reference.</li>
            <li><strong>Your plan activates</strong> when the payment reflects, usually within one business day.</li>
          </ul>
        </section>
      </div>

      <FAQ />
    </main>
  )
}
