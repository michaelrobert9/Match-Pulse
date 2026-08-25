import { PricingCards, ActivationNote } from '../components/home/sections'

// /products shares its pricing cards and activation copy with the homepage
// pricing section (both render from lib/homeContent.js) so plan names, prices
// and features can never drift apart.
export default function Products() {
  return (
    <main className="products">
      <div className="wrap">
        <header className="products-head">
          <p className="label">Plans</p>
          <h1>One account. Simple plans. Every sport.</h1>
          <p className="products-sub">
            Buy once on the main site and access unlocks across every MatchPulse sport
            you play. All prices in South African Rand.
          </p>
        </header>

        <PricingCards />
        <ActivationNote />
      </div>
    </main>
  )
}
