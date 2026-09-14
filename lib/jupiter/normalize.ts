import { isAddress } from '@solana/kit';
import type { StockAsset, StockRegistry, StockPrice } from '../../types/stock.ts';
export const MVP_SYMBOLS = ['NVDAx', 'METAx', 'GOOGLx', 'QQQx', 'SPYx'];
export function record(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function numeric(value: unknown): number | null { return typeof value === 'number' && Number.isFinite(value) ? value : null; }
export function normalizeStocks(data: unknown): StockRegistry {
  if (!Array.isArray(data)) throw new Error('Invalid token registry response');
  const stocks: StockAsset[] = [];
  const unavailable: StockRegistry['unavailable'] = [];
  for (const symbol of MVP_SYMBOLS) {
    const candidates = data.filter((t): t is Record<string, unknown> => record(t) && t.symbol === symbol && t.isVerified === true);
    const mints = [...new Set(candidates.map(t => t.id).filter((id): id is string => typeof id === 'string'))];
    if (mints.length > 1) {
      console.warn(`Ambiguous verified stock ${symbol}; candidate mints:`, mints);
      unavailable.push({ symbol, reason: 'ambiguous', candidateMints: mints });
      continue;
    }
    const t = candidates[0];
    if (!t || typeof t.id !== 'string' || !isAddress(t.id) || typeof t.name !== 'string' || typeof t.decimals !== 'number' || !Number.isInteger(t.decimals) || t.decimals < 0 || t.decimals > 255) {
      unavailable.push({ symbol, reason: 'unavailable' }); continue;
    }
    stocks.push({ mint: t.id, symbol, name: t.name, icon: typeof t.icon === 'string' ? t.icon : null, decimals: t.decimals, usdPrice: numeric(t.usdPrice), liquidity: numeric(t.liquidity), isVerified: true });
  }
  return { stocks, unavailable };
}
export function normalizePrices(data: unknown, ids: string[]): Record<string, StockPrice> {
  if (!record(data)) throw new Error('Invalid price response');
  return Object.fromEntries(ids.map(id => {
    const p = record(data[id]) ? data[id] : {};
    const price = numeric(p.usdPrice);
    const decimals = numeric(p.decimals);
    return [id, { usdPrice: price !== null && price > 0 ? price : null, liquidity: numeric(p.liquidity), priceChange24h: numeric(p.priceChange24h), decimals: decimals !== null && Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : null }];
  }));
}
