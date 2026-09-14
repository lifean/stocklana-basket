import type { Basket } from '../../types/basket.ts';
import type { PortfolioSnapshot } from '../../types/portfolio.ts';
import type { ExecutionLeg } from '../../types/execution.ts';
import type { ExecutePayload, JupiterExecutionResult } from '../../types/jupiter.ts';
import { calculateRebalancePlan, fundBuyTrades, MIN_TRADE_USD, type RebalancePlan, type RebalanceTrade } from '../rebalance.ts';
import { applyExecutionResult } from './leg.ts';

export interface RebalanceLeg extends ExecutionLeg { side: 'SELL' | 'BUY'; symbol: string; estimatedUsd: number; skipped?: boolean; }
export interface RebalanceRun {
  owner: string;
  basket: Basket;
  baselineUsdc: bigint;
  sells: RebalanceLeg[];
  buys: RebalanceLeg[];
  buysStarted: boolean;
  phase: 'selling' | 'sell-review' | 'refreshing' | 'buying' | 'paused' | 'partial' | 'success' | 'failed';
  running: boolean;
  snapshot: PortfolioSnapshot;
  error?: string;
}
export interface RebalanceDependencies {
  refresh: (signatures: string[]) => Promise<PortfolioSnapshot>;
  trade: (leg: ExecutionLeg, update: (leg: ExecutionLeg) => void, submitted: (payload: ExecutePayload) => void, signal: AbortSignal) => Promise<ExecutionLeg>;
  check: (payload: ExecutePayload) => Promise<JupiterExecutionResult>;
  changed: (run: RebalanceRun) => void;
}
function asLeg(trade: RebalanceTrade): RebalanceLeg {
  return { id: crypto.randomUUID(), side: trade.side, symbol: trade.symbol, estimatedUsd: trade.valueUsd, inputMint: trade.inputMint, outputMint: trade.outputMint, inputSymbol: trade.inputSymbol, outputSymbol: trade.outputSymbol, inputAmount: trade.inputAmount, status: 'idle' };
}
export function remainingProceeds(run: RebalanceRun, snapshot: PortfolioSnapshot): bigint {
  const successfulSells = run.sells.filter(l => l.status === 'success');
  const successfulBuys = run.buys.filter(l => l.status === 'success');
  if (successfulSells.some(l => l.receivedAmount === undefined) || successfulBuys.some(l => l.spentAmount === undefined)) throw new Error('Jupiter did not return actual executed amounts. Check the completed trades before continuing.');
  const received = successfulSells.reduce((sum, l) => sum + l.receivedAmount!, 0n);
  const spent = successfulBuys.reduce((sum, l) => sum + l.spentAmount!, 0n);
  const unspent = received > spent ? received - spent : 0n;
  const available = snapshot.usdcBalance > run.baselineUsdc ? snapshot.usdcBalance - run.baselineUsdc : 0n;
  return available < unspent ? available : unspent;
}
/** Owns one in-memory rebalance. No quote or signed payload is persisted. */
export class RebalanceController {
  private value: RebalanceRun;
  private readonly deps: RebalanceDependencies;
  private readonly submissions = new Map<string, ExecutePayload>();
  private locked = false;
  private initialized = false;
  private readonly abort = new AbortController();
  stop() { this.abort.abort(); }
  constructor(snapshot: PortfolioSnapshot, basket: Basket, plan: RebalancePlan, deps: RebalanceDependencies) {
    this.deps = deps;
    if (plan.errors.length) throw new Error(plan.errors.join(' '));
    this.value = { owner: snapshot.owner, basket, baselineUsdc: snapshot.usdcBalance, sells: plan.trades.filter(t => t.side === 'SELL').map(asLeg), buys: [], buysStarted: false, phase: 'selling', running: false, snapshot };
  }
  get state(): RebalanceRun { return this.value; }
  private change(patch: Partial<RebalanceRun>) { this.value = { ...this.value, ...patch }; this.deps.changed(this.value); }
  private legs() { return [...this.value.sells, ...this.value.buys]; }
  private updateLeg(id: string, patch: Partial<RebalanceLeg>) {
    this.change({ sells: this.value.sells.map(l => l.id === id ? { ...l, ...patch } : l), buys: this.value.buys.map(l => l.id === id ? { ...l, ...patch } : l) });
  }
  private async action(task: () => Promise<void>) {
    if (this.locked) return;
    this.locked = true; this.change({ running: true, error: undefined });
    try { await task(); }
    catch (error) { this.change({ phase: 'paused', error: error instanceof Error ? error.message : 'Rebalance paused. Refresh to continue.' }); }
    finally { this.locked = false; this.change({ running: false }); }
  }
  private async refresh() {
    this.change({ phase: 'refreshing' });
    const signatures = this.legs().filter(l => l.status === 'success' && l.signature).map(l => l.signature!);
    this.abort.signal.throwIfAborted();
    const snapshot = await this.deps.refresh(signatures);
    this.abort.signal.throwIfAborted();
    if (snapshot.owner !== this.value.owner) throw new Error('Reconnect the original wallet to continue this rebalance.');
    if (snapshot.registry.unavailable.length) throw new Error('The stock registry is unresolved. Refresh before continuing.');
    // Never silently replace a resolved token with another mint during a run.
    for (const original of this.value.snapshot.registry.stocks) {
      if (snapshot.registry.stocks.find(s => s.symbol === original.symbol)?.mint !== original.mint) throw new Error('The verified stock registry changed. This run cannot continue with different mints.');
    }
    this.change({ snapshot });
    return snapshot;
  }
  private plan(snapshot: PortfolioSnapshot, includeProceeds: boolean) {
    const budget = includeProceeds ? remainingProceeds(this.value, snapshot) : 0n;
    const totalValue = snapshot.totalValue === null ? null : snapshot.totalValue + Number(budget) / 1_000_000 * (snapshot.usdcPrice ?? 0);
    const plan = calculateRebalancePlan({ positions: snapshot.positions, basket: this.value.basket, totalValue, usdcPrice: snapshot.usdcPrice });
    if (plan.errors.length) throw new Error(plan.errors.join(' '));
    return { plan, budget };
  }
  private fundedBuys(plan: RebalancePlan, budget: bigint, snapshot: PortfolioSnapshot) {
    const eligible = this.value.buysStarted
      ? plan.trades.filter(t => this.value.buys.some(l => l.outputMint === t.mint && l.status !== 'success' && !l.skipped))
      : plan.trades;
    return fundBuyTrades(eligible, budget, snapshot.usdcPrice!);
  }
  private capTrade(trade: RebalanceTrade, maximum: bigint, snapshot: PortfolioSnapshot): RebalanceTrade | null {
    const inputAmount = trade.inputAmount < maximum ? trade.inputAmount : maximum;
    const position = snapshot.positions.find(p => p.mint === trade.mint)!;
    const valueUsd = Number(inputAmount) / 10 ** (trade.side === 'BUY' ? 6 : position.decimals) * (trade.side === 'BUY' ? snapshot.usdcPrice! : position.price!);
    return valueUsd >= MIN_TRADE_USD && inputAmount > 0n ? { ...trade, inputAmount, valueUsd } : null;
  }
  private async trade(leg: RebalanceLeg) {
    this.abort.signal.throwIfAborted();
    if (leg.status === 'success' || leg.skipped) return;
    this.submissions.delete(leg.id);
    const fresh: RebalanceLeg = { ...leg, status: 'quoting', requestId: undefined, expectedOutputAmount: undefined, signature: undefined, error: undefined, outcomeUnknown: false };
    this.updateLeg(leg.id, fresh);
    let result: ExecutionLeg;
    try {
      result = await this.deps.trade(fresh, next => this.updateLeg(leg.id, next), payload => this.submissions.set(leg.id, payload), this.abort.signal);
    } catch (error) {
      result = { ...fresh, status: 'failed', error: error instanceof Error ? error.message : 'Could not execute this swap.', outcomeUnknown: this.submissions.has(leg.id) };
    }
    this.updateLeg(leg.id, result);
    if (result.outcomeUnknown) throw new Error('An execution outcome is unknown. Check that submission before continuing.');
  }
  private summarize() {
    const legs = this.legs().filter(l => !l.skipped);
    if (legs.some(l => l.status === 'idle' || l.status === 'quoting' || l.status === 'executing' || l.status === 'awaiting-signature')) { this.change({ phase: 'paused' }); return; }
    const failed = legs.some(l => l.status === 'failed');
    this.change({ phase: failed ? legs.some(l => l.status === 'success') ? 'partial' : 'failed' : 'success' });
  }
  private async advance(allowFailedSells = false) {
    if (this.legs().some(l => l.outcomeUnknown)) throw new Error('Resolve the unknown submission first.');
    if (!this.value.buysStarted) {
      this.change({ phase: 'selling' });
      for (const leg of this.value.sells) if (leg.status === 'idle' && !leg.skipped) await this.trade(leg);
      const snapshot = await this.refresh();
      if (!allowFailedSells && this.value.sells.some(l => l.status === 'failed' && !l.skipped)) { this.change({ phase: 'sell-review' }); return; }
      // This is deliberately built AFTER the refresh, never from preview buy amounts.
      const { plan, budget } = this.plan(snapshot, true);
      const buys = this.fundedBuys(plan, budget, snapshot).map(asLeg);
      this.change({ buysStarted: true, buys, phase: 'buying' });
    }
    for (const original of this.value.buys) {
      if (original.status !== 'idle' || original.skipped) continue;
      const snapshot = await this.refresh();
      const { plan, budget } = this.plan(snapshot, true);
      const found = this.fundedBuys(plan, budget, snapshot).find(t => t.mint === original.outputMint);
      const candidate = found ? this.capTrade(found, original.inputAmount, snapshot) : null;
      if (!candidate) { this.updateLeg(original.id, { skipped: true, error: 'No longer above the trade thresholds, or not enough sell proceeds.' }); continue; }
      const amount = candidate.inputAmount;
      this.updateLeg(original.id, { inputAmount: amount, estimatedUsd: Number(amount) / 1_000_000 * snapshot.usdcPrice! });
      this.change({ phase: 'buying' });
      await this.trade({ ...original, inputAmount: amount, estimatedUsd: candidate.valueUsd });
    }
    await this.refresh();
    this.summarize();
  }
  private async initialize() {
    const snapshot = await this.refresh();
    const { plan } = this.plan(snapshot, false);
    this.change({ baselineUsdc: snapshot.usdcBalance });
    for (const leg of this.value.sells) {
      const found = plan.trades.find(t => t.side === 'SELL' && t.mint === leg.inputMint);
      const candidate = found ? this.capTrade(found, leg.inputAmount, snapshot) : null;
      if (candidate) this.updateLeg(leg.id, { inputAmount: candidate.inputAmount, estimatedUsd: candidate.valueUsd });
      else this.updateLeg(leg.id, { skipped: true, error: 'No longer above the trade thresholds after refresh.' });
    }
    this.initialized = true;
  }
  start() { return this.action(async () => { await this.initialize(); await this.advance(); }); }
  continue() { return this.action(async () => { if (!this.initialized) await this.initialize(); await this.advance(true); }); }
  retry(id: string) { return this.action(async () => {
    if (this.legs().some(l => l.outcomeUnknown)) throw new Error('Resolve the unknown submission first.');
    const original = this.legs().find(l => l.id === id);
    if (!original || original.status !== 'failed' || original.skipped) return;
    if (original.side === 'SELL' && this.value.buysStarted) throw new Error('The buy phase has started. Review a new rebalance plan for remaining sells.');
    const snapshot = await this.refresh();
    const { plan, budget } = this.plan(snapshot, true);
    const trades = original.side === 'BUY' ? this.fundedBuys(plan, budget, snapshot) : plan.trades;
    const found = trades.find(t => t.side === original.side && t.mint === (original.side === 'BUY' ? original.outputMint : original.inputMint));
    const candidate = found ? this.capTrade(found, original.inputAmount, snapshot) : null;
    if (!candidate) this.updateLeg(id, { skipped: true, error: 'No longer above the trade thresholds, or not enough sell proceeds.' });
    else {
      const inputAmount = candidate.inputAmount;
      this.change({ phase: original.side === 'SELL' ? 'selling' : 'buying' });
      await this.trade({ ...original, inputAmount, estimatedUsd: candidate.valueUsd });
    }
    if (!this.value.buysStarted) await this.advance();
    else { await this.refresh(); this.summarize(); }
  }); }
  check(id: string) { return this.action(async () => {
    const leg = this.legs().find(l => l.id === id);
    const payload = this.submissions.get(id);
    if (!leg?.outcomeUnknown || !payload) return;
    this.updateLeg(id, applyExecutionResult(leg, await this.deps.check(payload)));
    this.change({ phase: 'paused' });
  }); }
}
