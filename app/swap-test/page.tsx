import Link from 'next/link';
import { SingleStockPurchase } from '@/components/single-stock-purchase';
export default function SwapTestPage() {
  return <main className="basket-page"><Link href="/basket/ai-leaders" className="back-link">← AI Leaders preview</Link><div style={{ maxWidth: 620, margin: '32px auto' }}><SingleStockPurchase /></div></main>;
}
