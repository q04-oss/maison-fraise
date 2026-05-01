export const metadata = {
  title: "box fraise — support",
  description: "Support box fraise.",
};

export default function SupportPage() {
  return (
    <main className="page">
      <div className="doc-header">
        <a className="back-link" href="/">← box fraise</a>
        <h1>support</h1>
        <p className="meta">
          Independent, local, and built from scratch.
        </p>
      </div>

      <hr />

      <div className="support-body">
        <p className="support-para">
          box fraise is a small platform built to support local businesses,
          cooperative ownership, and community commerce. If you believe in what
          we&apos;re building, a contribution helps keep it going.
        </p>
        <p className="support-para">
          Donations are made through the app. You can also support a specific
          business directly from their page.
        </p>
        <p className="support-para">
          For security disclosures or technical questions, reply to any
          transactional email you&apos;ve received from fraise.box, or reach out
          through the app.
        </p>
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
