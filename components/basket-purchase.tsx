'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useClient } from '@solana/react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import type { AppClient } from '@/lib/solana/client';
import type { Basket } from '@/types/basket';
import type { StockRegistry } from '@/types/stock';
import type { ExecutionLeg } from '@/types/execution';
import type { ExecutePayload, JupiterOrder } from '@/types/jupiter';
import { createBasketExecutionPlan } from '@/lib/execution/basket';
import { applyExecutionResult, checkUsdcBalance, executeLeg, getLegOrder, submitLeg } from '@/lib/execution/leg';
import { formatUsdc } from '@/lib/amounts';
import { ErrorNotice } from './error-notice';
const labels = { idle: 'Pending', quoting: 'Getting quote', 'awaiting-signature': 'Waiting for signature…', executing: 'Executing', success: 'Completed', failed: 'Failed' };
export function BasketPurchase({ basket, amount, registry, availableBalance, onStarted }: { availableBalance: bigint | null; onStarted: () => void; basket: Basket; amount: bigint; registry: StockRegistry }) {
  const client = useClient<AppClient>();
  const wallet = useConnectedWallet(client);
  const [legs, setLegs] = useState<ExecutionLeg[]>([]);
  const [quotes, setQuotes] = useState<JupiterOrder[]>([]);
  const [owner, setOwner] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string>();
  const lock = useRef(false);
  const abort = useRef(new AbortController());
  const payloads = useRef(new Map<string, ExecutePayload>());
  const latest = useRef<ExecutionLeg[]>([]);
  const unknown = legs.some(l => l.outcomeUnknown);
  const completed = legs.filter(l => l.status === 'success').length;
  const sameWallet = !!owner && owner === wallet?.account.address;
  function update(leg: ExecutionLeg) { latest.current = latest.current.map(l => l.id === leg.id ? leg : l); setLegs([...latest.current]); }
  useEffect(() => { abort.current = new AbortController(); const signal = abort.current; return () => signal.abort(); }, []);
  useEffect(() => {
    if (!busy && !unknown) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    const stay = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (link && link.target !== '_blank') { event.preventDefault(); event.stopPropagation(); }
    };
    window.addEventListener('beforeunload', warn); document.addEventListener('click', stay, true);
    return () => { window.removeEventListener('beforeunload', warn); document.removeEventListener('click', stay, true); };
  }, [busy, unknown]);
  async function review() {
    if (lock.current || !wallet || started) return;
    lock.current = true; setBusy(true); setError(undefined); setQuotes([]);
    try {
      const address = wallet.account.address;
      await checkUsdcBalance(client, address, amount);
      const plan = createBasketExecutionPlan(basket, amount, registry);
      const orders: JupiterOrder[] = [];
      for (const leg of plan) { abort.current.signal.throwIfAborted(); orders.push(await getLegOrder(leg, address)); }
      if (client.wallet.getState().connected?.account.address !== address) throw new Error('Wallet changed. Review again.');
      latest.current = plan; setLegs(plan); setOwner(address); setQuotes(orders);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not get Jupiter quotes.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function run(ids: string[]) {
    if (lock.current || !sameWallet || unknown || !owner) return;
    lock.current = true; setBusy(true); setStarted(true); onStarted(); setError(undefined);
    try {
      await checkUsdcBalance(client, owner, latest.current.filter(l => ids.includes(l.id) && l.status !== 'success').reduce((sum, l) => sum + l.inputAmount, 0n));
      for (const id of ids) {
        abort.current.signal.throwIfAborted();
        const leg = latest.current.find(l => l.id === id)!;
        if (leg.status === 'success' || leg.outcomeUnknown) continue;
        try {
          update({ ...leg, status: 'quoting', error: undefined });
          const order = await getLegOrder(leg, owner);
          const result = await executeLeg(leg, owner, order, client, update, payload => payloads.current.set(id, payload), abort.current.signal);
          if (result.outcomeUnknown || result.status === 'failed') break;
        } catch (e) { update({ ...leg, status: 'failed', error: e instanceof Error ? e.message : 'Could not get a quote.' }); break; }
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Execution stopped.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function check(leg: ExecutionLeg) {
    const payload = payloads.current.get(leg.id);
    if (!payload || lock.current) return;
    lock.current = true; setBusy(true);
    try { update(applyExecutionResult(leg, await submitLeg(payload))); }
    catch (e) { setError(e instanceof Error ? e.message : 'Execution outcome is unknown.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <div className="basket-execution">
    {!started && <><button className="button secondary full" disabled={busy || !wallet} onClick={review}>{busy ? 'Getting Jupiter quotes…' : 'Review live quotes'}</button>{!wallet && <p className="small muted">Connect your wallet above to buy this basket.</p>}</>}
    {error && <ErrorNotice error={error} />}
    {!!quotes.length && <><h3>{started ? completed === legs.length ? 'Portfolio Created' : legs.some(l => l.status === 'failed') ? completed ? 'Basket partially completed' : 'Basket needs attention' : 'Building your portfolio' : 'Review component trades'}</h3>
      <p className="small muted">{started ? `${completed} / ${legs.length} completed` : `Total investment: ${formatUsdc(amount)} USDC · ${legs.length} independent swaps`}</p>
      {(busy || unknown) && <p role="status" className="small muted">Keep this page open. Navigation is paused until the current execution is resolved.</p>}{started && <progress aria-label="Basket completion" value={completed} max={legs.length} />}
      {legs.map((leg, i) => {
        const stock = registry.stocks.find(s => s.mint === leg.outputMint)!;
        const received = leg.receivedAmount ?? leg.expectedOutputAmount ?? BigInt(quotes[i].outAmount!);
        return <div className="rebalance-leg" key={leg.id}><div><strong>{leg.status === 'success' ? '✓ ' : ''}{leg.outputSymbol}</strong><p className="small">{formatUsdc(leg.inputAmount)} USDC → {leg.status === 'success' && leg.receivedAmount === undefined ? 'Received amount unavailable' : `${(Number(received) / 10 ** stock.decimals).toLocaleString(undefined, { maximumFractionDigits: 8 })} tokens ${leg.status === 'success' ? 'received' : 'estimated'}`}</p><p className="small muted">{started ? labels[leg.status] : `Price impact: ${quotes[i].priceImpact === null ? 'Unavailable' : `${quotes[i].priceImpact}%`}`}</p>{leg.error && <ErrorNotice error={leg.error} />}{leg.status === 'success' && leg.signature && <a className="text-button small" href={`https://solscan.io/tx/${leg.signature}`} target="_blank" rel="noopener noreferrer">View on Solscan ↗</a>}</div>{leg.outcomeUnknown ? <button className="button secondary" disabled={busy} onClick={() => void check(leg)}>Check execution</button> : leg.status === 'failed' ? <button className="button secondary" disabled={busy || unknown || !sameWallet} onClick={() => void run([leg.id])}>Retry {leg.outputSymbol}</button> : null}</div>;
      })}
      {!started && <><p className="small muted">Each swap requires your approval. Fresh executable quotes are requested before signing; outputs may change. Review the amounts in your wallet.</p><button className="button primary full" disabled={busy || !sameWallet || availableBalance === null || availableBalance < amount} onClick={() => void run(legs.map(l => l.id))}>Buy Basket</button></>}
      {started && legs.some(l => l.status === 'idle') && <button className="button primary full" disabled={busy || unknown || !sameWallet} onClick={() => void run(legs.filter(l => l.status === 'idle').map(l => l.id))}>Continue pending trades</button>}
      {started && <><p className="small muted">Keep this page open until execution is resolved. Progress is held only in this tab. After a reload, review real wallet holdings before buying again; a selected strategy is not proof of purchase.</p><Link className="button secondary full" href="/portfolio" onClick={e => { if (busy || unknown) e.preventDefault(); }} aria-disabled={busy || unknown}>View Portfolio</Link></>}
    </>}
  </div>;
}
