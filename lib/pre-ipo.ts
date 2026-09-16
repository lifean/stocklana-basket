import type { BasketAsset } from '../types/basket.ts';
import type { PreIpoAsset } from '../types/pre-ipo.ts';
import type { StockPrice } from '../types/stock.ts';
export function calculatePremiumPercent(marketPrice: number | null | undefined, markPrice: number | null | undefined): number | null {
  if (marketPrice == null || markPrice == null || !Number.isFinite(marketPrice) || !Number.isFinite(markPrice) || marketPrice < 0 || markPrice <= 0) return null;
  const premium = (marketPrice / markPrice - 1) * 100;
  return Number.isFinite(premium) ? premium : null;
}
export function formatSignedPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return 'Unavailable';
  if (Math.abs(value) < 0.005) return '0.00%';
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
}
export function formatPremium(value: number | null): string {
  const formatted = formatSignedPercent(value);
  if (formatted === 'Unavailable') return formatted;
  return `${formatted} ${formatted === '0.00%' ? 'At Mark' : value! > 0 ? 'Premium' : 'Discount'}`;
}
export function calculateBasketPremium(assets: PreIpoAsset[], targets: BasketAsset[], prices: Record<string, StockPrice> = {}) {
  let value = 0; let coveredBps = 0;
  const excludedSymbols: string[] = [];
  for (const target of targets) {
    const matches = assets.filter(a => a.provider === target.provider && a.symbol === target.symbol);
    const asset = matches.length === 1 ? matches[0] : null;
    const market = asset?.provider === 'tessera' ? prices[asset.mint]?.usdPrice : asset?.marketPrice;
    const premium = asset ? calculatePremiumPercent(market, asset.markPrice) : null;
    if (premium === null) { excludedSymbols.push(target.symbol); continue; }
    value += premium * target.weightBps / 10_000; coveredBps += target.weightBps;
  }
  return { value: coveredBps && Number.isFinite(value) ? value : null, coveredBps, excludedSymbols };
}
