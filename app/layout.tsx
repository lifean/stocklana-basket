import type { Metadata } from 'next';
import { Providers } from './providers';
import { Header } from '@/components/header';
import './globals.css';
export const metadata: Metadata = { title: 'Stocklana Basket', description: 'Explore tokenized equity portfolios on Solana and preview your USDC allocation.' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><Providers><div className="shell"><Header />{children}<footer><span>Stocklana Basket <span className="muted">/ Own your allocation.</span></span><span className="muted">Hackathon demo · Mainnet · Preview only</span></footer></div></Providers></body></html>;
}
