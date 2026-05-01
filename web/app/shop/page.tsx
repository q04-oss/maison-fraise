export const metadata = {
  title: "box fraise — stickers",
  description: "Collectible city stickers. Digital and physical.",
};

const STICKERS = [
  {
    title: "Digital Sticker",
    description: "Delivered instantly in-app. Collect locations, send them to friends.",
    price: "3.00",
  },
  {
    title: "Physical Sticker Pack",
    description: "Die-cut vinyl. Weatherproof. Mailed to the recipient.",
    price: "14.00",
  },
  {
    title: "Digital + Physical",
    description: "Both together.",
    price: "16.00",
  },
];

export default function StickersPage() {
  return (
    <main className="page">
      <div className="doc-header">
        <a className="back-link" href="/">← box fraise</a>
        <h1>stickers</h1>
        <p className="meta">
          Collectible city stickers. Send one to a friend — digital or physical.
        </p>
      </div>

      <hr />

      <ul className="product-list">
        {STICKERS.map((s) => (
          <li key={s.title} className="product-item">
            <h2 className="product-title">{s.title}</h2>
            <p className="product-desc">{s.description}</p>
            <p className="meta">CA${s.price}</p>
          </li>
        ))}
      </ul>

      <div className="product-cta">
        <a className="btn btn-primary" href="https://testflight.apple.com/join/zJG1Wc5Y">
          Get the app →
        </a>
      </div>

      <footer className="doc-footer">
        <p className="meta">box fraise &mdash; fraise.box &mdash; 2026</p>
      </footer>
    </main>
  );
}
