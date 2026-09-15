import type { Metadata } from 'next';
import { Providers } from './providers';
import { Header } from '@/components/header';
import './globals.css';
export const metadata: Metadata = { title: 'Stocklana Basket', description: 'Build, buy and rebalance tokenized stock portfolios directly from a Solana wallet.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers><div className="shell"><Header />{children}<footer><span>Built on Solana · Powered by Jupiter</span><span className="muted">Hackathon demo. Not investment advice.<br />Tokenized securities may be subject to geographic restrictions.</span></footer></div></Providers></body></html>;
}
