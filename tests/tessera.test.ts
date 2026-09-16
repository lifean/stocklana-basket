import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeTessera, resolveTesseraMetadata, premiumPercent } from '../lib/tessera/normalize.ts';
import { createBasketExecutionPlan } from '../lib/execution/basket.ts';
import { baskets, validateBasket } from '../lib/baskets.ts';
import { aggregateTokenAccounts, calculatePortfolio, TOKEN_PROGRAMS } from '../lib/portfolio.ts';
import { calculateRebalancePlan } from '../lib/rebalance.ts';
import { USDC_MINT } from '../lib/amounts.ts';
// Captured Tessera response supplied by the user. Test fixture only, never a runtime fallback.
const products = [
  { id: 'T-OpenAI', name: 'T-OpenAI', symbol: 'T-OpenAI', code: 'tOpenAI', sector: 'Artificial Intelligence', mint: 'oPAiAikWTaFj9RYoRFD35ccfwhnMcB3ThgBZRHSkjTZ', markPrice: 812.79, holders: 8259, markValuation: 950000000000 },
  { id: 'T-Kalshi', name: 'T-Kalshi', symbol: 'T-Kalshi', code: 'tKalshi', sector: 'Prediction Markets', mint: 'TKLSidmLVt3cqGaaodG8tyRzoANfQwoh67AccjmubeZ', markPrice: 413.8, holders: 2605, markValuation: 14000000000 },
  { symbol: 'T-SpaceX', mint: 'TSPXcLV76s6V2zDiZQ18kBfcbnjaE2ZzNT3ga2Pd99v' },
];
const metadata = products.slice(0, 2).map(p => ({ id: p.mint, symbol: p.code, decimals: 9, isVerified: true }));
const registry = resolveTesseraMetadata(normalizeTessera(products), metadata);
const basket = baskets.find(b => b.id === 'future-markets')!;
test('Tessera maps only OpenAI/Kalshi and preserves mark values separately', () => {
  assert.equal(registry.assets.length, 2);
  assert.deepEqual(registry.assets[0], { provider: 'tessera', name: 'T-OpenAI', symbol: 'T-OpenAI', mint: products[0].mint, sector: 'Artificial Intelligence', markPrice: 812.79, markValuation: 950000000000, holders: 8259 });
  assert.equal(registry.stocks[0].usdPrice, null);
  assert.equal(registry.stocks[0].decimals, 9);
  assert.equal(registry.stocks[0].symbol, 'T-OpenAI');
});
test('mint identity comes from each response, not captured constants or Jupiter symbols', () => {
  const changed = products.slice(0, 2).map((p, i) => ({ ...p, mint: products[1 - i].mint }));
  const result = resolveTesseraMetadata(normalizeTessera(changed), metadata);
  assert.equal(result.stocks[0].mint, products[1].mint);
  assert.equal(result.stocks[0].symbol, 'T-OpenAI');
});
test('Tessera missing products, invalid mints and duplicates fail closed', () => {
  for (const rows of [[], [products[0]], [{ ...products[0], mint: 'invalid' }, products[1]], [...products, products[0]], [{ ...products[0], mint: products[1].mint }, products[1]]]) {
    const resolved = resolveTesseraMetadata(normalizeTessera(rows), metadata);
    assert.ok(resolved.unavailable.length > 0);
    assert.throws(() => createBasketExecutionPlan(basket, 100_000_000n, resolved));
  }
  assert.throws(() => normalizeTessera({ statusCode: 500, message: 'Internal server error' }));
});
test('decimals require one exact mint metadata match; never inferred from marks or symbols', () => {
  for (const rows of [null, [], [{ ...metadata[0], id: USDC_MINT }], metadata.map(m => ({ ...m, decimals: undefined })), metadata.map(m => ({ ...m, decimals: '9' })), [...metadata, metadata[0]]]) {
    const resolved = resolveTesseraMetadata(normalizeTessera(products), rows);
    assert.ok(resolved.unavailable.length);
    assert.equal(resolved.assets.length, 2);
  }
});
test('missing Tessera reference fields stay null; premium handles missing/invalid prices', () => {
  const result = normalizeTessera([{ symbol: 'T-OpenAI', name: 'T-OpenAI', mint: products[0].mint }]);
  assert.equal(result.assets[0].markPrice, null);
  assert.equal(result.assets[0].holders, null);
  assert.equal(premiumPercent(null, 100), null);
  assert.equal(premiumPercent(0, 100), null);
  assert.equal(premiumPercent(100, NaN), null);
  assert.equal(premiumPercent(100, null), null);
  assert.ok(Math.abs(premiumPercent(100, 110)! - 10) < 1e-10);
  assert.ok(Math.abs(premiumPercent(100, 90)! + 10) < 1e-10);
});
test('Future Markets remains the sole Tessera basket with 60/40 mint-based legs', () => {
  assert.equal(baskets.filter(b => b.provider === 'tessera').length, 1);
  assert.deepEqual(baskets.slice(0, 3).map(b => b.id), ['ai-leaders', 'us-growth', 'core-us']);
  validateBasket(basket);
  const legs = createBasketExecutionPlan(basket, 100_000_000n, registry);
  assert.deepEqual(legs.map(l => l.inputAmount), [60_000_000n, 40_000_000n]);
  assert.deepEqual(legs.map(l => l.outputMint), products.slice(0, 2).map(p => p.mint));
  assert.ok(legs.every(l => l.inputMint === USDC_MINT && l.status === 'idle'));
});
test('shared portfolio reads Tessera token accounts and values only Jupiter prices', () => {
  const accounts = registry.stocks.map((s, i) => ({ pubkey: s.mint, account: { owner: TOKEN_PROGRAMS[i], data: { parsed: { info: { owner: USDC_MINT, mint: s.mint, tokenAmount: { amount: String((i ? 30n : 70n) * 1_000_000_000n), decimals: 9 } } } } } }));
  const balances = aggregateTokenAccounts(accounts, USDC_MINT, registry.stocks);
  const prices = Object.fromEntries(registry.stocks.map(s => [s.mint, { usdPrice: 1, liquidity: null, priceChange24h: null, decimals: 9 }]));
  const portfolio = calculatePortfolio(registry.stocks, balances, prices, basket);
  assert.equal(portfolio.totalValue, 100);
  assert.deepEqual(portfolio.positions.map(p => p.provider), ['tessera', 'tessera']);
  assert.deepEqual(portfolio.positions.map(p => p.currentWeightBps), [7000, 3000]);
  assert.deepEqual(portfolio.positions.map(p => p.targetWeightBps), [6000, 4000]);
  assert.deepEqual(portfolio.positions.map(p => p.driftBps), [1000, -1000]);
  const plan = calculateRebalancePlan({ positions: portfolio.positions, basket, totalValue: portfolio.totalValue });
  assert.deepEqual(plan.errors, []);
  assert.deepEqual(plan.trades.map(t => t.side), ['SELL', 'BUY']);
  assert.deepEqual(plan.trades.map(t => t.inputAmount), [10_000_000_000n, 10_000_000n]);
  assert.equal(calculatePortfolio(registry.stocks, balances, {}, basket).totalValue, null);
});
