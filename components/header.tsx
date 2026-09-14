import Link from 'next/link';
import { WalletButton } from './wallet/wallet-button';
export function Header() { return <header className="site-header"><Link href="/" className="brand"><span className="brand-icon">▦</span><span>Stocklana Basket<small>Tokenized portfolios on Solana</small></span></Link><div className="portfolio-nav"><Link className="text-button small" href="/portfolio">Portfolio</Link><WalletButton /></div></header>; }
