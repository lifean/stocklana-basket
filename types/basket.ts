export type AssetProvider = 'xstocks' | 'tessera' | 'prestocks';
export interface BasketAsset { symbol: string; displaySymbol?: string; stockSymbol: string; provider?: AssetProvider; weightBps: number; }
export interface Basket { id: string; name: string; description: string; emoji: string; provider?: AssetProvider; assets: BasketAsset[]; }
