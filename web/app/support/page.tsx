export const metadata = {
  title: 'box fraise — support',
  description: 'Support Box Fraise.',
};

export default function SupportPage() {
  return (
    <main className="document">
      <header style={{ marginBottom: '3rem' }}>
        <nav style={{ marginBottom: '2rem' }}>
          <a href="/" style={{ fontSize: '0.8125rem', letterSpacing: '0.04em', textDecoration: 'none', color: 'var(--muted)' }}>
            ← box fraise
          </a>
        </nav>
        <h1>support</h1>
        <p className="meta" style={{ marginTop: '0.75rem' }}>
          Independent, local, and built from scratch.
        </p>
      </header>

      <hr />

      <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <p style={{ color: 'var(--muted)', lineHeight: 1.75, maxWidth: '48ch' }}>
          Box Fraise is a small platform built to support local businesses, cooperative ownership, and community commerce.
          If you believe in what we're building, a contribution helps keep it going.
        </p>

        <p style={{ color: 'var(--muted)', lineHeight: 1.75, maxWidth: '48ch' }}>
          Donations are made through the app. You can also support a specific business directly from their page.
        </p>

        <a
          href="https://testflight.apple.com/join/zJG1Wc5Y"
          style={{
            display: 'inline-block',
            fontSize: '0.8125rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            textDecoration: 'none',
            border: '1px solid var(--text)',
            padding: '0.6rem 1.25rem',
            color: 'var(--text)',
            alignSelf: 'flex-start',
          }}
        >
          Get the app →
        </a>
      </div>

      <hr style={{ marginTop: '4rem' }} />
      <footer style={{ marginTop: '2rem' }}>
        <p className="meta">box fraise — fraise.box — 2026</p>
      </footer>
    </main>
  );
}
