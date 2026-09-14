import 'server-only';
import { JupiterError } from './client';
import { record } from './normalize';

export async function swapRequest(path: 'order' | 'execute', params: URLSearchParams | object) {
  const key = process.env.JUPITER_API_KEY;
  if (!key) throw new JupiterError('Jupiter API is not configured.', 503);
  try {
    const response = await fetch(`https://api.jup.ag/swap/v2/${path}${path === 'order' ? `?${params}` : ''}`, {
      method: path === 'order' ? 'GET' : 'POST',
      headers: { 'x-api-key': key, ...(path === 'execute' ? { 'Content-Type': 'application/json' } : {}) },
      ...(path === 'execute' ? { body: JSON.stringify(params) } : {}),
      cache: 'no-store', signal: AbortSignal.timeout(path === 'execute' ? 65_000 : 15_000),
    });
    const data: unknown = await response.json();
    // Execute failure payloads can arrive with non-2xx responses; preserve the outcome.
    if (!response.ok && !(path === 'execute' && record(data) && data.status === 'Failed')) {
      const detail = record(data) && typeof data.error === 'string' ? data.error.slice(0, 400) : 'Jupiter request failed.';
      throw new JupiterError(response.status === 429 ? 'Jupiter rate limit reached. Please try again shortly.' : detail, response.status === 429 ? 429 : 502);
    }
    return data;
  } catch (error) {
    if (error instanceof JupiterError) throw error;
    throw new JupiterError(path === 'execute' ? 'Execution outcome is unknown. Check this submission before starting another purchase.' : 'Could not get a Jupiter order. Please try again.', 502);
  }
}
