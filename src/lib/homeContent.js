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
  primary:  { label: 'Start using MatchPulse free', to: '/signup' },
  secondary:{ label: 'View competition plans',      to: '/#pricing' },
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

// § What you can do — six real features (concrete capability + what it does)
export const features = {
  eyebrow: 'What you can do',
  heading: 'Built for the sporting week.',
  intro: 'Everything below works from the first free account.',
  items: [
    { title: 'Live scores from the sideline',          body: 'Update the score while the game runs. Parents at work and supporters at home watch it change as it happens.' },
    { title: 'Fixtures ready before the whistle',      body: 'The week’s matches are loaded in advance, so every coach knows exactly where their result goes.' },
    { title: 'A result takes thirty seconds',          body: 'Team, score, done — from the coach’s phone at the field, before the kit is packed away.' },
    { title: 'See what’s still outstanding',           body: 'One glance shows which results are in and which are missing. You know who to ask, without asking everyone.' },
    { title: 'Standings that keep themselves current', body: 'Logs and tables recalculate the moment a result goes in. Nobody updates a spreadsheet on Sunday night.' },
    { title: 'A public home for every team and player',body: 'Team pages, player pages and top-scorer tables anyone can open in a browser. No app, no login, free to view.' },
  ],
}

// § Yours — ownership + the four sport homes (descriptions layered over lib/sports.js)
export const sportsNetwork = {
  eyebrow: 'Yours',
  heading: 'My School. My Club. My Association.',
  body:
    'MatchPulse belongs to the people who run the sport. Set up your school, your club or your ' +
    'association once, and every sport you play gets its own public home for matches, scores and results.',
  closing: 'One account. Every sport connected.',
  // keyed by sport.key — longer marketing line than the registry blurb
  descriptions: {
    hockey:    'Matches, live scores and results for school and club hockey.',
    netball:   'Matches, live scores and results for school and club netball.',
    rugby:     'Matches, live scores and results for school and club rugby.',
    waterpolo: 'Matches, live scores and results for school and club water polo.',
  },
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
      description: 'For the ordinary sporting week: fixtures, results and live scores.',
      items: [
        'Your teams and fixtures, loaded once for the season',
        'Live scoring from any phone',
        'Results published the moment they’re entered',
        'Public team and player pages for your community',
        'Your matches on the MatchPulse sport websites',
      ],
      button: 'Start free',
      featured: false,
    },
    {
      key: 'single',
      name: 'Single Competition',
      plan: 'event',
      description:
        'Run a competition when you need one. No subscription. One competition, one sport, one ' +
        'age group — e.g. one U14 rugby league or one U16 girls’ hockey festival.',
      headline: 'Configure it once. MatchPulse runs the competition from there — you just live score or enter the result.',
      items: [
        'Everything in Everyday MatchPulse',
        'Fixtures auto-generated for the whole competition',
        'Player squads for every participating team',
        'Pool scoring set up your way, including bonus points and custom tie-breakers',
        'Playoffs generated automatically, with teams allocated as the pools finish',
        'Knockout formats to fit your event, including fully custom settings',
        'Team awards, Player of the Match and top-scorer tables',
        'A dedicated competition page in your competition’s own colours',
      ],
      button: 'Create one competition',
      note: 'Running several age groups or sports? All-In may offer better value.',
      featured: true,
    },
    {
      key: 'allin',
      name: 'All-In',
      plan: 'pro',
      description: 'For a school, club or association running competitions across several sports or age groups.',
      items: [
        'Everything in Single Competition',
        'Unlimited competitions in one calendar year',
        'Every sport and every age group',
        'One account for your whole school, club or association',
        'Priority email support',
        'One annual invoice',
      ],
      button: 'Choose All-In',
      featured: false,
    },
  ],
  activation: {
    heading: 'How activation works',
    steps: [
      'Choose a plan.',
      'Pay the invoice by EFT.',
      'Your plan activates when the payment reflects, usually within one business day.',
    ],
    fine: 'All prices in South African Rand.',
  },
}

// § FAQ
export const faqs = [
  { q: 'Is MatchPulse free?',                          a: 'Everyday MatchPulse is free for the ordinary sporting week — fixtures, results and live scores. Single Competition and All-In are paid plans for running formal competitions.' },
  { q: 'What counts as a competition?',                a: 'A competition is an organised group of matches within a defined sport and age group, such as a league, festival or tournament.' },
  { q: 'What is included in the Single Competition plan?', a: 'You configure one competition once — fixtures are auto-generated, pools score your way with bonus points and tie-breakers, and playoffs and knockouts are generated for you. It also adds player squads, team awards, Player of the Match, top-scorer tables and a competition page in your own colours, on top of everything in Everyday MatchPulse.' },
  { q: 'Can parents watch a match live?',              a: 'Yes. When a coach or scorer uses live scoring, the score updates on the public match page as the game runs. Anyone can watch it from a browser, with no app and no login.' },
  { q: 'Who enters the results?',                      a: 'The coach, scorer or authorised person at the match enters the result directly into MatchPulse.' },
  { q: 'Where do parents and supporters find results?', a: 'Each sport has its own MatchPulse website where people can find matches, scores, results and competitions.' },
  { q: 'Do we need a different account for every sport?', a: 'No. One account covers your whole school, club or association across every MatchPulse sport.' },
  { q: 'What happens if we run several sports or age groups?', a: 'All-In covers every sport, every age group and unlimited competitions for one calendar year.' },
  { q: 'Can we start free before buying a competition plan?', a: 'Yes. A school or club can begin using Everyday MatchPulse for ordinary matches and choose a competition plan when needed.' },
]

// § Final CTA
export const finalCta = {
  heading: 'Stop collecting results.',
  body:
    'Give every coach a simple way to enter their own result and give everyone else one place ' +
    'to find it.',
  primary:   { label: 'Start using MatchPulse free', to: '/signup' },
  secondary: { label: 'View competition plans',      to: '/#pricing' },
  supporting: 'Every match. On the record.',
}
