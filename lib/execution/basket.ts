import { isSupportedAsset } from '../assets.ts';
import { allocateUsdc, USDC_MINT } from '../amounts.ts';
import { validateBasket } from '../baskets.ts';
import type { Basket } from '../../types/basket.ts';
import type { ExecutionLeg } from '../../types/execution.ts';
import type { StockRegistry } from '../../types/stock.ts';
export function createBasketExecutionPlan(basket: Basket, amount: bigint, registry: StockRegistry): ExecutionLeg[] {
  validateBasket(basket);
  if (amount <= 0n) throw new Error('Investment must be positive.');
  const amounts = allocateUsdc(amount, basket.assets);
  return basket.assets.map((asset, i) => {
    const matches = registry.stocks.filter(s => s.symbol === asset.symbol && (s.provider ?? 'xstocks') === (asset.provider ?? 'xstocks') && isSupportedAsset(s));
    if (matches.length !== 1 || registry.unavailable.some(s => s.symbol === asset.symbol)) throw new Error(`${asset.symbol} is unavailable or ambiguous.`);
    if (amounts[i] <= 0n) throw new Error('Investment is too small to fund every asset.');
    return { id: `${basket.id}-${asset.symbol}`, inputMint: USDC_MINT, outputMint: matches[0].mint, inputSymbol: 'USDC', outputSymbol: asset.symbol, inputAmount: amounts[i], status: 'idle' };
  });
}

export function assertBasketRegistryUnchanged(basket: Basket, amount: bigint, reviewed: StockRegistry, fresh: StockRegistry): void {
  const before = createBasketExecutionPlan(basket, amount, reviewed);
  const after = createBasketExecutionPlan(basket, amount, fresh);
  for (let i = 0; i < before.length; i++) {
    const asset = basket.assets[i];
    const matches = (stock: StockRegistry['stocks'][number]) => stock.symbol === asset.symbol && (stock.provider ?? 'xstocks') === (asset.provider ?? 'xstocks');
    if (before[i].outputMint !== after[i].outputMint || reviewed.stocks.find(matches)!.decimals !== fresh.stocks.find(matches)!.decimals) {
      throw new Error('Basket token data changed. Refresh market data and review live quotes again.');
    }
  }
}
