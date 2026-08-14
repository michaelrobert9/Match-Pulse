import { Link } from 'react-router-dom'
import LegalLayout from './LegalLayout'

export default function AcceptableUse() {
  return (
    <LegalLayout title="Acceptable Use Policy" updated="14 July 2026">
      <p>
        This Acceptable Use Policy sets out the rules for using MatchPulse
        (the "Platform"). It forms part of our{' '}
        <Link to="/legal/terms">Terms and Conditions</Link>. By using the
        Platform, you agree to follow it.
      </p>
      <p>The aim is simple: keep the Platform accurate, fair, and safe for everyone, especially for the young players whose names and statistics may appear on it.</p>

      <h2>1. General conduct</h2>
      <p>You agree to use the Platform lawfully and honestly. You must not use it in a way that harms others, misrepresents results, or interferes with how it works.</p>

      <h2>2. Accurate competition data</h2>
      <p>Organisers and Managers must record matches, results and statistics honestly. Do not enter false results, manipulate standings, or misrepresent what happened in a match.</p>

      <h2>3. Player profiles and other people's information</h2>
      <p>You must not:</p>
      <ul>
        <li>create a Player profile for someone you are not entitled to represent;</li>
        <li>publish a minor's information without the consent of a parent or guardian;</li>
        <li>add information about another person that is false, misleading, or that you have no right to publish.</li>
      </ul>
      <p>Only a Player, Parent or Manager may create and manage a Player profile. If you create a profile, you are responsible for it.</p>

      <h2>4. Prohibited content</h2>
      <p>Do not upload, publish or share content that is:</p>
      <ul>
        <li>unlawful, defamatory, harassing, threatening or abusive;</li>
        <li>discriminatory or hateful;</li>
        <li>obscene, or otherwise inappropriate in the context of a sporting platform used by young players;</li>
        <li>infringing on someone else's intellectual property or privacy;</li>
        <li>false or intended to deceive.</li>
      </ul>

      <h2>5. Security and access</h2>
      <p>You must not:</p>
      <ul>
        <li>try to gain unauthorised access to any part of the Platform, another account, or our systems;</li>
        <li>interfere with or disrupt the Platform, for example by introducing malicious code or overloading it;</li>
        <li>scrape, harvest or extract data at scale without our permission;</li>
        <li>bypass or attempt to bypass any security or access controls.</li>
      </ul>

      <h2>6. Misuse of accounts</h2>
      <p>You must not share your account in a way that breaches these rules, impersonate another person, or create accounts to get around a suspension or restriction.</p>

      <h2>7. Reporting</h2>
      <p>If you see something on the Platform that breaks these rules, including a Player profile that should not be there, please tell us via our <Link to="/#contact">contact form</Link>. We take reports seriously and will look into them.</p>

      <h2>8. What happens if you break these rules</h2>
      <p>If you breach this policy, we may remove content, suspend or close your account, and where necessary take further action or report the matter to the relevant authorities. We will act reasonably and in line with our <Link to="/legal/terms">Terms and Conditions</Link>.</p>

      <h2>9. Contact</h2>
      <p>For any question about this policy, please use our <Link to="/#contact">contact form</Link>.</p>
    </LegalLayout>
  )
}
