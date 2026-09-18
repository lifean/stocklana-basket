import test from 'node:test';
import assert from 'node:assert/strict';
import { assertBasketRegistryUnchanged, createBasketExecutionPlan } from '../lib/execution/basket.ts';
import { baskets } from '../lib/baskets.ts';
import { USDC_MINT } from '../lib/amounts.ts';
import { friendlyError, safeErrorDetail } from '../lib/errors.ts';
// Synthetic registry only for allocation validation, never imported by the app.
const registry = { unavailable: [], stocks: baskets[0].assets.map(a => ({ mint: USDC_MINT, symbol: a.symbol, name: 'Test fixture', icon: null, decimals: 6, usdPrice: null, liquidity: null, isVerified: true })) };
test('AI Leaders creates exactly four independent atomic execution legs', () => {
  const legs = createBasketExecutionPlan(baskets[0], 100_000_000n, registry);
  assert.deepEqual(legs.map(l => l.inputAmount), [40_000_000n, 20_000_000n, 20_000_000n, 20_000_000n]);
  assert.equal(new Set(legs.map(l => l.id)).size, 4);
  assert.ok(legs.every(l => l.status === 'idle' && !l.signature));
});
test('basket plan refuses missing, ambiguous and unfunded components', () => {
  assert.throws(() => createBasketExecutionPlan(baskets[0], 1n, registry));
  assert.throws(() => createBasketExecutionPlan(baskets[0], 100n, { ...registry, stocks: registry.stocks.slice(1) }));
  assert.throws(() => createBasketExecutionPlan(baskets[0], 100n, { ...registry, stocks: [...registry.stocks, registry.stocks[0]] }));
});
test('normal error UX hides raw provider detail and redacts service URLs', () => {
  assert.match(friendlyError('User rejected request'), /Wallet rejected/);
  assert.match(friendlyError('Insufficient SOL balance'), /Not enough SOL/);
  assert.match(friendlyError('Transaction blockhash expired'), /Quote expired/);
  assert.equal(safeErrorDetail('Failed https://rpc.example/?api-key=secret'), 'Failed [service URL]');
});

test('cached basket identities must still match fresh tradable mints and decimals', () => {
  const basket = baskets[0];
  assert.doesNotThrow(() => assertBasketRegistryUnchanged(basket, 100_000_000n, registry, structuredClone(registry)));
  for (const change of [{ mint: 'So11111111111111111111111111111111111111112' }, { decimals: 9 }, { isVerified: false }]) {
    const fresh = structuredClone(registry);
    Object.assign(fresh.stocks[0], change);
    assert.throws(() => assertBasketRegistryUnchanged(basket, 100_000_000n, registry, fresh));
  }
  assert.throws(() => assertBasketRegistryUnchanged(basket, 100_000_000n, registry, { ...registry, stocks: registry.stocks.slice(1) }));
  assert.throws(() => assertBasketRegistryUnchanged(basket, 100_000_000n, registry, { ...registry, unavailable: [{ symbol: 'NVDAx', reason: 'ambiguous' }] }));
});
