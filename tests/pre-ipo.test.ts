import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePremiumPercent, calculateBasketPremium, formatPremium, formatSignedPercent } from '../lib/pre-ipo.ts';
import { resolvePreIpoMetadata } from '../lib/tessera/normalize.ts';
import { baskets } from '../lib/baskets.ts';
import type { PreIpoAsset, PreIpoRegistry } from '../types/pre-ipo.ts';
import type { StockPrice } from '../types/stock.ts';
import { USDC_MINT } from '../lib/amounts.ts';

test('unified premium calculation and formatting handle invalid inputs and rounding', () => {
  assert.equal(calculatePremiumPercent(125,100),25);
  assert.equal(calculatePremiumPercent(75,100),-25);
  assert.equal(calculatePremiumPercent(0,100),-100);
  for(const bad of [null,undefined,NaN,Infinity,-1]) assert.equal(calculatePremiumPercent(bad,100),null);
  for(const bad of [null,undefined,NaN,Infinity,-1,0]) assert.equal(calculatePremiumPercent(100,bad),null);
  assert.equal(formatPremium(12.47),'+12.47% Premium');
  assert.equal(formatPremium(-3.42),'-3.42% Discount');
  assert.equal(formatPremium(0),'0.00% At Mark');
  assert.equal(formatPremium(-0.00001),'0.00% At Mark');
  assert.equal(formatPremium(null),'Unavailable');
  assert.equal(formatSignedPercent(Infinity),'Unavailable');
});
// Identifier is a real address used only in synthetic calculation fixtures, never a product mapping.
const asset = (symbol: string, provider: 'tessera'|'prestocks', marketPrice: number): PreIpoAsset => ({provider,symbol,name:symbol,mint:USDC_MINT,sector:null,holders:null,markPrice:100,marketPrice,markValuation:null});
test('Tessera weighted metric uses Jupiter prices, not a sponsor tokenPrice field', () => {
  const targets=baskets.find(b=>b.id==='future-markets')!.assets;
  const assets=targets.map(t=>asset(t.symbol,'tessera',900));
  const prices:Record<string,StockPrice>={[USDC_MINT]:{usdPrice:125,decimals:6,liquidity:null,priceChange24h:null}};
  assert.deepEqual(calculateBasketPremium(assets,targets,prices),{value:25,coveredBps:10000,excludedSymbols:[]});
  assert.deepEqual(calculateBasketPremium(assets,targets,{}),{value:null,coveredBps:0,excludedSymbols:['T-OpenAI','T-Kalshi']});
});
test('PreStocks weighted metric uses sponsor token prices and identifies excluded assets', () => {
  const targets=baskets.find(b=>b.id==='preipo-ai-leaders')!.assets;
  const assets=targets.map(t=>asset(t.symbol,'prestocks',125));
  assets[0].markPrice=null;
  const prices:Record<string,StockPrice>={[USDC_MINT]:{usdPrice:900,decimals:6,liquidity:null,priceChange24h:null}};
  assert.deepEqual(calculateBasketPremium(assets,targets,prices),{value:16.25,coveredBps:6500,excludedSymbols:['OPENAI']});
});
test('metadata resolution preserves original sponsor fetch timestamp even when decimals fail', () => {
  const products:PreIpoRegistry={assets:[asset('OPENAI','prestocks',125)],stocks:[],unavailable:[],fetchedAt:1700000000000};
  assert.equal(resolvePreIpoMetadata(products,null).fetchedAt,products.fetchedAt);
  assert.equal(resolvePreIpoMetadata(products,[{id:USDC_MINT,decimals:6}]).fetchedAt,products.fetchedAt);
});
