import { Link } from 'react-router-dom'
import LegalLayout from './LegalLayout'

export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy" updated="14 July 2026">
      <p>
        This Privacy Policy explains how MatchPulse ("we", "us", "our")
        collects and uses personal information when you use our multi-sport
        tournament management and live scoring platform (the "Platform"). It
        is written to meet our obligations under the Protection of Personal
        Information Act, 2013 (POPIA).
      </p>
      <p>
        For the purposes of POPIA, MatchPulse is the responsible party for
        the personal information described below. Our contact details are at
        the end of this policy.
      </p>

      <h2>1. What we mean by personal information</h2>
      <p>Personal information is information that identifies or relates to a living person. On the Platform, this can include a person's name, the team they play for, their age group, and their playing statistics. A name on its own is personal information, and so is a name combined with playing data. We treat it accordingly.</p>

      <h2>2. Information we collect</h2>
      <p><strong>Account information.</strong> When you create an account, we collect information such as your name, email address, and login details. Different roles (Organiser, Player, Manager, Parent, Spectator) may provide different information.</p>
      <p><strong>Player profile information.</strong> When a Player, Parent or Manager creates a Player profile, we collect the information they choose to include, such as the Player's name, team, age group and statistics.</p>
      <p><strong>Competition information.</strong> When Organisers run competitions, we process fixtures, results, scores and standings, which may include Player names and statistics.</p>
      <p><strong>Payment information.</strong> When you buy a Paid Plan, payment is handled by PayFast. We receive confirmation of payment and related transaction details. We do not store your full card details.</p>
      <p><strong>Technical information.</strong> We collect information about how you access the Platform, such as device and browser information and log data, and information collected through cookies. See our <Link to="/legal/cookies">Cookie Policy</Link> for detail.</p>

      <h2>3. Who creates Player profiles, and why it matters</h2>
      <p>Organisations and Organisers cannot create Player profiles or attach a Player's name to live scoring. Only a Player, a Parent, or a Manager can create and manage a Player profile.</p>
      <p>This means the person who creates a profile is responsible for the information in it and for any consent required to publish it. Where a profile relates to a minor, the Parent (or a Manager acting with the Parent's consent) is responsible for that consent. We explain how to correct or remove information in clause 8.</p>

      <h2>4. How we use personal information</h2>
      <p>We use personal information to:</p>
      <ul>
        <li>provide and operate the Platform, including running competitions and displaying results and statistics;</li>
        <li>create and manage accounts and Player profiles;</li>
        <li>calculate standings and statistics;</li>
        <li>process payments for Paid Plans;</li>
        <li>send service messages about your account and plans where needed;</li>
        <li>keep the Platform secure and prevent misuse;</li>
        <li>comply with our legal obligations.</li>
      </ul>
      <p>We rely on the lawful bases in POPIA for this processing, including performance of our agreement with you, our legitimate interests in operating the Platform, your consent where it is required, and compliance with the law.</p>

      <h2>5. Public pages</h2>
      <p>Competition results, standings and Player statistics are shown on public pages, and these pages may be indexed by search engines. This means Player names and statistics can be publicly visible. Anyone creating a Player profile should understand this before publishing information about a Player, particularly a minor.</p>

      <h2>6. Children's information</h2>
      <p>The Platform may hold personal information about minors, for example in schools and junior sport.</p>
      <p>Under POPIA, processing a minor's personal information generally requires the consent of a competent person, usually a parent or guardian. Because only a Player, Parent or Manager can create a Player profile, the responsibility for obtaining that consent rests with the person who creates the profile.</p>
      <p>A Parent may ask us to correct or remove a minor's information at any time. We will act on a valid request as set out in clause 8.</p>

      <h2>7. Sharing personal information</h2>
      <p>We do not sell personal information. We share it only where needed to run the Platform:</p>
      <ul>
        <li><strong>Service providers</strong> who help us operate, such as our hosting provider (Google Firebase), our payment processor (PayFast), and our email delivery provider. These providers process information on our behalf and under agreement.</li>
        <li><strong>Publicly</strong>, to the extent competition results and statistics appear on public pages as described in clause 5.</li>
        <li><strong>Where required by law</strong>, or to protect our rights, users or the public.</li>
      </ul>
      <p>Some providers may process information outside South Africa. Where they do, we take reasonable steps to ensure the information is protected in line with POPIA.</p>

      <h2>8. Your rights</h2>
      <p>Under POPIA you have the right to:</p>
      <ul>
        <li>ask what personal information we hold about you;</li>
        <li>ask us to correct information that is wrong or out of date;</li>
        <li>ask us to delete information, subject to our legal obligations;</li>
        <li>object to certain processing;</li>
        <li>withdraw consent where we rely on it;</li>
        <li>complain to the Information Regulator.</li>
      </ul>
      <p>To exercise any of these, or to ask us to correct or remove a Player profile, please use our <Link to="/#contact">contact form</Link>. We may need to confirm your identity, or the identity and authority of a Parent, before we act. We aim to respond within a reasonable time.</p>
      <p>If a Player profile was created by someone else, we may need to contact that person as part of handling your request, but you can always come to us directly.</p>

      <h2>9. How long we keep information</h2>
      <p>We keep personal information for as long as needed to run the Platform and to keep an accurate record of competitions, and for as long as the law requires. Historic competition results may be retained as part of the sporting record. Where information is no longer needed, we delete or de-identify it.</p>

      <h2>10. Security</h2>
      <p>We take reasonable technical and organisational steps to protect personal information, including access controls and secure hosting. No system is completely secure, but we work to keep information safe and to respond properly if something goes wrong.</p>

      <h2>11. Changes to this policy</h2>
      <p>We may update this policy from time to time. If we make a material change, we will take reasonable steps to let you know. The "last updated" date at the top shows when it last changed.</p>

      <h2>12. Contact and complaints</h2>
      <p>For any privacy question or request, please contact our Information Officer using our <Link to="/#contact">contact form</Link>.</p>
      <p>You also have the right to complain to the regulator:</p>
      <p>
        <strong>Information Regulator (South Africa)</strong><br />
        Website: <a href="https://inforegulator.org.za" target="_blank" rel="noreferrer noopener">inforegulator.org.za</a>
      </p>
    </LegalLayout>
  )
}
