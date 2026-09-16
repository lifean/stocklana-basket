import { isSupportedAsset } from './assets.ts';
import type { Basket } from '../types/basket.ts';
import type { PortfolioPosition } from '../types/portfolio.ts';
import type { StockAsset, StockPrice } from '../types/stock.ts';
import { USDC_MINT } from './amounts.ts';
import { record } from './jupiter/normalize.ts';

// Original SPL Token and Token-2022 program IDs, not token mint addresses.
export const TOKEN_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
] as const;
export function aggregateTokenAccounts(accounts: readonly unknown[], owner: string, stocks: StockAsset[]): Record<string, bigint> {
  const allowed = new Map(stocks.filter(isSupportedAsset).map(s => [s.mint, s.decimals]));
  allowed.set(USDC_MINT, 6);
  const balances: Record<string, bigint> = {};
  const seen = new Set<string>();
  for (const entry of accounts) {
    if (!record(entry) || typeof entry.pubkey !== 'string' || !record(entry.account)) throw new Error('Invalid token account response.');
    const account = entry.account;
    if (!TOKEN_PROGRAMS.some(p => p === account.owner)) throw new Error('Unexpected token program.');
    if (seen.has(entry.pubkey)) continue;
    seen.add(entry.pubkey);
    const data = entry.account.data;
    if (!record(data) || !record(data.parsed) || !record(data.parsed.info)) throw new Error('RPC could not parse a token account. Holdings may be incomplete.');
    const info = data.parsed.info;
    if (typeof info.mint !== 'string' || !allowed.has(info.mint)) continue;
    if (info.owner !== owner || !record(info.tokenAmount)) throw new Error('Token account owner mismatch.');
    const { amount, decimals } = info.tokenAmount;
    if (Number(decimals) !== allowed.get(info.mint) || typeof amount !== 'string' || !/^\d+$/.test(amount)) throw new Error('Token decimals or balance do not match verified metadata.');
    balances[info.mint] = (balances[info.mint] ?? 0n) + BigInt(amount);
  }
  return balances;
}
// Round to basis points, then correct the largest rounding errors to total 10,000.
export function portfolioWeights(values: number[]): number[] {
  if (values.some(v => !Number.isFinite(v) || v < 0)) throw new Error('Invalid position value.');
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values.map(() => 0);
  const raw = values.map(v => v / total * 10_000);
  const weights = raw.map(Math.round);
  let difference = 10_000 - weights.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, error: v - weights[i] })).sort((a, b) => difference > 0 ? b.error - a.error || a.i - b.i : a.error - b.error || a.i - b.i);
  for (let i = 0; difference !== 0; i++) {
    const step = Math.sign(difference);
    weights[order[i % order.length].i] += step; difference -= step;
  }
  return weights;
}
export function calculatePortfolio(stocks: StockAsset[], balances: Record<string, bigint>, prices: Record<string, StockPrice>, basket: Basket | null) {
  const positions: PortfolioPosition[] = stocks.filter(isSupportedAsset)
    .filter(s => (balances[s.mint] ?? 0n) > 0n || basket?.assets.some(a => a.symbol === s.symbol))
    .map(stock => {
      const tokenAmount = balances[stock.mint] ?? 0n;
      const uiAmount = Number(tokenAmount) / 10 ** stock.decimals;
      const p = prices[stock.mint];
      const price = p?.usdPrice != null && Number.isFinite(p.usdPrice) && p.usdPrice > 0 ? p.usdPrice : null;
      const value = price === null ? null : uiAmount * price;
      return { provider: stock.provider ?? 'xstocks', mint: stock.mint, symbol: stock.symbol, decimals: stock.decimals, tokenAmount, uiAmount, price,
        valueUsd: tokenAmount === 0n ? 0 : value !== null && Number.isFinite(value) ? value : null,
        currentWeightBps: null, targetWeightBps: basket ? basket.assets.find(a => a.symbol === stock.symbol)?.weightBps ?? 0 : null,
        driftBps: null, priceChange24h: p?.priceChange24h ?? null, liquidity: p?.liquidity ?? null };
    });
  const complete = positions.every(p => p.valueUsd !== null);
  const pricedValue = positions.reduce((sum, p) => sum + (p.valueUsd ?? 0), 0);
  const totalValue = complete ? pricedValue : null;
  const weights = complete ? portfolioWeights(positions.map(p => p.valueUsd!)) : null;
  positions.forEach((p, i) => { p.currentWeightBps = weights?.[i] ?? null; p.driftBps = p.currentWeightBps !== null && p.targetWeightBps !== null ? p.currentWeightBps - p.targetWeightBps : null; });
  const changesComplete = positions.filter(p => p.tokenAmount > 0n).every(p => p.priceChange24h !== null && Number.isFinite(p.priceChange24h));
  const weightedChange24h = totalValue && changesComplete ? positions.reduce((sum, p) => sum + (p.valueUsd! / totalValue) * (p.priceChange24h ?? 0), 0) : null;
  return { positions, totalValue, pricedValue, weightedChange24h };
}
