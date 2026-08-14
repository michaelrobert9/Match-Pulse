// ─────────────────────────────────────────────────────────────────────────
// Homepage copy + data, in one place so the page components stay presentational
// and the words are easy to edit without touching layout. Prices are NOT stored
// here — pricing cards read them from lib/payfast.js (PLANS) so there is one
// source of truth for money.
// ─────────────────────────────────────────────────────────────────────────

// § Sport finder (top of page) — quick route to a sport site.
export const sportFinder = {
  eyebrow: 'Matches, scores & results',
  heading: 'Looking for matches, scores or results? Choose your sport.',
}

// § Hero
export const hero = {
  eyebrow: 'For schools, clubs and competition organisers',
  heading: ['Every coach enters one result.', 'You see them all.'],
  body:
    'MatchPulse saves heads of sport, sports coordinators and club administrators from ' +
    'collecting, re-entering and sending out match results. Coaches enter their results ' +
    'directly after the match. MatchPulse brings everything together and makes it available ' +
    'to everyone.',
  primary:  { label: 'Start Using MatchPulse Free', to: '/signup' },
  secondary:{ label: 'View Competition Plans',      to: '/#pricing' },
  supporting: 'Every match. On the record.',
}

// § Problem
export const problem = {
  heading: ['The result is already known.', 'Why should you have to collect it?'],
  paragraphs: [
    'After every match, someone knows the final score. But at many schools and clubs, that ' +
      'result still needs to be handed in, collected, checked, entered somewhere else and ' +
      'sent out afterwards.',
    'That leaves one person responsible for bringing every result together while also trying ' +
      'to run the rest of the sport.',
  ],
  points: [
    'A missing result becomes another person to contact.',
    'A result waiting to be entered becomes another job on the desk.',
    'A complete weekend of sport can become hours of administration.',
  ],
  closing: 'It should not work that way.',
}

// § How it works — three steps
export const howItWorks = {
  heading: 'Results should be completed at the match.',
  steps: [
    { n: '01', title: 'The match is ready',      body: 'The match is already available on MatchPulse before play begins.' },
    { n: '02', title: 'The coach enters the result', body: 'After the match, the coach or scorer adds the final score.' },
    { n: '03', title: 'Everyone can see it',        body: 'The result is immediately available to the school, club, competition and everyone following the sport.' },
  ],
  closing: 'No collecting. No entering it again. No putting everything together later.',
}

// § Main benefit — before / after
export const beforeAfter = {
  heading: ['Run the sport.', 'Not the results admin.'],
  body:
    'Your time should be spent supporting coaches, organising teams and making sport happen, ' +
    'not gathering information that other people already know. MatchPulse removes the sports ' +
    'coordinator or administrator as the collection point for every result.',
  before: {
    title: 'Before MatchPulse',
    items: [
      'Every result comes back to the coordinator',
      'The coordinator works out what has been received',
      'Missing results are followed up',
      'Results are entered again',
      'A complete results list is sent or published',
    ],
  },
  after: {
    title: 'With MatchPulse',
    items: [
      'Every coach enters one result',
      'The coordinator sees them all',
      'Everyone else knows where to find them',
    ],
  },
}

// § Benefits by audience — three cards
export const audience = [
  {
    who: 'For heads of sport and administrators',
    line: 'See every result without collecting every result.',
    body: 'Know what has been entered and what may still need attention.',
  },
  {
    who: 'For coaches and scorers',
    line: 'Enter it once. You’re done.',
    body: 'Add the result after the match without needing to submit it somewhere else.',
  },
  {
    who: 'For parents, players and supporters',
    line: 'One place to look.',
    body: 'Find matches, scores, results and competition information through the relevant MatchPulse sport website.',
  },
]

// § Sports network — descriptions layered over the sport registry (lib/sports.js)
export const sportsNetwork = {
  heading: ['One MatchPulse account.', 'A dedicated home for every sport.'],
  body:
    'MatchPulse brings your organisation together under one account while giving every sport ' +
    'its own place for matches, scores and results.',
  closing: 'One account. Every sport connected.',
  // keyed by sport.key — longer marketing line than the registry blurb
  descriptions: {
    hockey:    'Matches, live scores and results for school and club hockey.',
    netball:   'Matches, live scores and results for school and club netball.',
    rugby:     'Matches, live scores and results for school and club rugby.',
    waterpolo: 'Matches, live scores and results for school and club water polo.',
  },
}

// § Free use
export const freeUse = {
  heading: 'Start with your everyday matches. Free.',
  body:
    'Schools and clubs can use MatchPulse for ordinary matches and results without purchasing ' +
    'a competition package. Create your organisation, add your teams and give coaches a simpler ' +
    'way to enter results.',
  items: [
    'Create teams',
    'Create ordinary matches',
    'Enter results',
    'Publish scores',
    'Give supporters one place to follow',
  ],
  button: { label: 'Create Your Free Account', to: '/signup' },
  supporting:
    'Start using MatchPulse now. Choose a competition plan when you need to run a formal league, ' +
    'festival, tournament or other competition.',
}

// § Competition
export const competition = {
  heading: 'Running a competition?',
  paragraphs: [
    'A competition creates more matches, more teams and more results for someone to manage. ' +
      'MatchPulse gives every match and result one place to go from the beginning of the ' +
      'competition to the final match.',
    'Participating coaches and scorers enter results directly. Organisers see the competition ' +
      'come together without manually collecting every score.',
  ],
  items: [
    'Matches together',
    'Results up to date',
    'Competition tables current',
    'Teams informed',
    'Supporters connected',
  ],
  button: { label: 'Create a Competition', plan: 'event' },
}

// § Pricing — cards; `plan` maps to lib/payfast.js PLANS (null = free).
// Prices are read from PLANS at render time, never hard-coded here.
export const pricing = {
  heading: ['Free for everyday sport.', 'Simple plans for competitions.'],
  cards: [
    {
      key: 'free',
      name: 'Everyday MatchPulse',
      plan: null,
      freeLabel: 'Free',
      description: 'For schools and clubs recording ordinary matches and results.',
      items: [
        'Organisation and team setup',
        'Match creation',
        'Result entry',
        'Public matches and results',
        'Access to the MatchPulse sport websites',
      ],
      button: 'Start Free',
      featured: false,
    },
    {
      key: 'single',
      name: 'Single Competition',
      plan: 'event',
      description: 'For one defined competition within one sport and one age group.',
      examples: ['One U14 rugby league', 'One U16 girls’ hockey festival'],
      items: [
        'Competition setup',
        'Participating teams',
        'Competition matches',
        'Direct result entry',
        'Results and standings',
        'Public competition page',
      ],
      button: 'Create One Competition',
      note: 'Running several age groups or sports? The All-In Annual plan may offer better value.',
      featured: true,
    },
    {
      key: 'allin',
      name: 'All-In Annual',
      plan: 'pro',
      description: 'For schools, clubs and organisations running competitions across several sports or age groups.',
      headline: 'Every sport. Every age group. Unlimited competitions. One calendar year.',
      items: [
        'Unlimited competitions',
        'All available sporting codes',
        'All age groups',
        'One organisation account',
        'One annual payment',
      ],
      button: 'Choose All-In',
      featured: false,
    },
  ],
  footnote: [
    'One way of working across your whole organisation.',
    'Every coach knows where to enter results. Every sports coordinator knows where to see them. ' +
      'Every parent and supporter knows where to look.',
  ],
}

// § Benefits — five
export const benefits = {
  heading: ['Less gathering.', 'More sport.'],
  items: [
    { title: 'Save valuable time',                 body: 'Remove the repeated work of collecting, checking, entering and distributing results.' },
    { title: 'Share the responsibility',           body: 'Each coach enters the one result they already know instead of one person processing every result.' },
    { title: 'Know what is complete',              body: 'See which results have been entered and where attention may still be needed.' },
    { title: 'Make results immediately available', body: 'Once a result is entered, people following the sport can find it without waiting for a separate results list.' },
    { title: 'Create one reliable place to look',  body: 'Matches, scores, results and competitions remain available through the relevant MatchPulse sport website.' },
  ],
}

// § Product demo — three steps
export const productDemo = {
  heading: 'From final whistle to published result',
  steps: [
    { title: 'Match finished',   body: 'The coach or scorer opens the scheduled match.' },
    { title: 'Result entered',   body: 'The final score is added in a few simple steps.' },
    { title: 'Result available', body: 'The school, club, organiser and supporters can see it immediately.' },
  ],
  closing: 'The person at the match enters the result. MatchPulse takes it from there.',
  button: { label: 'See How MatchPulse Works', to: '/#how' },
}

// § FAQ
export const faqs = [
  { q: 'Is MatchPulse free?',                          a: 'MatchPulse is free for ordinary school and club matches. Competition packages are available when an organisation wants to run a formal competition.' },
  { q: 'What counts as a competition?',                a: 'A competition is an organised group of matches within a defined sport and age group, such as a league, festival or tournament.' },
  { q: 'What is included in the Single Competition plan?', a: 'The plan covers one defined competition within one sport and one age group.' },
  { q: 'Who enters the results?',                      a: 'The coach, scorer or authorised person at the match enters the result directly into MatchPulse.' },
  { q: 'Where do parents and supporters find results?', a: 'Each sport has its own MatchPulse website where people can find matches, scores, results and competitions.' },
  { q: 'Do we need a different account for every sport?', a: 'No. An organisation starts with one MatchPulse account and uses it across the relevant MatchPulse sports.' },
  { q: 'What happens if we run several sports or age groups?', a: 'The All-In Annual plan covers all available sports, all age groups and unlimited competitions for the calendar year.' },
  { q: 'Can we start free before buying a competition plan?', a: 'Yes. A school or club can begin using MatchPulse for ordinary matches and choose a competition plan when needed.' },
]

// § Final CTA
export const finalCta = {
  heading: 'Stop collecting results.',
  body:
    'Give every coach a simple way to enter their own result and give everyone else one place ' +
    'to find it.',
  primary:   { label: 'Start Using MatchPulse Free', to: '/signup' },
  secondary: { label: 'View Competition Plans',      to: '/#pricing' },
  supporting: 'Every match. On the record.',
}

// § Social proof — no real content yet, so the section stays hidden. Flip this
// to true (and fill `socialProofItems`) only when real competitions, testimonials
// or figures exist. Never populate with invented data.
export const socialProof = {
  enabled: false,
  heading: 'See MatchPulse in action',
  items: [], // { type: 'competition'|'testimonial'|'story'|'results', ... }
}
