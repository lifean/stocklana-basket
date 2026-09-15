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
    const matches = registry.stocks.filter(s => s.symbol === asset.symbol && s.isVerified);
    if (matches.length !== 1 || registry.unavailable.some(s => s.symbol === asset.symbol)) throw new Error(`${asset.symbol} is unavailable or ambiguous.`);
    if (amounts[i] <= 0n) throw new Error('Investment is too small to fund every asset.');
    return { id: `${basket.id}-${asset.symbol}`, inputMint: USDC_MINT, outputMint: matches[0].mint, inputSymbol: 'USDC', outputSymbol: asset.symbol, inputAmount: amounts[i], status: 'idle' };
  });
}
