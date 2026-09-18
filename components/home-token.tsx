'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AssetProvider, BasketAsset } from '@/types/basket';
import type { StockRegistry } from '@/types/stock';
import { TokenIdentity } from './token-identity';

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

export function HomeToken({ asset }: { asset: BasketAsset }) {
  const registry = useContext(TokenRegistries)[asset.provider ?? 'xstocks'];
  return <TokenIdentity asset={asset} registry={registry} />;
}
