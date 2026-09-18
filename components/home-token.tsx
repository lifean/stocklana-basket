'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AssetProvider, BasketAsset } from '@/types/basket';
import type { StockRegistry } from '@/types/stock';
import { TokenIdentity } from './token-identity';
import { tokenRegistryCache } from '@/lib/token-registry-cache';

const providers: AssetProvider[] = ['xstocks', 'tessera', 'prestocks'];
type Registries = Partial<Record<AssetProvider, StockRegistry | null>>;
const TokenRegistries = createContext<Registries>({});

export function HomeTokenProvider({ children }: { children: ReactNode }) {
  const [registries, setRegistries] = useState<Registries>({});
  useEffect(() => {
    const update = () => setRegistries(Object.fromEntries(providers.map(provider => {
      const snapshot = tokenRegistryCache.read(provider);
      return [provider, snapshot.data ?? (snapshot.error ? null : undefined)];
    })));
    const unsubscribe = tokenRegistryCache.subscribe(update);
    update();
    for (const provider of providers) void tokenRegistryCache.load(provider).catch(() => { /* The cache publishes errors. */ });
    return unsubscribe;
  }, []);
  return <TokenRegistries.Provider value={registries}>{children}</TokenRegistries.Provider>;
}

export function HomeToken({ asset }: { asset: BasketAsset }) {
  const registry = useContext(TokenRegistries)[asset.provider ?? 'xstocks'];
  return <TokenIdentity asset={asset} registry={registry} />;
}
