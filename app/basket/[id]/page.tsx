import { ProviderBadge } from '@/components/provider-badge';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { baskets } from '@/lib/baskets';
import { InvestmentForm } from '@/components/investment-form';
export function generateStaticParams() { return baskets.map(b => ({ id: b.id })); }
export default async function BasketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const basket = baskets.find(b => b.id === id);
  if (!basket) notFound();
  return <main className="basket-page"><Link className="back-link" href="/">← All strategies</Link><div className="basket-heading"><span className="emoji">{basket.emoji}</span><span className="eyebrow">YOUR PORTFOLIO STARTS HERE</span><h1>{basket.name}</h1><ProviderBadge provider={basket.provider} powered={basket.provider === 'prestocks' || basket.provider === 'tessera'} /><p className="muted">{basket.description}</p></div><InvestmentForm basket={basket} /></main>;
}
