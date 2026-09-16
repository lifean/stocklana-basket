import 'server-only';
import { cached, getTokenMetadata } from '../jupiter/client';
import { resolvePreIpoMetadata } from '../tessera/normalize';
import { normalizePreStocks, PRESTOCKS_SYMBOLS } from './normalize';
import type { PreIpoRegistry } from '@/types/pre-ipo';
export function preStocksUnavailable(message: string): PreIpoRegistry {
  return { assets: [], stocks: [], unavailable: PRESTOCKS_SYMBOLS.map(symbol => ({ symbol, provider: 'prestocks', reason: 'unavailable', message })) };
}
export function getPreStocks(): Promise<PreIpoRegistry> {
  return cached('prestocks', 60_000, async () => {
    let products: PreIpoRegistry;
    try {
      const response = await fetch('https://prestocks.com/api/prestocks', { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error('PreStocks API unavailable');
      products = normalizePreStocks(await response.json());
    } catch { throw new Error('PreStocks API is temporarily unavailable. Pre-IPO AI Leaders cannot be traded. Please refresh shortly.'); }
    if (!products.assets.length) return products;
    try { return resolvePreIpoMetadata(products, await getTokenMetadata(products.assets.map(a => a.mint))); }
    catch { return resolvePreIpoMetadata(products, null); }
  });
}
