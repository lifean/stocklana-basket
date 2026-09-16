import { address, signature } from '@solana/kit';
import type { AppClient } from './client';
import type { Basket } from '@/types/basket';
import type { PortfolioSnapshot } from '@/types/portfolio';
import type { StockPrice, StockRegistry } from '@/types/stock';
import { aggregateTokenAccounts, calculatePortfolio, TOKEN_PROGRAMS } from '../portfolio';
import { USDC_MINT } from '../amounts';

export async function loadPortfolio(client: AppClient, owner: string, basket: Basket | null, signatures: string[] = [], abortSignal?: AbortSignal): Promise<PortfolioSnapshot> {
  const signal = AbortSignal.any([AbortSignal.timeout(45_000), ...(abortSignal ? [abortSignal] : [])]);
  const genesis = await client.rpc.getGenesisHash().send({ abortSignal: signal });
  if (genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new Error('Configure a Solana mainnet RPC to read this portfolio.');
  let minContextSlot = 0n;
  if (signatures.length) {
    const result = await client.rpc.getSignatureStatuses(signatures.map(signature), { searchTransactionHistory: true }).send({ abortSignal: signal });
    for (const status of result.value) {
      if (!status || status.err || !['confirmed', 'finalized'].includes(status.confirmationStatus ?? '')) throw new Error('The RPC has not confirmed the completed swaps yet. Refresh to continue.');
      if (status.slot > minContextSlot) minContextSlot = status.slot;
    }
  }
  const [registryResponse, tesseraResponse, ...tokenResponses] = await Promise.all([
    fetch('/api/stocks', { cache: 'no-store', signal }),
    fetch('/api/tessera', { cache: 'no-store', signal }).catch(() => null),
    ...TOKEN_PROGRAMS.map(program => client.rpc.getTokenAccountsByOwner(address(owner), { programId: address(program) }, { encoding: 'jsonParsed', commitment: 'confirmed', minContextSlot }).send({ abortSignal: signal })),
  ]);
  const registry: StockRegistry = await registryResponse.json();
  if (!registryResponse.ok || !Array.isArray(registry.stocks) || !Array.isArray(registry.unavailable)) throw new Error('Could not load the verified stock registry. Please refresh.');
  // An independent provider outage must not disable the existing public-stock basket.
  const tessera: StockRegistry | null = tesseraResponse ? await tesseraResponse.json().catch(() => null) : null;
  const tesseraIssues = Array.isArray(tessera?.unavailable) ? tessera.unavailable : [{ symbol: 'T-OpenAI', provider: 'tessera' as const, reason: 'unavailable' as const, message: 'Tessera holdings may be missing: the product API is unavailable.' }, { symbol: 'T-Kalshi', provider: 'tessera' as const, reason: 'unavailable' as const }];
  registry.stocks.push(...(Array.isArray(tessera?.stocks) ? tessera.stocks : []));
  if (!basket || basket.provider === 'tessera') registry.unavailable.push(...tesseraIssues);
  else if (tesseraIssues.length) registry.warnings = ['Tessera assets are unresolved. Displayed totals cover resolved holdings only; Future Markets is unavailable.'];
  const balances = aggregateTokenAccounts(tokenResponses.flatMap(r => r.value), owner, registry.stocks);
  // Keep unrelated, unheld Tessera products out of a public-stock execution snapshot.
  // Its existing mint-change guard should only depend on held or targeted T-Tokens.
  registry.stocks = registry.stocks.filter(s => s.provider !== 'tessera' || (balances[s.mint] ?? 0n) > 0n || basket?.assets.some(a => a.provider === 'tessera' && a.symbol === s.symbol));
  const ids = [...registry.stocks.map(s => s.mint), USDC_MINT];
  const priceResponse = await fetch(`/api/prices?ids=${ids.join(',')}`, { cache: 'no-store', signal });
  // Holdings stay visible during price outages. A null price never becomes a zero valuation.
  const prices: Record<string, StockPrice> = priceResponse.ok ? await priceResponse.json() : {};
  const portfolio = calculatePortfolio(registry.stocks, balances, prices, basket);
  if (registry.unavailable.length) {
    portfolio.totalValue = null;
    portfolio.weightedChange24h = null;
    portfolio.positions.forEach(position => { position.currentWeightBps = null; position.driftBps = null; });
  }
  return { owner, registry, ...portfolio, usdcBalance: balances[USDC_MINT] ?? 0n, usdcPrice: prices[USDC_MINT]?.usdPrice ?? null, fetchedAt: Date.now() };
}
