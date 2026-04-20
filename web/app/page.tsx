export const metadata = {
  title: 'box fraise',
  description: 'A platform for local commerce.',
};

export default function Home() {
  return (
    <main style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      width: '100%',
      maxWidth: '680px',
      marginInline: 'auto',
      paddingInline: 'clamp(2rem, 6vw, 5rem)',
      paddingBlock: 'clamp(3rem, 8vw, 6rem)',
    }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '2.5rem' }}>

        <header>
          <h1 style={{ fontSize: 'clamp(1.4rem, 3vw, 1.75rem)', fontWeight: 400, lineHeight: 1.3, marginBottom: '0.75rem' }}>
            box fraise
          </h1>
          <p style={{ color: 'var(--muted)', fontSize: '1rem', lineHeight: 1.6, maxWidth: '42ch' }}>
            A platform for local commerce, cooperative ownership, and decentralised infrastructure.
          </p>
        </header>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
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
            Download beta
          </a>
          <a
            href="/shop"
            style={{
              display: 'inline-block',
              fontSize: '0.8125rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              textDecoration: 'none',
              border: '1px solid var(--border)',
              padding: '0.6rem 1.25rem',
              color: 'var(--muted)',
              alignSelf: 'flex-start',
            }}
          >
            Shop
          </a>
        </nav>

      </div>

      <footer style={{ paddingTop: '3rem' }}>
        <a
          href="/paper"
          style={{ fontSize: '0.8125rem', color: 'var(--muted)', letterSpacing: '0.03em' }}
        >
          Working Paper No. 1 →
        </a>
      </footer>
    </main>
  );
}
