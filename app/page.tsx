import Link from 'next/link'

export default function Home() {
  return (
    <main className="app-shell">
      <section className="glass-panel stagger-in home-shell">
        <div className="home-grid">
          <div className="stagger-in delay-1 home-tag">
            Zero Trust Bounties · Sponsor Console
          </div>

          <h1 className="hero-title title-gradient stagger-in delay-2 home-title">
            Build trust
            <br />
            without exposing secrets.
          </h1>

          <p className="muted stagger-in delay-2 home-lead">
            ZTB permet aux sponsors de recevoir des rapports chiffrés sur des vulnerabilites,
            avec une cle publique partageable et une cle privee gardee hors ligne.
          </p>

          <div className="stagger-in delay-3 home-actions">
            <Link href="/sponsor" className="app-btn primary">
              Ouvrir l&apos;interface Sponsor
            </Link>
            <div className="app-btn secondary home-status">
              Sepolia ready · Wallet connecte via MetaMask
            </div>
          </div>

          <div className="stagger-in delay-3 home-cards">
            <div className="glass-panel home-card">
              <p className="muted home-card-label">Flow</p>
              <p className="home-card-value">Wallet + ECIES</p>
            </div>
            <div className="glass-panel home-card">
              <p className="muted home-card-label">Network</p>
              <p className="home-card-value">Ethereum Sepolia</p>
            </div>
            <div className="glass-panel home-card">
              <p className="muted home-card-label">Cipher</p>
              <p className="home-card-value">AES-GCM + secp256k1</p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
