export const metadata = {
  title: "box fraise — Security",
  description:
    "Security architecture of the box fraise platform: request signing, replay prevention, token revocation, and client-side credential storage.",
};

type Property = { key: string; value: React.ReactNode };

const requestSecurity: Property[] = [
  {
    key: "Signing algorithm",
    value: (
      <>
        Every request is signed with HMAC-SHA256 over{" "}
        <code>METHOD\nPATH\nTIMESTAMP\nNONCE\nBODY_SHA256</code>. The
        signature is verified server-side using{" "}
        <code>subtle::ConstantTimeEq</code> to prevent timing oracles.
      </>
    ),
  },
  {
    key: "Replay prevention",
    value: (
      <>
        Each request carries a UUID nonce. The server enforces canonical
        hyphenated UUID format and stores valid nonces in Redis with a 5-minute
        TTL. Replayed requests are rejected before any business logic runs.
      </>
    ),
  },
  {
    key: "Timestamp window",
    value: (
      <>
        Requests with a timestamp outside a ±5-minute window are rejected.
        Combined with the nonce, this bounds the replay window to the
        intersection of the two constraints.
      </>
    ),
  },
  {
    key: "Body limits",
    value: (
      <>
        Unauthenticated webhook endpoints are capped at{" "}
        <code>DefaultBodyLimit::max(65_536)</code> to prevent request-body DoS
        before signature verification runs.
      </>
    ),
  },
];

const tokenSecurity: Property[] = [
  {
    key: "JWT revocation",
    value: (
      <>
        Tokens are revoked on logout via{" "}
        <code>SET fraise:revoked:&#123;jti&#125; 1 EX &#123;ttl&#125;</code> in
        Redis. Every authenticated request checks{" "}
        <code>EXISTS fraise:revoked:&#123;jti&#125;</code> before proceeding.
        Falls back gracefully when Redis is unavailable.
      </>
    ),
  },
  {
    key: "Secret rotation",
    value: (
      <>
        The server accepts <code>JWT_SECRET_PREVIOUS</code> alongside the
        active secret. Tokens signed with the previous secret remain valid
        during rotation, preventing forced logouts.
      </>
    ),
  },
  {
    key: "Staff isolation",
    value: (
      <>
        Staff JWTs are signed with a separate{" "}
        <code>STAFF_JWT_SECRET</code> and carry business-scoped claims.
        A staff token cannot be used on customer endpoints, and vice versa.
      </>
    ),
  },
];

const clientSecurity: Property[] = [
  {
    key: "Keychain storage",
    value: (
      <>
        Access tokens are stored in the iOS Keychain with{" "}
        <code>kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly</code> and
        biometric protection (<code>.biometryAny | .devicePasscode</code>).
        Tokens cannot be extracted from a locked device.
      </>
    ),
  },
  {
    key: "Certificate pinning",
    value: (
      <>
        <code>PinningDelegate</code> in <code>APIClient.swift</code> validates
        the server&apos;s certificate against a bundled public key hash. Active
        before production deployment.
      </>
    ),
  },
  {
    key: "Push notifications",
    value: (
      <>
        APNs device tokens are registered per-user and used only for silent
        loyalty-update pushes. No marketing or tracking payloads are sent.
      </>
    ),
  },
];

const platformSecurity: Property[] = [
  {
    key: "HTML escaping",
    value: (
      <>
        All user-supplied data (customer name, reward description, error
        messages) is HTML-escaped before rendering in server-side HTML pages.
        No framework escaping is relied upon for values that pass through{" "}
        <code>format!()</code> strings.
      </>
    ),
  },
  {
    key: "Rate limiting",
    value: (
      <>
        Per-endpoint rate limits are enforced via Redis INCR + EXPIRE with
        fixed-window counters. The HTML stamp path uses an IP-keyed counter
        independent of the business ID, preventing business-targeted DoS.
      </>
    ),
  },
  {
    key: "QR stamp integrity",
    value: (
      <>
        QR tokens encode both user ID and business ID. A Lua script atomically
        validates business ownership and consumes the token in a single Redis
        round-trip, preventing cross-business token abuse without a race window.
      </>
    ),
  },
  {
    key: "Audit log",
    value: (
      <>
        Security-relevant events (cross-business stamp attempts, NFC probes,
        rate limit hits, staff logins) are written to a permanent audit log
        with full context before any rejection response is returned.
      </>
    ),
  },
  {
    key: "CSP + headers",
    value: (
      <>
        This site sets <code>Strict-Transport-Security</code>,{" "}
        <code>X-Frame-Options: DENY</code>,{" "}
        <code>X-Content-Type-Options: nosniff</code>,{" "}
        <code>Referrer-Policy</code>, <code>Permissions-Policy</code>, and a{" "}
        <code>Content-Security-Policy</code> on every response.{" "}
        <code>X-Powered-By</code> is suppressed.
      </>
    ),
  },
];

function PropertyTable({ items }: { items: Property[] }) {
  return (
    <ul className="property-list">
      {items.map((item, i) => (
        <li key={i}>
          <span className="property-key">{item.key}</span>
          <p className="property-value">{item.value}</p>
        </li>
      ))}
    </ul>
  );
}

export default function SecurityPage() {
  return (
    <main className="page">
      <div className="doc-header">
        <a className="back-link" href="/">← box fraise</a>
        <h1>Security</h1>
        <p className="meta">
          Architecture properties of the box fraise platform.
          Last reviewed April 2026.
        </p>
      </div>

      <section>
        <span className="section-number">I.</span>
        <h2>Request Security</h2>
        <PropertyTable items={requestSecurity} />
      </section>

      <hr />

      <section>
        <span className="section-number">II.</span>
        <h2>Token Security</h2>
        <PropertyTable items={tokenSecurity} />
      </section>

      <hr />

      <section>
        <span className="section-number">III.</span>
        <h2>Client Security</h2>
        <PropertyTable items={clientSecurity} />
      </section>

      <hr />

      <section>
        <span className="section-number">IV.</span>
        <h2>Platform Security</h2>
        <PropertyTable items={platformSecurity} />
      </section>

      <hr />

      <div className="note">
        Security issues may be reported by email. Contact details are available
        through the support page.
      </div>

      <footer className="doc-footer">
        <p className="meta">box fraise &mdash; fraise.box &mdash; 2026</p>
      </footer>
    </main>
  );
}
