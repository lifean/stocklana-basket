import { calculatePremiumPercent, calculateBasketPremium } from '../pre-ipo.ts';
import { isAddress } from '@solana/kit';
import { record } from '../jupiter/normalize.ts';
import { USDC_MINT } from '../amounts.ts';
import type { PreIpoAsset, PreIpoRegistry } from '../../types/pre-ipo.ts';
import type { BasketAsset } from '../../types/basket.ts';
export const PRESTOCKS_SYMBOLS = ['OPENAI', 'ANTHROPIC', 'ANDURIL', 'FIGUREAI'] as const;
function numeric(value: unknown): number | null {
  if (typeof value !== 'number' && !(typeof value === 'string' && /^\d+(\.\d+)?$/.test(value))) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}
function httpsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { return new URL(value).protocol === 'https:' ? value : null; } catch { return null; }
}
export function normalizePreStocks(data: unknown): PreIpoRegistry {
  if (!Array.isArray(data)) throw new Error('PreStocks returned an invalid product response.');
  const result: PreIpoRegistry = { assets: [], stocks: [], unavailable: [] };
  for (const symbol of PRESTOCKS_SYMBOLS) {
    const candidates = data.filter((row): row is Record<string, unknown> => record(row) && row.symbol === symbol);
    if (candidates.length > 1) {
      const candidateMints = candidates.map(r => r.contract_address).filter((m): m is string => typeof m === 'string');
      console.warn(`Ambiguous PreStocks asset ${symbol}; candidate mints:`, candidateMints);
      result.unavailable.push({ provider: 'prestocks', symbol, reason: 'ambiguous', candidateMints, message: `${symbol} has duplicate PreStocks records. Trading is disabled.` }); continue;
    }
    const row = candidates[0];
    if (!row || typeof row.contract_address !== 'string' || !isAddress(row.contract_address) || row.contract_address === USDC_MINT || typeof row.name !== 'string' || !row.name.trim()) {
      result.unavailable.push({ provider: 'prestocks', symbol, reason: 'unavailable', message: `${symbol} is missing or has an invalid PreStocks contract address.` }); continue;
    }
    if (data.filter(r => record(r) && r.contract_address === row.contract_address).length !== 1) {
      result.unavailable.push({ provider: 'prestocks', symbol, reason: 'ambiguous', message: `${symbol} shares a contract address with another PreStocks product.` }); continue;
    }
    result.assets.push({ provider: 'prestocks', name: row.name, symbol, mint: row.contract_address, sector: null, holders: null, markPrice: numeric(row.markPrice), marketPrice: numeric(row.tokenPrice), markValuation: numeric(row.markValuation), impliedValuation: numeric(row.impliedValuation), image: httpsUrl(row.image), externalUrl: httpsUrl(row.external_url), supply: numeric(row.supply) });
  }
  return result;
}
// Sponsor analytics only; these values never size a swap or value onchain holdings.
export function referenceGapPercent(mark: number | null | undefined, implied: number | null | undefined): number | null {
  return calculatePremiumPercent(implied, mark);
}
export function weightedPremium(assets: PreIpoAsset[], targets: BasketAsset[]) {
  const { value, coveredBps } = calculateBasketPremium(assets, targets);
  return { value, coveredBps };
}
