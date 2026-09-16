import Link from 'next/link';
import { notFound } from 'next/navigation';
import { baskets } from '@/lib/baskets';
import { InvestmentForm } from '@/components/investment-form';
export function generateStaticParams() { return baskets.map(b => ({ id: b.id })); }
export default async function BasketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const basket = baskets.find(b => b.id === id);
  if (!basket) notFound();
  return <main className="basket-page"><Link className="back-link" href="/">← All strategies</Link><div className="basket-heading"><span className="emoji">{basket.emoji}</span><span className="eyebrow">YOUR PORTFOLIO STARTS HERE</span><h1>{basket.name}</h1><p className="muted">{basket.description}</p></div><div className="basket-grid"><section className="panel"><span className="eyebrow">THE STRATEGY</span><h2>Target allocation</h2><dl className="target-list">{basket.assets.map((a, i) => <div key={a.symbol}><dt><span className={`asset-icon segment-${i}`}>{a.stockSymbol[0]}</span><span>{a.stockSymbol}<small>{a.symbol} · {basket.provider === 'tessera' ? 'Tessera T-Token exposure' : 'Tokenized equity'}</small></span></dt><dd>{a.weightBps / 100}%</dd></div>)}</dl><p className="muted small">Each allocation is held as an individual token. You keep control of your wallet.</p></section><InvestmentForm basket={basket} /></div></main>;
}
