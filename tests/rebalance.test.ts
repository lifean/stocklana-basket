import test from 'node:test';
import assert from 'node:assert/strict';
import { getBase58Decoder } from '@solana/kit';
import { baskets } from '../lib/baskets.ts';
import { USDC_MINT } from '../lib/amounts.ts';
import { aggregateTokenAccounts, calculatePortfolio, portfolioWeights, TOKEN_PROGRAMS } from '../lib/portfolio.ts';
import { calculateRebalancePlan, fundBuyTrades, usdToAtomicDown } from '../lib/rebalance.ts';
import { RebalanceController } from '../lib/execution/rebalance.ts';
import type { PortfolioSnapshot } from '../types/portfolio.ts';
import type { StockAsset, StockPrice } from '../types/stock.ts';
import type { ExecutionLeg } from '../types/execution.ts';

// Known addresses used as synthetic test metadata only; no production fixture prices or wallets.
const owner = USDC_MINT;
const mints = ['Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', 'Xsa62P5mvPszXL1krVUnU5ar38bBSVcWAB6fmPCo5Zu', 'XsCPL9dNWBMvFtTmwcCA5v3xWPSMEBCszbQdiLLq6aN', 'Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ'];
const basket = baskets[0];
const stocks: StockAsset[] = basket.assets.map((a, i) => ({ mint: mints[i], symbol: a.symbol, name: 'Unit fixture', decimals: 6, icon: null, usdPrice: null, liquidity: null, isVerified: true }));
const prices: Record<string, StockPrice> = Object.fromEntries(mints.map(m => [m, { usdPrice: 1, decimals: 6, liquidity: 100, priceChange24h: 2 }]));
function snapshot(values = [43, 18, 21, 18], cash = 100_000_000n): PortfolioSnapshot {
  const balances = Object.fromEntries(mints.map((m, i) => [m, BigInt(Math.round(values[i] * 1e6))]));
  return { owner, registry: { stocks, unavailable: [] }, ...calculatePortfolio(stocks, balances, prices, basket), usdcBalance: cash, usdcPrice: 1, fetchedAt: Date.now() };
}
const planFor = (s: PortfolioSnapshot) => calculateRebalancePlan({ positions: s.positions, basket, totalValue: s.totalValue, usdcPrice: s.usdcPrice });
test('perfectly balanced portfolio creates no trades', () => assert.deepEqual(planFor(snapshot([40, 20, 20, 20])).trades, []));
test('overweight positions sell and underweight positions buy exact atomic amounts', () => {
  const trades = planFor(snapshot()).trades;
  assert.deepEqual(trades.map(t => [t.side, t.symbol, t.inputAmount]), [['SELL', 'NVDAx', 3_000_000n], ['BUY', 'METAx', 2_000_000n], ['SELL', 'GOOGLx', 1_000_000n], ['BUY', 'QQQx', 2_000_000n]]);
});
test('drift below 100 bps is ignored', () => assert.equal(planFor(snapshot([40.5, 19.5, 20, 20])).trades.length, 0));
test('trades below $1 are ignored even above the drift threshold', () => assert.equal(planFor(snapshot([4.3, 1.8, 2.1, 1.8])).trades.length, 0));
test('rounded portfolio weights sum to 10000 and invalid target weights are rejected', () => {
  assert.equal(portfolioWeights([1, 1, 1]).reduce((a, b) => a + b, 0), 10000);
  assert.equal(snapshot().positions.reduce((sum, p) => sum + p.currentWeightBps!, 0), 10000);
  assert.throws(() => calculateRebalancePlan({ positions: snapshot().positions, basket: { ...basket, assets: [{ ...basket.assets[0], weightBps: 9999 }] }, totalValue: 100 }));
});
test('missing held price leaves total and weights unknown and prevents any trade', () => {
  const s = snapshot();
  const data = calculatePortfolio(stocks, Object.fromEntries(s.positions.map(p => [p.mint, p.tokenAmount])), { ...prices, [mints[0]]: { ...prices[mints[0]], usdPrice: null } }, basket);
  assert.equal(data.totalValue, null); assert.ok(data.positions.every(p => p.currentWeightBps === null));
  const plan = calculateRebalancePlan({ positions: data.positions, basket, totalValue: data.totalValue });
  assert.equal(plan.trades.length, 0); assert.ok(plan.errors.length);
});
test('no target basket leaves normal holdings with no target or rebalance', () => {
  const data = calculatePortfolio(stocks, { [mints[0]]: 3_000_000n }, prices, null);
  assert.equal(data.positions.length, 1); assert.equal(data.positions[0].currentWeightBps, 10000); assert.equal(data.positions[0].targetWeightBps, null);
  assert.equal(calculateRebalancePlan({ positions: data.positions, basket: null, totalValue: data.totalValue }).trades.length, 0);
});
test('SPL and Token-2022 balances aggregate by verified mint, ignoring unrelated accounts', () => {
  function account(id: string, mint: string, amount: string, program: string) { return { pubkey: id, account: { owner: program, data: { parsed: { info: { owner, mint, tokenAmount: { amount, decimals: 6 } } } } } }; }
  const a = account('fixture-a', mints[0], '1000001', TOKEN_PROGRAMS[0]);
  const b = account('fixture-b', mints[0], '2000002', TOKEN_PROGRAMS[1]);
  const unrelated = account('fixture-c', 'So11111111111111111111111111111111111111112', '999999', TOKEN_PROGRAMS[0]);
  assert.deepEqual(aggregateTokenAccounts([a, b, a, unrelated], owner, stocks), { [mints[0]]: 3_000_003n });
  assert.throws(() => aggregateTokenAccounts([a], 'another-owner', stocks));
});
test('USD to atomic conversion floors safely and funding cannot exceed realized cash', () => {
  assert.equal(usdToAtomicDown(1.0000009, 1, 6), 1_000_000n);
  assert.equal(usdToAtomicDown(1e-8, 1, 8), 1n);
  const buys = fundBuyTrades(planFor(snapshot()).trades, 3_600_000n, 1);
  assert.deepEqual(buys.map(t => t.inputAmount), [1_800_000n, 1_800_000n]);
  assert.ok(buys.reduce((sum, t) => sum + t.inputAmount, 0n) <= 3_600_000n);
});
function harness({ failBuy = false, failRefresh = false, unknownSell = false, repriceAfterSells = false } = {}) {
  let values = [43, 18, 21, 18]; let cash = 100_000_000n; let count = 0;
  let failedOnce = false; let refreshFailed = false; let unknownOnce = false;
  const events: string[] = []; const attempts: ExecutionLeg[] = [];
  const initial = snapshot(values, cash);
  const runner = new RebalanceController(initial, basket, planFor(initial), {
    changed: () => {},
    refresh: async signatures => {
      events.push('refresh');
      if (failRefresh && signatures.length === 2 && !refreshFailed) { refreshFailed = true; throw new Error('RPC catching up'); }
      const latest = snapshot(values, cash);
      if (repriceAfterSells && signatures.length >= 2) {
        Object.assign(latest, calculatePortfolio(stocks, Object.fromEntries(latest.positions.map(p => [p.mint, p.tokenAmount])), { ...prices, [mints[1]]: { ...prices[mints[1]], usdPrice: 2 } }, basket));
      }
      return latest;
    },
    trade: async (leg, update, submitted) => {
      events.push(leg.inputSymbol === 'USDC' ? 'buy' : 'sell'); attempts.push({ ...leg }); count++;
      assert.equal(leg.requestId, undefined, 'Each attempt starts without an old requestId');
      submitted({ requestId: `fixture-${count}`, signedTransaction: 'test-only' });
      if (unknownSell && !unknownOnce) { unknownOnce = true; return { ...leg, status: 'failed', outcomeUnknown: true }; }
      if (failBuy && leg.outputSymbol === 'QQQx' && !failedOnce) { failedOnce = true; return { ...leg, status: 'failed', error: 'Test route failed', requestId: `fixture-${count}` }; }
      let received: bigint;
      if (leg.inputSymbol !== 'USDC') {
        const index = mints.indexOf(leg.inputMint);
        values[index] -= Number(leg.inputAmount) / 1e6;
        received = leg.inputAmount * 9n / 10n; // Actual fixture proceeds differ from preview.
        cash += received;
      } else {
        assert.ok(cash - leg.inputAmount >= initial.usdcBalance, 'Existing USDC must stay untouched');
        cash -= leg.inputAmount; received = leg.inputAmount;
        values[mints.indexOf(leg.outputMint)] += Number(received) / 1e6;
      }
      const result: ExecutionLeg = { ...leg, status: 'success', signature: getBase58Decoder().decode(new Uint8Array(64).fill(count)), spentAmount: leg.inputAmount, receivedAmount: received, requestId: `fixture-${count}` };
      update(result); return result;
    },
    check: async () => ({ status: 'Failed', signature: null, code: -1, totalInputAmount: null, totalOutputAmount: null, inputAmountResult: null, outputAmountResult: null, error: 'Unknown old order' }),
  });
  return { runner, events, attempts, setValues: (next: number[]) => { values = next; } };
}
test('sells precede buys, refresh separates phases, and buys use actual post-sell proceeds', async () => {
  const { runner, events, attempts } = harness(); await runner.start();
  assert.equal(runner.state.phase, 'success');
  const firstBuy = events.indexOf('buy'); const lastSell = events.lastIndexOf('sell');
  assert.ok(firstBuy > lastSell); assert.ok(events.slice(lastSell + 1, firstBuy).includes('refresh'));
  assert.deepEqual(attempts.filter(l => l.inputSymbol === 'USDC').map(l => l.inputAmount), [1_800_000n, 1_800_000n]);
  assert.equal(events.at(-1), 'refresh'); assert.equal(runner.state.snapshot.usdcBalance, 100_000_000n);
});
test('failed buy is individually retryable and successful sells/buys are never repeated', async () => {
  const { runner, attempts } = harness({ failBuy: true }); await runner.start();
  assert.equal(runner.state.phase, 'partial');
  const successful = [...runner.state.sells, ...runner.state.buys].filter(l => l.status === 'success').map(l => l.id);
  const failed = runner.state.buys.find(l => l.status === 'failed')!; await runner.retry(failed.id);
  assert.equal(runner.state.phase, 'success'); assert.equal(attempts.filter(l => l.id === failed.id).length, 2);
  for (const id of successful) assert.equal(attempts.filter(l => l.id === id).length, 1);
});
test('post-sell refresh failure blocks buys, then resumes without repeating successful sells', async () => {
  const { runner, attempts } = harness({ failRefresh: true }); await runner.start();
  assert.equal(runner.state.phase, 'paused'); assert.ok(attempts.every(l => l.inputSymbol !== 'USDC'));
  await runner.continue(); assert.equal(runner.state.phase, 'success'); assert.equal(attempts.filter(l => l.inputSymbol !== 'USDC').length, 2);
});
test('unknown submission blocks all later trades and missing cached order does not authorize a fresh swap', async () => {
  const { runner, attempts } = harness({ unknownSell: true }); await runner.start();
  assert.equal(runner.state.phase, 'paused'); assert.equal(attempts.length, 1);
  const id = runner.state.sells[0].id; await runner.check(id); await runner.continue();
  assert.equal(runner.state.sells[0].outcomeUnknown, true); assert.equal(attempts.length, 1);
});

test('post-sell price changes rebuild buy destinations and already-funded assets do not starve pending buys', async () => {
  const { runner, attempts } = harness({ repriceAfterSells: true });
  await runner.start();
  const buys = attempts.filter(l => l.inputSymbol === 'USDC');
  assert.ok(buys.some(l => l.outputSymbol === 'NVDAx'));
  assert.ok(buys.some(l => l.outputSymbol === 'QQQx'));
  assert.ok(buys.every(l => l.outputSymbol !== 'METAx'));
  assert.ok(buys.reduce((sum, l) => sum + l.inputAmount, 0n) <= 3_600_000n);
});
