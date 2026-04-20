export const metadata = {
  title: 'box fraise — shop',
};

const PRODUCTS = [
  {
    id: 'sticker-pack',
    title: 'Sticker Pack',
    description: '5 die-cut vinyl strawberry stickers. Weatherproof, kiss-cut, ready to go anywhere.',
    price: '14.00',
    currency: 'CAD',
    checkoutUrl: 'https://shop.fraise.box/cart/50900019970281:1',
  },
];

export default function ShopPage() {
  return (
    <main className="document">
      <header style={{ marginBottom: '3rem' }}>
        <nav style={{ marginBottom: '2rem' }}>
          <a href="/" style={{ fontSize: '0.8125rem', letterSpacing: '0.04em', textDecoration: 'none', color: 'var(--muted)' }}>
            ← box fraise
          </a>
        </nav>
        <h1>shop</h1>
        <p className="meta" style={{ marginTop: '0.75rem' }}>fraise.box — pre-order</p>
      </header>

      <hr />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '3rem', marginTop: '2rem' }}>
        {PRODUCTS.map(product => (
          <div key={product.id} style={{ borderTop: '1px solid var(--border)', paddingTop: '2rem' }}>
            <h2 style={{ marginTop: 0 }}>{product.title}</h2>
            <p style={{ color: 'var(--muted)', fontStyle: 'italic' }}>{product.description}</p>
            <p style={{ margin: '1rem 0', fontSize: '0.9375rem', letterSpacing: '0.02em' }}>
              ${product.price} {product.currency}
            </p>
            <a
              href={product.checkoutUrl}
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
              Pre-order
            </a>
          </div>
        ))}
      </div>

      <hr style={{ marginTop: '4rem' }} />
      <footer style={{ marginTop: '2rem' }}>
        <p className="meta">box fraise — fraise.box — 2026</p>
      </footer>
    </main>
  );
}
