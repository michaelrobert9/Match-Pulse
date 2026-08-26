// ─────────────────────────────────────────────────────────────────────────
// Homepage copy + data, in one place so the page components stay presentational.
// Copy is verbatim from the approved homepage draft. Prices for the real plans
// come from lib/payfast.js (PLANS); the Home Ground placeholder price comes from
// lib/config.js. One source of truth for money, shared with /products.
//
// Language rules baked into this copy: always say match or matches; say school,
// club or association for the entity; no em or en dashes in prose (scores keep
// their score notation); and never name who enters a score. The school or club
// decides who gets access.
// ─────────────────────────────────────────────────────────────────────────
import { PLANS, formatRand } from './payfast'
import { HOME_GROUND_PRICE, HOME_GROUND_PERIOD, HOME_GROUND_PRICE_IS_PLACEHOLDER } from './config'

// § 1. Hero
export const hero = {
  eyebrow: 'For schools, clubs and competition organisers',
  headingA: 'Every match, scored once.',
  headingB: 'Seen by everyone.',
  sub:
    'School and club sport, live scored and on the record. Online the moment the whistle goes, ' +
    'for everyone who could not be there.',
  primary:   { label: 'Start using MatchPulse free', to: '/signup' },
  secondary: { label: 'View plans', to: '/products' },
  jumpLabel: 'WHAT MATCHPULSE DOES FOR',
  jumps: [
    { label: 'The school',      to: '#school' },
    { label: 'The parents',     to: '#parents' },
    { label: 'The players',     to: '#players' },
    { label: 'The club',        to: '#club' },
    { label: 'The association', to: '#association' },
  ],
  board: {
    title: 'Today’s results',
    rows: [
      { home: 'Grey',       a: '24', b: '17', away: 'Paul Roos',  sport: 'RUGBY' },
      { home: 'Rustenburg', a: '4',  b: '2',  away: 'Herschel',   sport: 'HOCKEY' },
      { home: 'DSG',        a: '38', b: '31', away: 'Collegiate', sport: 'NETBALL' },
      { home: 'Reddam',     a: '11', b: '9',  away: 'Bishops',    sport: 'WATER POLO' },
    ],
  },
}

// § 2–6. Audience bands, in order. `tone` alternates grey / white.
export const bands = [
  {
    id: 'school', tone: 'grey', eyebrow: 'For the school',
    heading: 'Results out of the spreadsheet. Onto the record.',
    sub:
      'Most school results end up on a paper sheet or in a spreadsheet that nobody outside the ' +
      'sports department ever sees. MatchPulse puts them online the moment they happen.',
    feats: [
      { h: 'Score a match in seconds',    p: 'Live score the match or enter the final score from any phone. Your school decides who gets access to do it.' },
      { h: 'See what is still outstanding', p: 'Watch the weekend fill in as scores arrive, and see at a glance which matches still need a result.' },
      { h: 'A permanent online record',   p: 'Every team, every age group, every season. Public pages that people can find in a search, not a file on a desk.' },
      { h: 'Track your players’ stats',   p: 'Top scorers and caps for your top teams. Achievements your players carry from prep school to high school and on to club.' },
    ],
    matchDay: {
      headingA: 'Match Day: ',
      headingB: 'one derby, one setup, the whole day live.',
      body:
        'Create one Match Day against another school instead of fifteen separate matches. MatchPulse ' +
        'groups every team’s match onto one screen. The 1st team is highlighted, you can see how many ' +
        'matches are still to play, and the day’s win ratio updates as results come in. It starts ' +
        'working from the very first score. Free with your school’s account.',
      card: {
        top: 'St Andrew’s vs Kingswood',
        sub: 'MATCH DAY · RUGBY · 14 MATCHES',
        rows: [
          { t: '1st XV', s: '24 – 17', first: true },
          { t: '2nd XV', s: '12 – 12' },
          { t: 'U16A',   s: '19 – 8' },
          { t: 'U14B',   s: '15 – 22' },
        ],
        stats: [
          { b: '9',   s: 'PLAYED' },
          { b: '5',   s: 'TO PLAY' },
          { b: '67%', s: 'WIN RATIO' },
        ],
      },
    },
    rec: {
      title: 'What we recommend for schools',
      cards: [
        { plan: 'Everyday MatchPulse', price: 'Free', lead: true, body: 'Start here. Your teams, matches, results, live scoring and Match Days cost nothing.' },
        { plan: 'Single Competition', price: 'R2 000', body: 'Hosting your own festival, league or tournament?* Pay once for that competition and MatchPulse runs it.' },
        { plan: 'All-In', price: 'R15 000', suffix: '/year', body: 'Running competitions* through the year, across sports and age groups? One plan covers them all.' },
      ],
      footnote: '* Matches, results, live scoring and Match Days are free. Competitions, leagues and log tables are paid features.',
    },
  },

  {
    id: 'parents', tone: 'white', eyebrow: 'For the parents',
    heading: 'Couldn’t be at the game? You’re still there.',
    sub: 'No app to install. No login. Open the page and watch.',
    feats: [
      { h: 'Watch the score live',            p: 'When a match is live scored, the score moves on your phone as it happens. From work, from home, from anywhere.' },
      { h: 'Results at the final whistle',    p: 'The U13B’s result is online the moment the match ends, not read out at assembly three days later.' },
      { h: 'The whole match day in one place', p: 'Every team, every age group, one page. See how the whole school did against the rivals, not just the 1st team.' },
      { h: 'Just search for it',              p: 'Results live on the open web. Search your school’s name and the match is simply there.' },
    ],
    share: {
      leadIn: 'Want this for your school’s sport? Send it to them.',
      wa: { label: 'WhatsApp my school', href: "https://wa.me/?text=Hi%2C%20have%20a%20look%20at%20MatchPulse%20(https%3A%2F%2Fmatchpulse.co.za).%20Our%20school%27s%20match%20results%20and%20live%20scores%20could%20be%20online%20for%20parents%20to%20follow.%20Could%20we%20look%20into%20it%3F" },
      em: { label: 'Email my school',    href: "mailto:?subject=MatchPulse%20for%20our%20school%27s%20sport&body=Hi%2C%0A%0AHave%20a%20look%20at%20MatchPulse%20(https%3A%2F%2Fmatchpulse.co.za).%20Our%20school%27s%20match%20results%20and%20live%20scores%20could%20be%20online%20for%20parents%20to%20follow%2C%20and%20the%20everyday%20use%20is%20free.%0A%0ACould%20we%20look%20into%20it%3F" },
    },
  },

  {
    id: 'players', tone: 'grey', eyebrow: 'For the players',
    heading: 'Your whole career. On the record.',
    sub: 'Every game you play deserves better than a WhatsApp group that gets deleted.',
    feats: [
      { h: 'Your player profile',        p: 'Your own public page with the teams you have played for, season by season.' },
      { h: 'Your caps and goals',        p: 'How many games. How many goals. Counted automatically, match by match, for as long as you play.' },
      { h: 'A record that follows you',  p: 'Stats that start at prep school carry through high school and into club. One career, one record.' },
      { h: 'Proof of your achievements', p: 'A public, searchable history of your playing career. Real numbers, in the sport you love.' },
    ],
    note: 'Players don’t pay for MatchPulse. Profiles come with your school or club.',
    share: {
      leadIn: 'Want your club on MatchPulse? Tell them.',
      wa: { label: 'WhatsApp my club', href: "https://wa.me/?text=Hi%2C%20have%20a%20look%20at%20MatchPulse%20(https%3A%2F%2Fmatchpulse.co.za).%20Our%20club%27s%20results%20could%20be%20online%2C%20with%20a%20profile%20for%20every%20player%20showing%20caps%20and%20goals.%20Worth%20a%20look%20for%20us%3F" },
      em: { label: 'Email my club',    href: "mailto:?subject=MatchPulse%20for%20our%20club&body=Hi%2C%0A%0AHave%20a%20look%20at%20MatchPulse%20(https%3A%2F%2Fmatchpulse.co.za).%20Our%20club%27s%20results%20could%20be%20online%2C%20with%20a%20profile%20for%20every%20player%20showing%20caps%20and%20goals%2C%20and%20the%20everyday%20use%20is%20free.%0A%0AWorth%20a%20look%20for%20us%3F" },
    },
  },

  {
    id: 'club', tone: 'white', eyebrow: 'For the club',
    heading: 'Get your season out of the WhatsApp group.',
    sub: 'Your club’s results currently scroll away in a chat. Give them a public home that outlives any committee.',
    feats: [
      { h: 'Anyone you choose can score',  p: 'The club decides who gets access to enter scores. Simple enough that no training is needed.' },
      { h: 'Player profiles for members',  p: 'Every member sees their games, caps and goals build season by season. A fifty-cap player finally has the page to prove it.' },
      { h: 'Your club’s public home',      p: 'Matches, results and teams on your own club pages, visible to members and the world.' },
      { h: 'Your league, connected',       p: 'When your association runs its league* on MatchPulse, your matches and standings arrive automatically.' },
    ],
    rec: {
      title: 'What we recommend for clubs',
      cards: [
        { plan: 'Everyday MatchPulse', price: 'Free', lead: true, body: 'Your teams, matches, results and player profiles cost nothing. League play comes through your association, so most clubs never need to pay.' },
        { plan: 'Single Competition', price: 'R2 000', body: 'Only if your club hosts its own internal league or tournament.* Pay once for that event.' },
        { plan: 'All-In', price: 'R15 000', suffix: '/year', body: 'Only for clubs that host several of their own competitions* a year.' },
      ],
      footnote: '* Internal leagues, tournaments and log tables are paid features. Everyday matches, results and profiles are free.',
    },
    share: {
      leadIn: 'Your league lives with your association. Tell them to look at MatchPulse.',
      wa: { label: 'WhatsApp my association', href: "https://wa.me/?text=Hi%2C%20have%20a%20look%20at%20MatchPulse%20(https%3A%2F%2Fmatchpulse.co.za).%20It%20runs%20a%20whole%20league%20online.%20Each%20team%20enters%20its%20own%20result%20and%20the%20log%20works%20itself%20out.%20Worth%20investigating%20for%20our%20league%3F" },
      em: { label: 'Email my association',    href: "mailto:?subject=MatchPulse%20for%20our%20league&body=Hi%2C%0A%0AHave%20a%20look%20at%20MatchPulse%20(https%3A%2F%2Fmatchpulse.co.za).%20It%20runs%20a%20whole%20league%20online.%20Each%20team%20enters%20its%20own%20result%20and%20the%20log%20works%20itself%20out%2C%20with%20everything%20public%20for%20players%20and%20parents.%0A%0AWorth%20investigating%20for%20our%20league%3F" },
    },
  },

  {
    id: 'association', tone: 'grey', eyebrow: 'For the association',
    heading: 'Configure it once. The league runs itself.',
    sub: 'No more paper slips into a spreadsheet into WhatsApp, every round, all season. Each team enters its own result and everything else calculates.',
    feats: [
      { h: 'Matches create themselves',      p: 'Pools, rounds and matches set up for the whole competition in one go.' },
      { h: 'Scoring your way',               p: 'Custom pool points, bonus points and tie-breakers. The log calculates by your rules, live.' },
      { h: 'Playoffs build themselves',      p: 'Brackets generated and teams allocated as pools finish, including fully custom knockout formats.' },
      { h: 'Online for everyone, instantly', p: 'Standings and results are public pages the moment they change. Every team’s parents and players can simply look.' },
    ],
    rec: {
      title: 'What we recommend for associations',
      wide: true,
      cards: [
        { plan: 'Single Competition', price: 'R2 000', suffix: ' once-off', lead: true, body: 'One league, festival or tournament. Configured once, run automatically, no subscription.' },
        { plan: 'All-In', price: 'R15 000', suffix: '/year', body: 'Running several competitions a year across sports and age groups? One plan, one annual invoice, unlimited competitions.' },
      ],
    },
  },
]

// § 7. Home Ground — new product (dark band). Price from config (placeholder).
export const homeGround = {
  eyebrow: 'New · For schools',
  headingA: 'Home Ground.',
  headingB: 'Every sport. One school. One home.',
  body:
    'Each sport lives on its own MatchPulse site. Home Ground brings your whole school together, with ' +
    'rugby, hockey, netball and water polo results presented in one central place under your school’s ' +
    'name and colours.',
  bullets: [
    'One page for your school’s entire sporting weekend',
    'All sports’ results, matches and Match Days together',
    'Your school’s badge, colours and identity',
    'The page parents bookmark and the school newsletter links to',
  ],
  priceSuffix: HOME_GROUND_PRICE_IS_PLACEHOLDER ? '/ year · placeholder pricing for review' : '/ year',
  visual: {
    school: 'St Andrew’s College · This weekend',
    rows: [
      { nm: 'Rugby',      res: '9 of 14 played · won 6' },
      { nm: 'Hockey',     res: '7 of 10 played · won 5' },
      { nm: 'Netball',    res: '6 of 8 played · won 4' },
      { nm: 'Water Polo', res: '2 of 3 played · won 2' },
    ],
  },
}

// § 8. Pricing — the four plans. Shared with /products. Prices from PLANS +
// config so money lives in one place. CTAs are shown on /products, not the
// homepage pricing grid (which matches the informational draft).
export const plans = [
  {
    key: 'free', name: 'Everyday MatchPulse',
    price: 'Free', per: ' ',
    desc: 'Teams, matches, live scoring, results, Match Days and player pages.',
    for: 'For every school and club, from day one',
    cta: { label: 'Start free', to: '/signup' },
  },
  {
    key: 'single', name: 'Single Competition',
    amount: PLANS.event.amount, per: 'once-off · no subscription',
    desc: 'One league, festival or tournament. Configured once, run automatically.',
    for: 'For one event or league',
    badge: 'MOST CHOSEN', pop: true,
    cta: { label: 'Create one competition', plan: 'event' },
  },
  {
    key: 'allin', name: 'All-In',
    amount: PLANS.pro.amount, per: 'per year',
    desc: 'Unlimited competitions across every sport and age group, one account.',
    for: 'For associations and busy schools',
    cta: { label: 'Choose All-In', plan: 'pro' },
  },
  {
    key: 'homeground', name: 'Home Ground',
    amount: HOME_GROUND_PRICE, per: HOME_GROUND_PRICE_IS_PLACEHOLDER ? `${HOME_GROUND_PERIOD} · placeholder` : HOME_GROUND_PERIOD,
    desc: 'Your whole school’s sport presented together in one central, branded home.',
    for: 'For schools that want the full picture',
    badge: 'NEW', badgeDark: true, placeholder: HOME_GROUND_PRICE_IS_PLACEHOLDER,
    cta: { label: 'Set up for a school', to: '/admin' },
  },
]

// Resolve a plan's displayed price from its `price` string or `amount`.
export function planPrice(plan) {
  return plan.price || formatRand(plan.amount)
}

export const pricing = {
  eyebrow: 'Pricing',
  heading: 'Free for everyday sport. Simple plans for the big stuff.',
}

// § 9. Sport request strip. TODO: destination address to confirm (config).
export const sportRequest = {
  text: 'Don’t see your sport on MatchPulse?',
  linkLabel: 'Let us know',
  tail: 'and we’ll consider adding it.',
}

// § 10. Final CTA (dark band).
export const finalCta = {
  heading: 'Stop collecting results.',
  body: 'The score goes in once, at the match. Everyone else gets one place to find it.',
  primary:   { label: 'Start using MatchPulse free', to: '/signup' },
  secondary: { label: 'Book a demo at your school' },
  tagline: 'Every match. On the record.',
}

// § FAQ — lives on /products (the homepage matches the draft, which has no FAQ).
// Four plan names, footnote wording, role-free, no banned words or dashes.
export const faqs = [
  { q: 'What is free and what is paid?', a: 'Matches, results, live scoring and Match Days are free on Everyday MatchPulse. Competitions, leagues and log tables are paid features, on Single Competition, All-In or Home Ground.' },
  { q: 'Is MatchPulse really free to start?', a: 'Yes. Everyday MatchPulse covers your teams, matches, results, live scoring, Match Days and player pages at no cost. You only pay when you run a competition.' },
  { q: 'What counts as a competition?', a: 'A competition is an organised group of matches within a defined sport and age group, such as a league, festival or tournament. Running one is a paid feature.' },
  { q: 'Can parents watch a match live?', a: 'Yes. When a match is live scored, the score updates on the public match page as the game runs. Anyone can watch from a browser, with no app and no login.' },
  { q: 'Who can enter a score?', a: 'The school or the club decides who gets access to enter scores. Each team can enter its own result.' },
  { q: 'Where do parents and supporters find results?', a: 'Results live on the open web. Each sport has its own MatchPulse site, and you can find a school or club by searching its name.' },
  { q: 'Do we need a different account for every sport?', a: 'No. One account covers your whole school, club or association across every MatchPulse sport.' },
  { q: 'What is Home Ground?', a: 'Home Ground brings your whole school’s sport together in one central, branded home, with every sport’s results and Match Days on one page. It is a new plan, and the price shown is a placeholder while we confirm it.' },
]
