export const metadata = {
  title: 'box fraise — stickers',
  description: 'Collectible city stickers. Digital and physical.',
};

const STICKERS = [
  {
    title: 'Digital Sticker',
    description: 'Delivered instantly in-app. Collect locations, send them to friends.',
    price: '3.00',
  },
  {
    title: 'Physical Sticker Pack',
    description: 'Die-cut vinyl. Weatherproof. Mailed to the recipient.',
    price: '14.00',
  },
  {
    title: 'Digital + Physical',
    description: 'Both together.',
    price: '16.00',
  },
];

export default function StickersPage() {
  return (
    <main className="document">
      <header style={{ marginBottom: '3rem' }}>
        <nav style={{ marginBottom: '2rem' }}>
          <a href="/" style={{ fontSize: '0.8125rem', letterSpacing: '0.04em', textDecoration: 'none', color: 'var(--muted)' }}>
            ← box fraise
          </a>
        </nav>
        <h1>stickers</h1>
        <p className="meta" style={{ marginTop: '0.75rem' }}>
          Collectible city stickers. Send one to a friend — digital or physical.
        </p>
      </header>

      <hr />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0', marginTop: '2rem' }}>
        {STICKERS.map((s, i) => (
          <div key={i} style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem', paddingBottom: '2rem' }}>
            <h2 style={{ marginTop: 0, marginBottom: '0.5rem' }}>{s.title}</h2>
            <p style={{ color: 'var(--muted)', fontStyle: 'italic', margin: '0 0 0.75rem' }}>{s.description}</p>
            <p style={{ margin: 0, fontSize: '0.9375rem', letterSpacing: '0.02em' }}>
              CA${s.price}
            </p>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '2rem' }}>
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
