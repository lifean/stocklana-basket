import type { Basket } from '../types/basket.ts';
export function validateBasket(basket: Basket): void {
  if (!basket.assets.length || basket.assets.some(a => !Number.isInteger(a.weightBps) || a.weightBps <= 0) || basket.assets.reduce((sum, a) => sum + a.weightBps, 0) !== 10_000) throw new Error(`Invalid allocations for ${basket.id}`);
}
export const baskets: Basket[] = [
  { id: 'ai-leaders', name: 'AI Leaders', description: 'Leading companies powering the AI economy.', emoji: '🚀', assets: [{ symbol: 'NVDAx', stockSymbol: 'NVDA', weightBps: 4000 }, { symbol: 'METAx', stockSymbol: 'META', weightBps: 2000 }, { symbol: 'GOOGLx', stockSymbol: 'GOOGL', weightBps: 2000 }, { symbol: 'QQQx', stockSymbol: 'QQQ', weightBps: 2000 }] },
  { id: 'us-growth', name: 'US Growth', description: 'A growth-focused mix of US technology and innovation.', emoji: '📈', assets: [{ symbol: 'QQQx', stockSymbol: 'QQQ', weightBps: 4000 }, { symbol: 'NVDAx', stockSymbol: 'NVDA', weightBps: 2500 }, { symbol: 'METAx', stockSymbol: 'META', weightBps: 2000 }, { symbol: 'GOOGLx', stockSymbol: 'GOOGL', weightBps: 1500 }] },
  { id: 'core-us', name: 'Core US', description: 'Broad US market exposure with a tilt toward technology.', emoji: '🏛️', assets: [{ symbol: 'SPYx', stockSymbol: 'SPY', weightBps: 6000 }, { symbol: 'QQQx', stockSymbol: 'QQQ', weightBps: 2500 }, { symbol: 'NVDAx', stockSymbol: 'NVDA', weightBps: 1500 }] },
];
baskets.forEach(validateBasket);
