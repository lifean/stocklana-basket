import type { StockRegistry } from './stock';
export interface PortfolioPosition {
  mint: string;
  symbol: string;
  decimals: number;
  tokenAmount: bigint;
  uiAmount: number;
  price: number | null;
  valueUsd: number | null;
  currentWeightBps: number | null;
  targetWeightBps: number | null;
  driftBps: number | null;
  priceChange24h: number | null;
  liquidity: number | null;
}
export interface PortfolioSnapshot {
  owner: string;
  registry: StockRegistry;
  positions: PortfolioPosition[];
  totalValue: number | null;
  pricedValue: number;
  weightedChange24h: number | null;
  usdcBalance: bigint;
  usdcPrice: number | null;
  fetchedAt: number;
}
