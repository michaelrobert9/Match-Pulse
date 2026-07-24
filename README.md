# MatchPulse — master site

The public front door for MatchPulse: the master home page that routes visitors to each
**sporting-code platform** (Hockey, Rugby, and more to come) and sells the product.

This first pass is a **design concept** — a single, self-contained `index.html` (no build
step) that extends the shared MatchPulse design system read from the Hockey app
(`DESIGN_SYSTEM.md`, `WhyMatchPulse.css`, `Plans.css`). Open it in a browser to preview.

## What the home page does

1. **Connects the codes** — a "Choose your sport" hub links out to each code's subdomain
   (`hockey.matchpulse.co.za`, `rugby.matchpulse.co.za`, …). Live codes are active links;
   the rest are shown as roadmap.
2. **Sells the platform** — Why MatchPulse (how-it-works + features) and the full Plans
   table (Free · Plus R2,000 · Pro R15,000).
3. **Carries the essentials** — Contact section and footer links for Terms, Privacy,
   Cookies and Acceptable Use.

## Design language (inherited, not invented)

- **Light theme**, soft paper canvas, single narrow-to-wide reading rhythm.
- **Brand emerald** `#1FB573` / `#0E7A4D` for action; **live red** `#E5484D` reserved for
  live only; ink `#0B1220`.
- Type: **Space Grotesk** (display) · **Inter** (body) · **Roboto** (tabular figures).
- Each sporting code carries its own identity colour, using the product's team-identity
  tint pattern.

## Easy things to change

- **Sports & subdomains** — edit the cards in the `#codes` section; flip a card between
  live and "coming soon" by swapping the `<a class="code-card">`/`<div class="code-card soon">`
  wrapper and its status pill.
- **Prices / plan copy** — the `#plans` section mirrors the Hockey app's `Plans.jsx`.
- **Contact addresses** — placeholders (`hello@` / `billing@matchpulse.co.za`) in `#contact`.

## Next steps (pending technical details)

- Confirm the real list of codes, subdomains and launch order.
- Decide the stack for the master site (static, or React/Vite/Tailwind to match the apps).
- Wire the contact form and port the legal documents from the Hockey repo.
