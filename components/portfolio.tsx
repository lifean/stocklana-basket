'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useClient } from '@solana/react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { isTransactionModifyingSigner } from '@solana/kit';
import type { AppClient } from '@/lib/solana/client';
import type { Basket } from '@/types/basket';
import type { PortfolioSnapshot } from '@/types/portfolio';
import { baskets } from '@/lib/baskets';
import { formatUsdc } from '@/lib/amounts';
import { calculateRebalancePlan, type RebalancePlan } from '@/lib/rebalance';
import { loadPortfolio } from '@/lib/solana/portfolio';
import { executeLeg, getLegOrder, submitLeg } from '@/lib/execution/leg';
import { RebalanceController, type RebalanceRun } from '@/lib/execution/rebalance';

function activeBasketId() { try { return localStorage.getItem('stocklana.activeBasket'); } catch { return null; } }
function subscribeBasket(callback: () => void) {
  window.addEventListener('storage', callback); window.addEventListener('focus', callback);
  return () => { window.removeEventListener('storage', callback); window.removeEventListener('focus', callback); };
}
const money = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
const percent = (bps: number | null) => bps === null ? '—' : `${(bps / 100).toFixed(2)}%`;
const labels = { idle: 'Pending', quoting: 'Getting quote', 'awaiting-signature': 'Waiting for signature…', executing: 'Executing', success: 'Completed', failed: 'Failed' };
type DataState = { key: string; snapshot: PortfolioSnapshot | null; error: string | null };
export function Portfolio() {
  const client = useClient<AppClient>();
  const wallet = useConnectedWallet(client);
  const owner = wallet?.account.address;
  const basketId = useSyncExternalStore(subscribeBasket, activeBasketId, () => null);
  const basket = baskets.find(b => b.id === basketId) ?? null;
  const key = `${owner ?? ''}:${basket?.id ?? ''}`;
  const [data, setData] = useState<DataState | null>(null);
  const [refreshCount, setRefreshCount] = useState(0);
  const [manualLoading, setManualLoading] = useState(false);
  const [preview, setPreview] = useState<{ snapshot: PortfolioSnapshot; basket: Basket; plan: RebalancePlan } | null>(null);
  const [run, setRun] = useState<RebalanceRun | null>(null);
  const [error, setError] = useState<string | null>(null);
  const controller = useRef<RebalanceController | null>(null);
  const previewLock = useRef(false);
  const visible = data?.key === key ? data : null;
  const snapshot = visible?.snapshot ?? null;
  const loading = !!owner && (!visible || manualLoading);
  const unknown = !!run && [...run.sells, ...run.buys].some(l => l.outcomeUnknown);
  const sameRunWallet = owner === run?.owner && basket?.id === run?.basket.id;
  const busy = manualLoading || !!run?.running;
  const capable = !!wallet?.signer && isTransactionModifyingSigner(wallet.signer);
  const newPlanAllowed = !run || ['success', 'partial', 'failed'].includes(run.phase) || (run.phase === 'paused' && ![...run.sells, ...run.buys].some(l => l.status === 'success' || l.outcomeUnknown));
  useEffect(() => {
    if (!owner) return;
    const abort = new AbortController();
    void loadPortfolio(client, owner, basket, [], abort.signal).then(snapshot => {
      if (!abort.signal.aborted) { setData({ key, snapshot, error: null }); setManualLoading(false); }
    }).catch(() => {
      if (!abort.signal.aborted) { setData({ key, snapshot: null, error: 'Could not read the portfolio. Check your RPC connection and try again.' }); setManualLoading(false); }
    });
    return () => abort.abort();
  }, [client, owner, basket, key, refreshCount]);
  useEffect(() => () => controller.current?.stop(), []);
  useEffect(() => {
    if (!run?.running && !unknown) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [run?.running, unknown]);
  const plan = snapshot ? calculateRebalancePlan({ positions: snapshot.positions, basket, totalValue: snapshot.totalValue, usdcPrice: snapshot.usdcPrice }) : null;
  const registryReady = !!snapshot && !snapshot.registry.unavailable.length;
  const canPreview = !!owner && !!basket && capable && registryReady && !!plan && !plan.errors.length && plan.trades.some(t => t.side === 'SELL') && !busy && !unknown && newPlanAllowed;
  async function review() {
    if (!owner || !basket || previewLock.current || !canPreview) return;
    previewLock.current = true; setManualLoading(true); setError(null);
    try {
      const signatures = run?.owner === owner ? [...run.sells, ...run.buys].filter(l => l.status === 'success' && l.signature).map(l => l.signature!) : [];
      const latest = await loadPortfolio(client, owner, basket, signatures);
      if (client.wallet.getState().connected?.account.address !== owner || activeBasketId() !== basket.id) throw new Error('Wallet or target basket changed. Review again.');
      setData({ key, snapshot: latest, error: null });
      if (latest.registry.unavailable.length) throw new Error('Stock registry unresolved. Rebalance is unavailable.');
      const next = calculateRebalancePlan({ positions: latest.positions, basket, totalValue: latest.totalValue, usdcPrice: latest.usdcPrice });
      if (next.errors.length) throw new Error(next.errors.join(' '));
      setPreview({ snapshot: latest, basket, plan: next });
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not prepare the rebalance.'); }
    finally { setManualLoading(false); previewLock.current = false; }
  }
  async function start() {
    if (!preview || !owner || busy || unknown || controller.current?.state.running) return;
    const chosen = preview;
    if (chosen.snapshot.owner !== owner || chosen.basket.id !== basket?.id) { setPreview(null); setError('Wallet or strategy changed. Review again.'); return; }
    const originalOwner = owner;
    const originalBasket = chosen.basket;
    const ensureWallet = () => {
      if (client.wallet.getState().connected?.account.address !== originalOwner || activeBasketId() !== originalBasket.id) throw new Error('Reconnect the original wallet and target basket to continue.');
    };
    const runner = new RebalanceController(chosen.snapshot, originalBasket, chosen.plan, {
      refresh: async signatures => { ensureWallet(); return loadPortfolio(client, originalOwner, originalBasket, signatures); },
      trade: async (leg, update, submitted, signal) => {
        ensureWallet(); signal.throwIfAborted();
        const order = await getLegOrder(leg, originalOwner);
        ensureWallet(); signal.throwIfAborted();
        update({ ...leg, expectedOutputAmount: BigInt(order.outAmount!), requestId: order.requestId! });
        return executeLeg(leg, originalOwner, order, client, update, submitted, signal);
      },
      check: submitLeg,
      changed: next => { setRun(next); setData({ key: `${next.owner}:${next.basket.id}`, snapshot: next.snapshot, error: null }); },
    });
    controller.current?.stop(); controller.current = runner;
    setPreview(null); setError(null); setRun(runner.state);
    await runner.start();
  }
  const completed = run ? [...run.sells, ...run.buys].filter(l => l.status === 'success').length : 0;
  const heading = run ? run.phase === 'success' ? 'Rebalance trades completed' : run.phase === 'partial' || (['paused', 'sell-review'].includes(run.phase) && completed > 0) ? 'Rebalance partially completed' : ({ selling: 'Selling overweight positions', 'sell-review': 'Sell phase needs attention', refreshing: 'Refreshing balances and prices', buying: 'Buying underweight positions', paused: 'Rebalance paused', failed: 'Rebalance did not complete' } as Record<string, string>)[run.phase] : '';
  return <main className="basket-page"><div className="section-heading"><div><span className="eyebrow">YOUR WALLET, YOUR ASSETS</span><h1 className="portfolio-title">Your Portfolio</h1><p className="muted">{basket ? `Target strategy: ${basket.name}` : 'Supported xStock holdings'}</p></div><button className="button secondary" disabled={!owner || busy || unknown} onClick={() => { setManualLoading(true); setPreview(null); setError(null); setRefreshCount(n => n + 1); }}>Refresh</button></div>
    {!owner && <section className="panel"><h2>Connect your wallet</h2><p className="muted">Connect above to read your real xStock balances on Solana mainnet.</p></section>}
    {loading && <p role="status" className="muted">Reading token accounts and current prices…</p>}
    {visible?.error && <p className="error" role="alert">{visible.error}</p>}
    {snapshot && <><section className="panel portfolio-summary"><div><span className="eyebrow">TOTAL STOCK VALUE</span><h2>{snapshot.totalValue === null ? 'Unavailable' : money(snapshot.totalValue)}</h2>{snapshot.totalValue === null && <p className="small muted">Priced holdings: {money(snapshot.pricedValue)}. One or more stocks cannot be fully valued.</p>}</div><div><span className="eyebrow">WEIGHTED 24H TOKEN CHANGE</span><h2>{snapshot.weightedChange24h === null ? '—' : `${snapshot.weightedChange24h > 0 ? '+' : ''}${snapshot.weightedChange24h.toFixed(2)}%`}</h2><p className="small muted">Current-holdings price change, not portfolio P&amp;L.</p></div></section>
      {!basket && <p className="small muted">{basketId ? 'Saved strategy is unavailable.' : 'No active basket selected.'} Holdings are shown normally. <Link className="text-button" href="/">Choose a preset strategy</Link> to enable rebalance.</p>}
      {!registryReady && <p className="error" role="alert">Some supported stock symbols are unavailable or ambiguous. Only resolved holdings are shown; rebalancing is disabled.</p>}
      <section className="panel portfolio-positions"><div className="table-scroll"><table><thead><tr><th>Asset</th><th>Value</th><th>Current</th><th>Target</th><th>Drift</th></tr></thead><tbody>{snapshot.positions.map(p => <tr key={p.mint}><th scope="row">{p.symbol}<small>{p.uiAmount.toLocaleString(undefined, { maximumFractionDigits: Math.min(p.decimals, 8) })} tokens</small><small>Liquidity: {p.liquidity === null ? 'Unavailable' : money(p.liquidity)}</small></th><td>{p.valueUsd === null ? 'Price unavailable' : money(p.valueUsd)}</td><td>{percent(p.currentWeightBps)}</td><td>{percent(p.targetWeightBps)}</td><td>{p.driftBps === null ? '—' : `${p.driftBps > 0 ? '+' : ''}${percent(p.driftBps)}`}</td></tr>)}</tbody></table></div>{!snapshot.positions.some(p => p.tokenAmount > 0n) && <p className="muted small">No supported, verified xStock holdings found in this wallet.</p>}</section>
      <div className="rebalance-action"><button className="button primary" disabled={!canPreview} onClick={review}>Rebalance</button><p className="small muted">Rebalance ignores drift below 1 percentage point and trades below $1. Only proceeds from this rebalance fund buys; existing USDC stays untouched.</p></div>
      {basket && plan?.errors.length ? <p className="error">{plan.errors.join(' ')}</p> : basket && !plan?.trades.length && snapshot.totalValue !== null ? <p className="small muted">No trades meet the rebalance thresholds.</p> : null}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
    {preview && <section className="panel rebalance-preview" aria-label="Rebalance preview"><h2>Rebalance Portfolio</h2><div className="table-scroll"><table><thead><tr><th>Asset</th><th>Current</th><th>Target</th></tr></thead><tbody>{preview.snapshot.positions.map(p => <tr key={p.mint}><th>{p.symbol}</th><td>{percent(p.currentWeightBps)}</td><td>{percent(p.targetWeightBps)}</td></tr>)}</tbody></table></div><h3>Rebalance Plan</h3>{(['SELL', 'BUY'] as const).map(side => <div key={side}><span className="eyebrow">{side}</span>{preview.plan.trades.filter(t => t.side === side).map(t => <p key={t.mint} className="preview-total"><span>{t.inputSymbol} → {t.outputSymbol}</span><strong>Approximately {money(t.valueUsd)}</strong></p>)}</div>)}<p>Estimated transactions: {preview.plan.trades.length}</p><p className="small muted">Sells execute first. Holdings, USDC and prices are then refreshed; buy amounts are recalculated from actual proceeds. Each swap requests a fresh order and wallet signature. Final weights can differ because of prices, fees, slippage and rounding.</p><div className="portfolio-controls"><button className="button secondary" disabled={busy} onClick={() => setPreview(null)}>Cancel</button><button className="button primary" disabled={busy || !owner || owner !== preview.snapshot.owner || basket?.id !== preview.basket.id || !preview.plan.trades.some(t => t.side === 'SELL')} onClick={start}>Rebalance Portfolio</button></div></section>}
    {run && <section className="panel rebalance-progress" aria-live="polite"><h2>{heading}</h2><p className="small muted">{run.basket.name} · {completed} / {[...run.sells, ...run.buys].filter(l => !l.skipped).length} completed</p>{!sameRunWallet && <p className="error">Reconnect the original wallet and strategy to resume this run.</p>}{run.error && <p role="alert" className="error">{run.error}</p>}{(['SELL', 'BUY'] as const).map(side => <div key={side}><h3>{side === 'SELL' ? 'A · Sell' : 'B · Buy'}</h3>{(side === 'SELL' ? run.sells : run.buys).map(leg => <div className="rebalance-leg" key={leg.id}><div><strong>{leg.inputSymbol} → {leg.outputSymbol}</strong><p className="small muted">{leg.inputSymbol === 'USDC' ? `${formatUsdc(leg.inputAmount)} USDC` : `Approximately ${money(leg.estimatedUsd)}`} · {leg.skipped ? 'Skipped after recalculation' : labels[leg.status]}</p>{leg.status === 'success' && leg.receivedAmount !== undefined && <p className="small">Received {leg.outputSymbol === 'USDC' ? formatUsdc(leg.receivedAmount) : (Number(leg.receivedAmount) / 10 ** (run.snapshot.registry.stocks.find(s => s.mint === leg.outputMint)?.decimals ?? 0)).toLocaleString(undefined, { maximumFractionDigits: 8 })} {leg.outputSymbol}</p>}{leg.error && <p className="error small">{leg.error}</p>}{leg.signature && <a className="text-button small" target="_blank" rel="noreferrer" href={`https://solscan.io/tx/${leg.signature}`}>View on Solscan ↗</a>}</div>{leg.outcomeUnknown ? <button className="button secondary" disabled={busy} onClick={() => void controller.current?.check(leg.id)}>Check execution</button> : leg.status === 'failed' && !leg.skipped && (leg.side === 'BUY' || !run.buysStarted) ? <button className="button secondary" disabled={busy || unknown || !sameRunWallet || !capable} onClick={() => void controller.current?.retry(leg.id)}>Retry {leg.symbol}</button> : null}</div>)}{side === 'BUY' && !run.buysStarted && <p className="small muted">Buy legs will be calculated after sells and a chain refresh.</p>}</div>)}{['paused', 'sell-review'].includes(run.phase) && !unknown && <button className="button primary" disabled={busy || !sameRunWallet || !capable} onClick={() => void controller.current?.continue()}>{run.phase === 'sell-review' ? 'Continue with actual proceeds' : 'Refresh and continue'}</button>}{unknown && <p className="small muted">Check the unknown execution before retrying or starting another rebalance. Do not reload; signed submissions are only held in memory.</p>}{['success', 'partial', 'failed'].includes(run.phase) && <p className="small muted">The positions above have been refreshed from chain. Updated USDC balance: {formatUsdc(run.snapshot.usdcBalance)}. Exact target weights are not guaranteed. {run.sells.some(l => l.status === 'failed') && run.buysStarted ? 'Review a new plan to address remaining overweight holdings.' : ''}</p>}</section>}
  </main>;
}
