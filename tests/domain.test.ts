import assert from 'node:assert/strict';
import test from 'node:test';
import { baskets, validateBasket } from '../lib/baskets.ts';
import { allocateUsdc, formatUsdc, parseUsdc, USDC_MINT } from '../lib/amounts.ts';
import { normalizeStocks, normalizePrices } from '../lib/jupiter/normalize.ts';

test('100 USDC allocates 40/20/20/20 to AI Leaders with no precision loss', () => {
  assert.equal(parseUsdc('100'), 100_000_000n);
  assert.deepEqual(allocateUsdc(parseUsdc('100'), baskets[0].assets).map(formatUsdc), ['40', '20', '20', '20']);
});
test('all presets sum to 10,000 bps; fractional weights are rejected', () => {
  baskets.forEach(validateBasket);
  assert.throws(() => validateBasket({ ...baskets[0], assets: [{ symbol: 'test', stockSymbol: 'test', weightBps: 9999.9 }] }));
});
test('allocations preserve atomic units even for small and uneven amounts', () => {
  for (const basket of baskets) for (const amount of [1n, 3n, 1000001n, 9999999999999999n]) {
    const allocations = allocateUsdc(amount, basket.assets);
    assert.equal(allocations.reduce((a, b) => a + b, 0n), amount);
    assert.ok(allocations.every(a => a >= 0n));
  }
});
test('amount parser rejects zero, negative, exponent, excessive precision and oversized input', () => {
  for (const value of ['', '0', '-1', '1e2', 'NaN', '0.0000001', '10000000000', '1,000']) assert.throws(() => parseUsdc(value));
  assert.equal(parseUsdc('0.000001'), 1n);
});
// Known real addresses used solely as synthetic metadata fixtures; never a stock mapping.
const fixture = { id: USDC_MINT, symbol: 'NVDAx', name: 'Test fixture', decimals: 6, isVerified: true, usdPrice: 123, icon: null, liquidity: 456 };
test('registry preserves metadata and excludes unverified/case-mismatched tokens', () => {
  const result = normalizeStocks([fixture, { ...fixture, symbol: 'METAx', isVerified: false }, { ...fixture, symbol: 'qqqx' }]);
  assert.deepEqual(result.stocks[0], { mint: USDC_MINT, symbol: 'NVDAx', name: 'Test fixture', decimals: 6, isVerified: true, usdPrice: 123, icon: null, liquidity: 456 });
  assert.equal(result.stocks.length, 1);
  assert.equal(result.unavailable.length, 4);
});
test('verified duplicate symbols fail closed and report every candidate mint', () => {
  const other = 'So11111111111111111111111111111111111111112';
  const result = normalizeStocks([fixture, { ...fixture, id: other }]);
  assert.equal(result.stocks.length, 0);
  assert.deepEqual(result.unavailable[0], { symbol: 'NVDAx', reason: 'ambiguous', candidateMints: [USDC_MINT, other] });
});
test('missing or invalid Jupiter prices remain null', () => {
  const result = normalizePrices({ [USDC_MINT]: { usdPrice: -2, decimals: 6 } }, [USDC_MINT, 'missing']);
  assert.equal(result[USDC_MINT].usdPrice, null);
  assert.equal(result[USDC_MINT].liquidity, null);
  assert.equal(result.missing.usdPrice, null);
});
