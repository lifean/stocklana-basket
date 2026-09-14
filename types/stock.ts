export interface StockAsset { mint: string; symbol: string; name: string; icon: string | null; decimals: number; usdPrice: number | null; liquidity: number | null; isVerified: boolean; }
export interface StockIssue { symbol: string; reason: 'unavailable' | 'ambiguous'; candidateMints?: string[]; }
export interface StockRegistry { stocks: StockAsset[]; unavailable: StockIssue[]; }
export interface StockPrice { usdPrice: number | null; liquidity: number | null; priceChange24h: number | null; decimals: number | null; }
