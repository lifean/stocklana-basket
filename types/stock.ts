import type { AssetProvider } from './basket';
import type { PreIpoAsset } from './pre-ipo';
export interface StockAsset { provider?: AssetProvider; preIpo?: PreIpoAsset; mint: string; symbol: string; name: string; icon: string | null; decimals: number; usdPrice: number | null; liquidity: number | null; isVerified: boolean; }
export interface StockIssue { symbol: string; provider?: AssetProvider; message?: string; reason: 'unavailable' | 'ambiguous'; candidateMints?: string[]; }
export interface StockRegistry { warnings?: string[]; stocks: StockAsset[]; unavailable: StockIssue[]; }
export interface StockPrice { usdPrice: number | null; liquidity: number | null; priceChange24h: number | null; decimals: number | null; }
