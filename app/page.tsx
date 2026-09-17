import { ProviderBadge } from '@/components/provider-badge';
import Link from 'next/link';
import { baskets } from '@/lib/baskets';
export default function Home() {
  const preIpoBaskets = ['preipo-ai-leaders', 'future-markets'].map(id => baskets.find(b => b.id === id)!);
  return <main className="discovery-page">
    <header className="discovery-heading">
      <span className="eyebrow">PORTFOLIOS</span>
      <h1>Build your portfolio.</h1>
      <p className="muted">Public stocks and pre-IPO exposure on Solana. Held directly in your wallet.</p>
    </header>
    <nav className="category-nav" aria-label="Basket categories">
      <a href="#preipo" className="category-link category-link-preipo">Pre-IPO <span>02</span></a>
      <a href="#public" className="category-link category-link-public">Public Stocks <span>03</span></a>
    </nav>
    <div id="strategies" className="strategies">
      {(['preipo', 'public'] as const).map(provider => <section key={provider} id={provider} className="strategy-category" aria-labelledby={`${provider}-heading`}>
        <div className="category-heading"><h2 id={`${provider}-heading`}>{provider === 'preipo' ? 'Pre-IPO' : 'Public Stocks'}</h2><p className="muted">{provider === 'preipo' ? 'Private-market exposure. Transparent provider data.' : 'Established companies. Curated allocations.'}</p></div>
        <div className="cards">{(provider === 'public' ? baskets.filter(b => (b.provider ?? 'xstocks') === 'xstocks') : preIpoBaskets).map(basket => <article className="strategy-card" key={basket.id}>
          <div className="card-top"><span className="card-category">{provider === 'preipo' ? 'PRE-IPO' : 'PUBLIC STOCKS'}</span><ProviderBadge provider={basket.provider} /></div>
          <h3><span className="emoji" aria-hidden="true">{basket.emoji}</span>{basket.name}</h3>
          <p className="muted card-description">{basket.description}</p>
          <div className="allocation-bar" aria-hidden="true">{basket.assets.map((a, j) => <span key={a.symbol} className={`segment segment-${j}`} style={{ width: `${a.weightBps / 100}%` }} />)}</div>
          <dl className="allocations">{basket.assets.map((a, j) => <div key={a.symbol}><dt><span className={`allocation-dot segment-${j}`} aria-hidden="true" />{a.stockSymbol}</dt><dd>{a.weightBps / 100}<span className="muted">%</span></dd></div>)}</dl>
          <Link className="button primary full" href={`/basket/${basket.id}`}>Invest <span aria-hidden="true">↗</span></Link>
        </article>)}</div>
      </section>)}
    </div>
    <p className="disclaimer">Tokenized equities carry market and issuer risk. This project is a hackathon demo and does not constitute investment advice.</p>
  </main>;
}
