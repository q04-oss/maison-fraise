export const metadata = {
  title: "box fraise — Privacy",
  description: "Privacy policy for the box fraise platform.",
};

export default function PrivacyPage() {
  return (
    <main className="page">
      <div className="doc-header">
        <a className="back-link" href="/">← box fraise</a>
        <h1>Privacy</h1>
        <p className="meta">
          Effective April 2026.
        </p>
      </div>

      <section>
        <span className="section-number">I.</span>
        <h2>What we collect</h2>
        <p>
          When you create an account, we collect your email address and any
          display name you choose to provide. When you make a purchase or earn
          a loyalty steep, we record the transaction details necessary to
          maintain your balance and history.
        </p>
        <p>
          We do not collect your location in the background. We do not build
          advertising profiles. We do not sell data to third parties.
        </p>
      </section>

      <hr />

      <section>
        <span className="section-number">II.</span>
        <h2>How we use it</h2>
        <p>
          Your email is used to send transactional messages — sign-in links,
          order confirmations, loyalty updates. You will not receive marketing
          email unless you explicitly opt in.
        </p>
        <p>
          Your loyalty history is used to calculate your balance and display
          your steep record in the app. It is not shared with other users or
          businesses beyond what is necessary to credit your account.
        </p>
        <p>
          Search queries on fraise.box are proxied to Brave Search. We do not
          log your search queries. Brave&apos;s privacy policy governs what
          Brave retains on their end.
        </p>
      </section>

      <hr />

      <section>
        <span className="section-number">III.</span>
        <h2>Credential security</h2>
        <p>
          Authentication tokens are stored in the iOS Keychain with biometric
          protection. They cannot be read by other apps or extracted from a
          locked device. Every request to our API is signed with HMAC-SHA256
          and carries a single-use nonce to prevent replay attacks.
        </p>
        <p>
          We do not store passwords. Sign-in is passwordless — we send a
          short-lived link to your email address.
        </p>
      </section>

      <hr />

      <section>
        <span className="section-number">IV.</span>
        <h2>Data retention</h2>
        <p>
          Your account and transaction history are retained for as long as your
          account is active. You may request deletion of your account and all
          associated data by contacting us through the support page. Deletion
          is permanent and irreversible.
        </p>
      </section>

      <hr />

      <section>
        <span className="section-number">V.</span>
        <h2>Third parties</h2>
        <p>
          We use the following third-party services:
        </p>
        <p>
          <strong>Stripe</strong> — payment processing. Your card details are
          handled entirely by Stripe and never pass through our servers.
        </p>
        <p>
          <strong>Resend</strong> — transactional email delivery.
        </p>
        <p>
          <strong>Railway</strong> — infrastructure hosting for the API and
          this website.
        </p>
        <p>
          <strong>Brave Search</strong> — private web search on fraise.box.
        </p>
      </section>

      <hr />

      <section>
        <span className="section-number">VI.</span>
        <h2>Contact</h2>
        <p>
          Questions about this policy or requests to access or delete your data
          can be sent through the <a href="/support">support page</a> or by
          replying to any transactional email from fraise.box.
        </p>
      </section>

      <footer className="doc-footer">
        <p className="meta">box fraise &mdash; fraise.box &mdash; 2026</p>
      </footer>
    </main>
  );
}
