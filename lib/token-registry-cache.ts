import type { AssetProvider } from '../types/basket.ts';
import type { StockRegistry } from '../types/stock.ts';
import type { PreIpoRegistry } from '../types/pre-ipo.ts';

export type TokenRegistry = StockRegistry & Partial<Pick<PreIpoRegistry, 'assets' | 'fetchedAt'>>;
export const TOKEN_REGISTRY_TTL = 5 * 60 * 1000;
const endpoints: Record<AssetProvider, string> = { xstocks: '/api/stocks', tessera: '/api/tessera', prestocks: '/api/prestocks' };
type Snapshot = { data?: TokenRegistry; updatedAt: number; error: string | null };
const empty: Snapshot = { updatedAt: 0, error: null };

export function createTokenRegistryCache({ fetcher = fetch, now = Date.now }: { fetcher?: typeof fetch; now?: () => number } = {}) {
  const snapshots = new Map<AssetProvider, Snapshot>();
  const requests = new Map<AssetProvider, Promise<TokenRegistry>>();
  const updates = new Map<AssetProvider, Promise<TokenRegistry>>();
  const listeners = new Set<() => void>();
  const read = (provider: AssetProvider) => snapshots.get(provider) ?? empty;
  function publish(provider: AssetProvider, snapshot: Snapshot) {
    snapshots.set(provider, snapshot);
    listeners.forEach(listener => listener());
  }
  // Fresh transaction checks share in-flight requests, but never use cached data.
  function fresh(provider: AssetProvider): Promise<TokenRegistry> {
    const pending = requests.get(provider);
    if (pending) return pending;
    const request = Promise.resolve().then(async () => {
      const response = await fetcher(endpoints[provider], { cache: 'no-store', signal: AbortSignal.timeout(20_000) });
      const data = await response.json();
      if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Token data unavailable.');
      if (!Array.isArray(data.stocks) || !Array.isArray(data.unavailable) || ('assets' in data && !Array.isArray(data.assets))) throw new Error('Invalid token data.');
      return data as TokenRegistry;
    }).finally(() => requests.delete(provider));
    requests.set(provider, request);
    return request;
  }
  function load(provider: AssetProvider, force = false): Promise<TokenRegistry> {
    const snapshot = read(provider);
    if (!force && snapshot.data && !snapshot.error && now() - snapshot.updatedAt < TOKEN_REGISTRY_TTL) return Promise.resolve(snapshot.data);
    const pending = updates.get(provider);
    if (pending) return pending;
    const update = fresh(provider).then(data => {
      publish(provider, { data, updatedAt: now(), error: null });
      return data;
    }, error => {
      publish(provider, { ...read(provider), error: error instanceof Error ? error.message : 'Token data unavailable.' });
      throw error;
    }).finally(() => updates.delete(provider));
    updates.set(provider, update);
    return update;
  }
  return { read, load, fresh, subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; } };
}

// Browser-module memory only: shared across client-side navigation, reset on reload.
export const tokenRegistryCache = createTokenRegistryCache();
