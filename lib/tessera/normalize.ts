import { isAddress } from '@solana/kit';
import { record } from '../jupiter/normalize.ts';
import { USDC_MINT } from '../amounts.ts';
import type { TesseraRegistry, PreIpoRegistry } from '../../types/pre-ipo.ts';
export const TESSERA_SYMBOLS = ['T-OpenAI', 'T-Kalshi'] as const;
// Accept numeric API fields or plain decimal strings, never empty strings/booleans.
function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function premiumPercent(mark: number | null, market: number | null): number | null {
  if (mark === null || market === null || !Number.isFinite(mark) || !Number.isFinite(market) || mark <= 0 || market <= 0) return null;
  const result = (market / mark - 1) * 100;
  return Number.isFinite(result) ? result : null;
}
export function normalizeTessera(data: unknown): TesseraRegistry {
  const rows = Array.isArray(data) ? data : record(data) && Array.isArray(data.data) ? data.data : null;
  if (!rows) throw new Error('Tessera returned an invalid product response.');
  const result: TesseraRegistry = { assets: [], stocks: [], unavailable: [] };
  for (const symbol of TESSERA_SYMBOLS) {
    const candidates = rows.filter((row): row is Record<string, unknown> => record(row) && row.symbol === symbol);
    if (candidates.length > 1) {
      const candidateMints = candidates.map(r => r.mint).filter((m): m is string => typeof m === 'string');
      console.warn(`Ambiguous Tessera asset ${symbol}; candidate mints:`, candidateMints);
      result.unavailable.push({ symbol, provider: 'tessera', reason: 'ambiguous', candidateMints, message: `${symbol} has conflicting Tessera records. Trading is unavailable.` }); continue;
    }
    const row = candidates[0];
    if (!row || typeof row.mint !== 'string' || !isAddress(row.mint) || row.mint === USDC_MINT || typeof row.name !== 'string' || !row.name.trim()) {
      result.unavailable.push({ symbol, provider: 'tessera', reason: 'unavailable', message: `${symbol} is missing or has invalid Tessera mint metadata.` }); continue;
    }
    // A mint cannot represent two products, including products outside our allowlist.
    if (rows.filter(r => record(r) && r.mint === row.mint).length !== 1) {
      result.unavailable.push({ symbol, provider: 'tessera', reason: 'ambiguous', message: `${symbol} shares a mint with another Tessera record.` }); continue;
    }
    result.assets.push({ provider: 'tessera', name: row.name, symbol, mint: row.mint, sector: typeof row.sector === 'string' ? row.sector : null, markPrice: numeric(row.markPrice), markValuation: numeric(row.markValuation), holders: numeric(row.holders) });
  }
  return result;
}
export function resolvePreIpoMetadata(products: PreIpoRegistry, metadata: unknown): PreIpoRegistry {
  const result: PreIpoRegistry = { assets: products.assets, stocks: [], unavailable: [...products.unavailable] };
  for (const asset of products.assets) {
    const matches = Array.isArray(metadata) ? metadata.filter((m): m is Record<string, unknown> => record(m) && m.id === asset.mint) : [];
    const token = matches[0];
    if (matches.length !== 1 || !token || typeof token.decimals !== 'number' || !Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 255) {
      result.unavailable.push({ symbol: asset.symbol, provider: asset.provider, reason: 'unavailable', message: `${asset.symbol} token metadata or decimals are unavailable. Trading is disabled.` }); continue;
    }
    // The official provider establishes identity by mint; isVerified retains Jupiter's actual flag.
    result.stocks.push({ provider: asset.provider, preIpo: asset, mint: asset.mint, symbol: asset.symbol, name: asset.name, decimals: token.decimals, icon: typeof token.icon === 'string' ? token.icon : null, usdPrice: null, liquidity: numeric(token.liquidity), isVerified: token.isVerified === true });
  }
  return result;
}

export function resolveTesseraMetadata(products: TesseraRegistry, metadata: unknown): TesseraRegistry {
  return resolvePreIpoMetadata(products, metadata);
}
