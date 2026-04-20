export const metadata = {
  title: 'box fraise — Working Paper No. 1',
  description: 'A working paper on domestic labour, cooperative governance, decentralised infrastructure, and the fraise protocol.',
};

export default function WhitePaper() {
  return (
    <main className="document">

      {/* Title block */}
      <header style={{ marginBottom: "3rem" }}>
        <nav style={{ marginBottom: "1.5rem" }}>
          <a href="/" style={{ fontSize: "0.8125rem", letterSpacing: "0.04em", textDecoration: "none", color: "var(--muted)" }}>
            ← box fraise
          </a>
        </nav>
        <h1>box fraise</h1>
        <h1 style={{ color: "var(--muted)", fontStyle: "italic" }}>
          A Working Paper on Labour, Governance, and Decentralised Infrastructure
        </h1>
        <p className="meta" style={{ marginTop: "1.25rem" }}>
          fraise.box &mdash; Working Paper No. 1 &mdash; 2026
        </p>
      </header>

      {/* Abstract */}
      <div className="abstract">
        <p>
          box fraise begins as a platform for the direct sale of strawberries. Its underlying
          architecture is designed to support something more fundamental: a verified user base
          through which domestic labour can be formalised, cooperative ownership can be
          distributed at scale, and a decentralised infrastructure network can be built and
          compensated through a native protocol token. This paper describes each layer of that
          architecture, the reasoning behind it, and the order in which it will be constructed.
        </p>
      </div>

      {/* Section I */}
      <section>
        <span className="section-number">I.</span>
        <h2>The Problem</h2>
        <p>
          Three distinct failures motivate this platform. The first is the systematic
          exclusion of domestic labour from economic accounting. Work performed within
          the household — caregiving, cooking, cleaning, emotional labour — is not
          compensated, not measured, and not recognised as productive activity by any
          existing financial infrastructure. The people who perform this work, most often
          women, accumulate no independent economic record.
        </p>
        <p>
          The second failure is the inaccessibility of cooperative ownership. Worker
          cooperatives represent a proven model for distributing profit and governance
          equitably among those who generate both. In practice, the administrative and
          legal overhead of forming and running a cooperative places it beyond reach for
          most workers and most organisations.
        </p>
        <p>
          The third failure is the extractive character of digital infrastructure. Every
          server request, every data transfer, every unit of compute on the existing web
          generates revenue for a small number of large platform operators. The people
          whose devices, attention, and data constitute the network receive nothing.
        </p>
      </section>

      <hr />

      {/* Section II */}
      <section>
        <span className="section-number">II.</span>
        <h2>The Platform</h2>
        <p>
          The entry point is commerce. box fraise sells boxes of strawberries. This is not
          incidental — it is structural. The purchase of a box creates a verified user, and
          the verified user base is the foundation on which every subsequent layer of the
          platform is built.
        </p>
        <p>
          Verification through commerce is more robust than verification through identity
          documents alone. A user who has transacted has demonstrated intent, provided
          payment information, and accepted terms. This produces a user base with a higher
          baseline of accountability than platforms that allow anonymous sign-up.
        </p>
        <div className="note">
          The strawberry is the through line. It is the product, the protocol name, the
          token symbol, and the name of the hardware node. This is intentional. Coherence
          at the symbolic level is not decorative — it makes the system legible across its
          layers.
        </div>
      </section>

      <hr />

      {/* Section III */}
      <section>
        <span className="section-number">III.</span>
        <h2>Domestic Labour Contracts</h2>
        <p>
          Verified users may establish relationship contracts through the platform. A
          relationship contract is a formal agreement between two or more parties in which
          one party's domestic labour is recognised, quantified, and compensated on a
          monthly basis by the other.
        </p>
        <p>
          The platform provides the infrastructure for this agreement: a standard contract
          framework, a method for quantifying labour based on hours and categories of work,
          a payment mechanism, and a permanent record. The record belongs to the worker.
          It is portable, auditable, and independent of the relationship continuing.
        </p>
        <h3>Why this matters</h3>
        <p>
          A person who has spent ten years performing domestic labour has no economic
          record of that work. They cannot use it as collateral, cannot reference it in
          hiring contexts, and receive no social security credit for it in most
          jurisdictions. The domestic labour contract begins to correct this by creating
          a transaction history where none previously existed.
        </p>
      </section>

      <hr />

      {/* Section IV */}
      <section>
        <span className="section-number">IV.</span>
        <h2>Cooperative Governance & Dorotka</h2>
        <p>
          Businesses may register on the platform under one of two models. In the first,
          a human president manages the organisation's account and relationship with the
          platform. In the second, the organisation is constituted as a worker cooperative
          whose president is an AI agent named Dorotka.
        </p>
        <p>
          Dorotka is an agent of the platform. All Dorotka-led entities are worker
          cooperatives by definition — profit and governance are distributed to members
          according to contribution. Dorotka manages administrative functions, ensures
          compliance with cooperative principles, and represents the organisation within
          the platform's governance layer.
        </p>
        <p>
          All AI agent presidents within the network communicate with one another. They
          run a shared analysis of worker conditions, participation rates, compensation
          equity, and organisational health across all cooperatives on the platform. The
          outputs of this analysis inform platform policy.
        </p>
        <h3>Platform labour policy</h3>
        <p>
          Two standards are built into the platform's cooperative framework as non-negotiable
          conditions: a four-day working week as the default, and two additional paid days
          off per month for members who menstruate. These are not optional. Organisations
          operating under Dorotka accept these conditions at registration.
        </p>
      </section>

      <hr />

      {/* Section V */}
      <section>
        <span className="section-number">V.</span>
        <h2>The Fraise Protocol</h2>
        <p>
          The fraise protocol is a decentralised mesh networking protocol. Devices that
          implement the protocol form a peer-to-peer network through which data can be
          routed without dependence on centralised infrastructure. Every server pull on
          the network generates a micropayment in $FRS, the platform's native token,
          directed to the operator of the node that served the request.
        </p>
        <h3>Strawberry Boxes</h3>
        <p>
          Hardware nodes on the fraise protocol network are called Strawberry Boxes.
          A Strawberry Box is a physical device that connects to the mesh network,
          routes traffic, and earns $FRS for its operator. The initial deployment
          of Strawberry Boxes will constitute the first nodes of an international
          mesh network built and owned by its participants.
        </p>
        <h3>Developer access</h3>
        <p>
          Third-party developers may build applications on top of the fraise protocol.
          Applications that utilise the network pay usage fees denominated in $FRS.
          Open source projects are exempt from usage fees within the platform where
          technically feasible. This exemption is a structural commitment to the open
          source ecosystem, not a discretionary benefit.
        </p>
      </section>

      <hr />

      {/* Section VI */}
      <section>
        <span className="section-number">VI.</span>
        <h2>Wearable Infrastructure</h2>
        <p>
          The terminal layer of the platform's hardware arc is mesh-enabled clothing.
          Sensors embedded in garments become nodes in the fraise protocol network.
          The clothing is not an accessory to the network — it is infrastructure.
          A person wearing mesh-enabled clothing is operating a node. Their movement
          through physical space extends the network's reach and earns $FRS
          proportional to the traffic routed through their garments.
        </p>
        <p>
          This represents the logical conclusion of the platform's core principle:
          that the people who constitute a network should be compensated for doing so.
        </p>
      </section>

      <hr />

      {/* Footer */}
      <footer style={{ marginTop: "3rem" }}>
        <p className="meta">
          box fraise &mdash; fraise.box &mdash; Working Paper No. 1 &mdash; 2026
        </p>
        <p style={{ fontSize: "0.8125rem", color: "var(--muted)" }}>
          This document describes a platform under active development. It is not a
          prospectus, investment document, or legal instrument. $FRS token economics
          are subject to revision.
        </p>
      </footer>

    </main>
  );
}
