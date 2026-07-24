# MatchPulse — master site

The public front door for MatchPulse: the master home page whose main job is to route
visitors to each **sport platform** — Hockey, Netball, Rugby and Water Polo — and to sell
the product.

This first pass is a **design concept**: a single, self-contained `index.html` (no build
step) that extends the shared MatchPulse design system read from the Hockey app
(`DESIGN_SYSTEM.md`, `WhyMatchPulse.css`, `Plans.css`). Open it in a browser to preview.

## What the home page does

1. **Connects the sports (primary focus)** — a "Choose your sport" hub, high on the page,
   with a card per sport linking out to its subdomain
   (`hockey.` · `netball.` · `rugby.` · `waterpolo.matchpulse.co.za`). Each card carries
   that sport's own identity colour, echoing the logo's coloured-pill lockups.
2. **Sells the platform** — how it works, feature grid, and the full plans table
   (Free · Plus R2,000 · Pro R15,000).
3. **Carries the essentials** — Contact section and footer links for Terms, Privacy,
   Cookies and Acceptable Use.

## Design language (inherited, not invented)

- **Light theme**, soft paper canvas, single reading rhythm.
- **MatchPulse wordmark**: "Match" in slate navy, "Pulse" in brand emerald.
- **Brand emerald** `#1FB573` / `#0E7A4D` for action; **live red** `#E5484D` reserved for
  live only; ink `#0B1220`.
- Type: **Space Grotesk** (display) · **Inter** (body) · **Roboto** (tabular figures).
- Sport identity colours: Hockey emerald · Netball violet · Rugby green · Water Polo blue.

## Easy things to change

- **Sports & subdomains** — edit the cards in the `#sports` section (one `<a class="sport">`
  per sport; set its `--hue` and href).
- **Prices / plan copy** — the `#plans` section mirrors the Hockey app's `Plans.jsx`.
- **Contact addresses** — placeholders (`hello@` / `billing@matchpulse.co.za`) in `#contact`.

## Next steps (pending technical details)

- Confirm the four sports, their subdomains and which are live now.
- Decide the stack for the master site (static, or React/Vite/Tailwind to match the apps).
- Wire the contact form and port the legal documents from the Hockey repo.
