import { useEffect } from 'react'
import {
  Hero, AudienceBand, HomeGround, PricingSection, SportRequest, FinalCTA,
} from '../components/home/sections'
import { bands } from '../lib/homeContent'

// Reveal-on-scroll: adds `.in` to `.reveal` elements as they enter the viewport.
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('.reveal:not(.in)')
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('in')); return
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.1 })
    items.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

// One promise (hero), then one band per audience (school, parents, players,
// club, association), then the Home Ground product, all plans, a sport request
// strip and a final call to action. Backgrounds alternate so each band reads
// as its own section.
export default function Home() {
  useReveal()
  return (
    <main id="top">
      <Hero />
      {bands.map(b => <AudienceBand key={b.id} band={b} />)}
      <HomeGround />
      <PricingSection />
      <SportRequest />
      <FinalCTA />
    </main>
  )
}
