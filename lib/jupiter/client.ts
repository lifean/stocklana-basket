import 'server-only';
import { normalizeStocks, normalizeVerifiedStocks, normalizePrices, record } from './normalize';

export class JupiterError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function jupiterGet(path: string): Promise<unknown> {
  const key = process.env.JUPITER_API_KEY;
  if (!key) throw new JupiterError('Jupiter API is not configured. Set JUPITER_API_KEY on the server.', 503);
  try {
    const response = await fetch(`https://api.jup.ag${path}`, { headers: { 'x-api-key': key }, cache: 'no-store', signal: AbortSignal.timeout(12_000) });
    if (!response.ok) throw new JupiterError(response.status === 429 ? 'Jupiter rate limit reached. Please retry shortly.' : 'Jupiter is temporarily unavailable. Please retry.', response.status === 429 ? 429 : 502);
    return await response.json();
  } catch (error) {
    if (error instanceof JupiterError) throw error;
    throw new JupiterError('Could not reach Jupiter. Please retry shortly.', 502);
  }
}
// Bounded process-local cache, including in-flight deduplication. No persistent data.
const cache = new Map<string, { expires: number; value: Promise<unknown> }>();
async function cached<T>(key: string, ttl: number, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.value as Promise<T>;
  if (cache.size >= 100) cache.delete(cache.keys().next().value!);
  const value = load();
  cache.set(key, { expires: Date.now() + ttl, value });
  try { return await value; } catch (error) { cache.delete(key); throw error; }
}
export function getStocks() {
  return cached('stocks', 60_000, async () => {
    let data = await jupiterGet('/tokens/v2/tag?query=stocks');
    // Jupiter currently rejects its documented stocks tag in an HTTP 200 body.
    // Fetch the full verified registry so symbol search limits cannot hide duplicates.
    if (record(data) && data.status === 400 && data.message === 'Invalid tag provided.') {
      console.warn('Jupiter rejected the stocks tag; using the complete verified registry.');
      data = await jupiterGet('/tokens/v2/tag?query=verified');
      return normalizeVerifiedStocks(data);
    }
    return normalizeStocks(data);
  });
}
export function getPrices(ids: string[]) {
  const sorted = [...ids].sort();
  return cached(`prices:${sorted.join(',')}`, 15_000, async () => normalizePrices(await jupiterGet(`/price/v3?ids=${encodeURIComponent(sorted.join(','))}`), sorted));
}
export function apiError(error: unknown) {
  return Response.json({ error: error instanceof JupiterError ? error.message : 'Invalid response from Jupiter. Please retry.' }, { status: error instanceof JupiterError ? error.status : 502, headers: { 'Cache-Control': 'no-store' } });
}
