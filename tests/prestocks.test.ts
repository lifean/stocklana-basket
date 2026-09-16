import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { normalizePreStocks, referenceGapPercent, weightedPremium } from '../lib/prestocks/normalize.ts';
import { resolvePreIpoMetadata } from '../lib/tessera/normalize.ts';
import { baskets, validateBasket } from '../lib/baskets.ts';
import { createBasketExecutionPlan } from '../lib/execution/basket.ts';
import { aggregateTokenAccounts, calculatePortfolio, TOKEN_PROGRAMS } from '../lib/portfolio.ts';
import { calculateRebalancePlan } from '../lib/rebalance.ts';
import { USDC_MINT } from '../lib/amounts.ts';
// Official API capture for tests only. Production always resolves the provider API.
const rows = JSON.parse(readFileSync(new URL('./fixtures/prestocks.json', import.meta.url), 'utf8'));
const products = normalizePreStocks(rows);
const metadata = products.assets.map(a => ({ id: a.mint, symbol: 'Different metadata label', decimals: 9, isVerified: true }));
const registry = resolvePreIpoMetadata(products, metadata);
const basket = baskets.find(b => b.id === 'preipo-ai-leaders')!;
test('PreStocks exact allowlist maps contract_address and keeps source fields separate', () => {
  assert.deepEqual(products.assets.map(a => a.symbol), ['OPENAI', 'ANTHROPIC', 'ANDURIL', 'FIGUREAI']);
  for (const asset of products.assets) {
    const original = rows.find((r: { symbol: string }) => r.symbol === asset.symbol);
    assert.equal(asset.provider, 'prestocks');assert.equal(asset.mint, original.contract_address);
    assert.equal(asset.markPrice, original.markPrice);assert.equal(asset.marketPrice, original.tokenPrice);
    assert.equal(asset.markValuation, original.markValuation);assert.equal(asset.impliedValuation, original.impliedValuation);
    assert.equal(asset.image, original.image);
  }
  assert.ok(registry.stocks.every(a => a.provider === 'prestocks' && a.decimals === 9 && a.usdPrice === null));
});
test('missing, duplicate, invalid and fuzzy-only symbols block all basket execution', () => {
  const first = rows.find((r: { symbol: string }) => r.symbol === 'OPENAI');
  for (const data of [[], rows.filter((r: { symbol: string }) => r.symbol !== 'OPENAI'), [...rows, first], rows.map((r: { symbol: string }) => r.symbol === 'OPENAI' ? { ...r, contract_address: 'invalid' } : r), rows.map((r: { symbol: string }) => r.symbol === 'OPENAI' ? { ...r, symbol: 'OpenAI' } : r)]) {
    const result = resolvePreIpoMetadata(normalizePreStocks(data), metadata);
    assert.ok(result.unavailable.length);assert.throws(() => createBasketExecutionPlan(basket, 100_000_000n, result));
  }
  assert.throws(() => normalizePreStocks({ error: 'Unavailable' }));
});
test('PreStocks decimals require an exact mint match and cannot be guessed', () => {
  for (const data of [null, [], metadata.map(m => ({ ...m, decimals: undefined })), metadata.map(m => ({ ...m, decimals: '9' })), metadata.map(m => ({ ...m, id: USDC_MINT })), [...metadata, metadata[0]]]) {
    const result = resolvePreIpoMetadata(products, data);
    assert.ok(result.unavailable.length);assert.equal(result.assets.length, 4);
    assert.throws(() => createBasketExecutionPlan(basket, 100n, result));
  }
});
test('provider response updates mint identity without symbol fallback', () => {
  const changed = rows.map((r: {symbol: string; contract_address: string}) => r.symbol === 'OPENAI' ? { ...r, contract_address: products.assets[1].mint } : r.symbol === 'ANTHROPIC' ? { ...r, contract_address: products.assets[0].mint } : r);
  const result = resolvePreIpoMetadata(normalizePreStocks(changed), metadata);
  assert.equal(result.stocks[0].mint, products.assets[1].mint);
});
test('missing sponsor analytics do not disable safely resolved trades', () => {
  const result = resolvePreIpoMetadata(normalizePreStocks(rows.map((r: object) => ({ ...r, markPrice: null, tokenPrice: undefined, markValuation: 'bad', impliedValuation: null }))), metadata);
  assert.equal(result.unavailable.length, 0);assert.equal(createBasketExecutionPlan(basket, 100_000_000n, result).length, 4);
  assert.ok(result.assets.every(a => a.markPrice === null && a.marketPrice === null && a.markValuation === null && a.impliedValuation === null));
});
test('premium and valuation gap handle positive, negative, zero and missing data', () => {
  assert.equal(referenceGapPercent(100, 125), 25);assert.equal(referenceGapPercent(100, 75), -25);
  assert.equal(referenceGapPercent(100, 0), -100);assert.equal(referenceGapPercent(100, 100), 0);
  for (const mark of [null, undefined, 0, -1, Infinity, NaN]) assert.equal(referenceGapPercent(mark, 100), null);
  assert.equal(referenceGapPercent(100, undefined), null);assert.equal(referenceGapPercent(100, Infinity), null);
});
test('weighted premium uses original bps and explicitly reports incomplete coverage', () => {
  const assets = products.assets.map(a => ({ ...a, markPrice: 100, marketPrice: 125 }));
  assert.deepEqual(weightedPremium(assets, basket.assets), { value: 25, coveredBps: 10000 });
  assets[0].marketPrice = NaN;
  assert.deepEqual(weightedPremium(assets, basket.assets), { value: 16.25, coveredBps: 6500 });
  assert.deepEqual(weightedPremium([], basket.assets), { value: null, coveredBps: 0 });
});
test('Pre-IPO AI Leaders preserves existing baskets and allocates 100 USDC as 35/30/20/15', () => {
  assert.equal(baskets.length, 5);assert.equal(baskets.filter(b => b.provider === 'prestocks').length, 1);validateBasket(basket);
  assert.deepEqual(baskets.slice(0,4).map(b => b.id), ['ai-leaders','us-growth','core-us','future-markets']);
  const legs=createBasketExecutionPlan(basket, 100_000_000n, registry);
  assert.deepEqual(legs.map(l=>l.inputAmount),[35_000_000n,30_000_000n,20_000_000n,15_000_000n]);
  assert.deepEqual(legs.map(l=>l.outputMint),products.assets.map(a=>a.mint));
});
test('shared portfolio and rebalance use chain amounts and Jupiter values, never sponsor tokenPrice', () => {
  const values=[45,30,15,10];
  const accounts=registry.stocks.map((s,i)=>({pubkey:s.mint,account:{owner:TOKEN_PROGRAMS[i%2],data:{parsed:{info:{owner:USDC_MINT,mint:s.mint,tokenAmount:{amount:String(BigInt(values[i])*1_000_000_000n),decimals:9}}}}}}));
  const balances=aggregateTokenAccounts(accounts,USDC_MINT,registry.stocks);
  const prices=Object.fromEntries(registry.stocks.map(s=>[s.mint,{usdPrice:1,decimals:9,liquidity:null,priceChange24h:null}]));
  const portfolio=calculatePortfolio(registry.stocks,balances,prices,basket);
  assert.equal(portfolio.totalValue,100);assert.deepEqual(portfolio.positions.map(p=>p.targetWeightBps),[3500,3000,2000,1500]);
  assert.ok(portfolio.positions.every(p=>p.provider==='prestocks'));
  const plan=calculateRebalancePlan({positions:portfolio.positions,basket,totalValue:portfolio.totalValue});
  assert.deepEqual(plan.errors,[]);assert.deepEqual(plan.trades.map(t=>t.side),['SELL','BUY','BUY']);
  assert.deepEqual(plan.trades.map(t=>t.inputAmount),[10_000_000_000n,5_000_000n,5_000_000n]);
  assert.equal(calculatePortfolio(registry.stocks,balances,{},basket).totalValue,null);
});
