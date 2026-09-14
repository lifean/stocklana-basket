import type { Basket } from '../types/basket.ts';
import type { PortfolioPosition } from '../types/portfolio.ts';
import { validateBasket } from './baskets.ts';
import { USDC_MINT } from './amounts.ts';
export const REBALANCE_THRESHOLD_BPS = 100;
export const MIN_TRADE_USD = 1;
export interface RebalanceTrade {
  side: 'SELL' | 'BUY'; symbol: string; mint: string; inputMint: string; outputMint: string;
  inputSymbol: string; outputSymbol: string; inputAmount: bigint; valueUsd: number;
  currentWeightBps: number; targetWeightBps: number;
}
export interface RebalancePlan { trades: RebalanceTrade[]; errors: string[]; }
// Convert decimal USD calculations to exact rational arithmetic before producing token units.
function decimalRatio(value: number): [bigint, bigint] {
  if (!Number.isFinite(value) || value < 0) throw new Error('Invalid USD value.');
  const [mantissa, exponent = '0'] = value.toString().toLowerCase().split('e');
  const [whole, fraction = ''] = mantissa.split('.');
  const power = Number(exponent) - fraction.length;
  const numerator = BigInt(whole + fraction);
  return power >= 0 ? [numerator * 10n ** BigInt(power), 1n] : [numerator, 10n ** BigInt(-power)];
}
export function usdToAtomicDown(usd: number, price: number, decimals: number): bigint {
  if (!(price > 0) || !Number.isInteger(decimals) || decimals < 0 || decimals > 255) throw new Error('Price or token decimals unavailable.');
  const [u, ud] = decimalRatio(usd);
  const [p, pd] = decimalRatio(price);
  return u * pd * 10n ** BigInt(decimals) / (ud * p);
}
export function calculateRebalancePlan({ positions, basket, totalValue, usdcPrice = 1 }: { positions: PortfolioPosition[]; basket: Basket | null; totalValue: number | null; usdcPrice?: number | null }): RebalancePlan {
  if (!basket) return { trades: [], errors: ['No active basket. Select a preset strategy to enable rebalance.'] };
  validateBasket(basket);
  const errors: string[] = [];
  if (totalValue === null || !Number.isFinite(totalValue) || totalValue < 0) errors.push('The portfolio cannot be fully valued. Refresh missing prices.');
  if (!usdcPrice || !Number.isFinite(usdcPrice) || usdcPrice <= 0) errors.push('USDC price is unavailable.');
  if (new Set(positions.map(p => p.symbol)).size !== positions.length || new Set(positions.map(p => p.mint)).size !== positions.length) errors.push('Portfolio contains ambiguous positions.');
  for (const asset of basket.assets) if (!positions.some(p => p.symbol === asset.symbol)) errors.push(`${asset.symbol} is unresolved.`);
  for (const p of positions) if ((p.tokenAmount > 0n || basket.assets.some(a => a.symbol === p.symbol)) && (p.price === null || !Number.isFinite(p.price) || p.price <= 0 || p.valueUsd === null || !Number.isFinite(p.valueUsd) || p.valueUsd < 0)) errors.push(`${p.symbol} price is unavailable.`);
  if (errors.length || !totalValue) return { trades: [], errors };
  const trades: RebalanceTrade[] = [];
  for (const p of positions) {
    const targetWeightBps = basket.assets.find(a => a.symbol === p.symbol)?.weightBps ?? 0;
    const currentWeightBps = Math.round(p.valueUsd! / totalValue * 10_000);
    const delta = totalValue * targetWeightBps / 10_000 - p.valueUsd!;
    if (Math.abs(currentWeightBps - targetWeightBps) < REBALANCE_THRESHOLD_BPS || Math.abs(delta) < MIN_TRADE_USD) continue;
    const side = delta < 0 ? 'SELL' : 'BUY';
    let inputAmount = usdToAtomicDown(Math.abs(delta), side === 'SELL' ? p.price! : usdcPrice!, side === 'SELL' ? p.decimals : 6);
    if (side === 'SELL' && inputAmount > p.tokenAmount) inputAmount = p.tokenAmount;
    const valueUsd = Number(inputAmount) / 10 ** (side === 'SELL' ? p.decimals : 6) * (side === 'SELL' ? p.price! : usdcPrice!);
    if (!inputAmount || valueUsd < MIN_TRADE_USD || inputAmount > 18_446_744_073_709_551_615n) continue;
    trades.push({ side, symbol: p.symbol, mint: p.mint, inputMint: side === 'SELL' ? p.mint : USDC_MINT, outputMint: side === 'SELL' ? USDC_MINT : p.mint, inputSymbol: side === 'SELL' ? p.symbol : 'USDC', outputSymbol: side === 'SELL' ? 'USDC' : p.symbol, inputAmount, valueUsd, currentWeightBps, targetWeightBps });
  }
  return { trades, errors };
}
export function fundBuyTrades(trades: RebalanceTrade[], budget: bigint, usdcPrice: number): RebalanceTrade[] {
  if (budget <= 0n || !Number.isFinite(usdcPrice) || usdcPrice <= 0) return [];
  const buys = trades.filter(t => t.side === 'BUY');
  const required = buys.reduce((sum, t) => sum + t.inputAmount, 0n);
  if (required <= budget) return buys;
  // Scale every deficit fairly to actual proceeds; leftover atomic units remain USDC.
  return buys.map(t => {
    const inputAmount = t.inputAmount * budget / required;
    return { ...t, inputAmount, valueUsd: Number(inputAmount) / 1_000_000 * usdcPrice };
  }).filter(t => t.inputAmount > 0n && t.valueUsd >= MIN_TRADE_USD);
}
