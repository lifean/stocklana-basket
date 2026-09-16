import 'server-only';
import { cached, getTokenMetadata } from '../jupiter/client';
import { normalizeTessera, resolveTesseraMetadata, TESSERA_SYMBOLS } from './normalize';
import type { TesseraRegistry } from '@/types/pre-ipo';
export function tesseraUnavailable(message: string): TesseraRegistry {
  return { assets: [], stocks: [], unavailable: TESSERA_SYMBOLS.map(symbol => ({ symbol, provider: 'tessera', reason: 'unavailable', message })) };
}
export function getTessera(): Promise<TesseraRegistry> {
  return cached('tessera', 60_000, async () => {
    let products: TesseraRegistry;
    try {
      const response = await fetch('https://rest-api.tessera.pe/v1/public/token-details', { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
      if (!response.ok) throw new Error('Tessera API unavailable');
      products = normalizeTessera(await response.json());
      products.fetchedAt = Date.now();
    } catch { throw new Error('Tessera API is temporarily unavailable. Future Markets cannot be traded. Please refresh shortly.'); }
    if (!products.assets.length) return products;
    try { return resolveTesseraMetadata(products, await getTokenMetadata(products.assets.map(a => a.mint))); }
    catch { return resolveTesseraMetadata(products, null); }
  });
}
