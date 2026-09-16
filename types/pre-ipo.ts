import type { StockRegistry } from './stock';
export interface PreIpoAsset {
  provider: 'tessera' | 'prestocks';
  name: string;
  symbol: string;
  mint: string;
  sector: string | null;
  markPrice: number | null;
  marketPrice?: number | null;
  markValuation: number | null;
  impliedValuation?: number | null;
  holders: number | null;
  image?: string | null;
}
export interface TesseraRegistry extends StockRegistry { assets: PreIpoAsset[]; }
