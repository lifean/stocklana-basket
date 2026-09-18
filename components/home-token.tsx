'use client';
import Image from 'next/image';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AssetProvider, BasketAsset } from '@/types/basket';
import type { StockAsset, StockRegistry } from '@/types/stock';
import { TokenAddressCopy } from './token-address-copy';

const endpoints: Record<AssetProvider, string> = { xstocks: '/api/stocks', tessera: '/api/tessera', prestocks: '/api/prestocks' };
type Registries = Partial<Record<AssetProvider, StockRegistry | null>>;
const TokenRegistries = createContext<Registries>({});
// Share in-flight requests across consumers, including Strict Mode effect replays.
const pending = new Map<AssetProvider, Promise<StockRegistry>>();
function loadRegistry(provider: AssetProvider) {
  let request = pending.get(provider);
  if (!request) {
    request = fetch(endpoints[provider], { cache: 'no-store', signal: AbortSignal.timeout(20_000) }).then(async response => {
      if (!response.ok) throw new Error('Token data unavailable');
      const data: StockRegistry = await response.json();
      if (!Array.isArray(data.stocks) || !Array.isArray(data.unavailable)) throw new Error('Invalid token data');
      return data;
    }).finally(() => pending.delete(provider));
    pending.set(provider, request);
  }
  return request;
}

export function HomeTokenProvider({ children }: { children: ReactNode }) {
  const [registries, setRegistries] = useState<Registries>({});
  useEffect(() => {
    let active = true;
    for (const provider of Object.keys(endpoints) as AssetProvider[]) {
      void loadRegistry(provider).then(
        registry => { if (active) setRegistries(current => ({ ...current, [provider]: registry })); },
        () => { if (active) setRegistries(current => ({ ...current, [provider]: null })); },
      );
    }
    return () => { active = false; };
  }, []);
  return <TokenRegistries.Provider value={registries}>{children}</TokenRegistries.Provider>;
}

function imageUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}

function TokenIcon({ stock, name }: { stock: StockAsset | null; name: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [imageUrl(stock?.icon), imageUrl(stock?.preIpo?.image)].find(url => url && !failed.includes(url));
  return <span className="home-token-icon" aria-hidden="true">
    {src ? <Image src={src} alt="" width={28} height={28} unoptimized onError={() => setFailed(current => [...current, src])} /> : name[0]?.toUpperCase()}
  </span>;
}

export function HomeToken({ asset }: { asset: BasketAsset }) {
  const provider = asset.provider ?? 'xstocks';
  const registry = useContext(TokenRegistries)[provider];
  const matches = registry?.stocks.filter(stock => stock.symbol === asset.symbol && (stock.provider ?? 'xstocks') === provider) ?? [];
  const unavailable = registry?.unavailable.some(issue => issue.symbol === asset.symbol && (issue.provider ?? provider) === provider);
  const stock = !unavailable && matches.length === 1 && matches[0].mint ? matches[0] : null;
  return <>
    <TokenIcon stock={stock} name={asset.stockSymbol} />
    <span className="home-token-info">
      <span className="home-token-name">{asset.stockSymbol}</span>
      {stock ? <TokenAddressCopy key={stock.mint} mint={stock.mint} symbol={asset.symbol} /> : <span className="token-address-placeholder">{registry === undefined ? 'Loading address…' : 'Address unavailable'}</span>}
    </span>
  </>;
}
