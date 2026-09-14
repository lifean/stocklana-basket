export interface BasketAsset { symbol: string; stockSymbol: string; weightBps: number; }
export interface Basket { id: string; name: string; description: string; emoji: string; assets: BasketAsset[]; }
