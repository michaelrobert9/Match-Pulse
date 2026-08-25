import { useEffect } from 'react'
import {
  SportFinder, Hero, ProblemSection, HowItWorks,
  WhatYouCanDo, SportsNetwork, PricingSection, FAQ, FinalCTA,
} from '../components/home/sections'
import ContactSection from '../components/home/ContactSection'

// Reveal-on-scroll: adds `.in` to `.reveal` elements as they enter the viewport.
// Re-run on mount so freshly rendered sections animate in.
function useReveal() {
  useEffect(() => {
    const items = document.querySelectorAll('.reveal:not(.in)')
    if (!('IntersectionObserver' in window)) {
      items.forEach(el => el.classList.add('in')); return
    }
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) } })
    }, { threshold: 0.12 })
    items.forEach(el => io.observe(el))
    return () => io.disconnect()
  }, [])
}

// Nine sections, each with one job: promise (hero), problem, mechanism (how it
// works), features, ownership, price, FAQ, final CTA + contact. Nothing repeats.
export default function Home() {
  useReveal()
  return (
    <main id="top">
      <SportFinder />
      <Hero />
      <ProblemSection />
      <HowItWorks />
      <WhatYouCanDo />
      <SportsNetwork />
      <PricingSection />
      <FAQ />
      <FinalCTA />
      <ContactSection />
    </main>
  )
}
