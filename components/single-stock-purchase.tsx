'use client';
import { ErrorNotice } from './error-notice';
import { useEffect, useRef, useState } from 'react';
import { useClient } from '@solana/react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import { isTransactionModifyingSigner } from '@solana/kit';
import type { AppClient } from '@/lib/solana/client';
import type { StockRegistry } from '@/types/stock';
import type { ExecutionLeg } from '@/types/execution';
import type { ExecutePayload, JupiterOrder } from '@/types/jupiter';
import { formatUsdc, parseUsdc, USDC_MINT } from '@/lib/amounts';
import { applyExecutionResult, assertOrderFresh, checkUsdcBalance, executeLeg, getLegOrder, quoteExpiry, submitLeg, validateLegOrder } from '@/lib/execution/leg';

const labels = { idle: 'Pending', quoting: 'Getting quote', 'awaiting-signature': 'Waiting for signature…', executing: 'Executing', success: 'Completed', failed: 'Failed' };
function tokenAmount(amount: bigint, decimals: number) {
  const scale = 10n ** BigInt(decimals);
  const fraction = (amount % scale).toString().padStart(decimals, '0').replace(/0+$/, '');
  return `${amount / scale}${fraction ? `.${fraction}` : ''}`;
}
export function SingleStockPurchase() {
  const client = useClient<AppClient>();
  const wallet = useConnectedWallet(client);
  const [registry, setRegistry] = useState<StockRegistry | null>(null);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [amount, setAmount] = useState('1');
  const [leg, setLeg] = useState<ExecutionLeg | null>(null);
  const [order, setOrder] = useState<JupiterOrder | null>(null);
  const [orderOwner, setOrderOwner] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ owner: string; amount: bigint } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const submission = useRef<ExecutePayload | null>(null);
  const [now, setNow] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/stocks', { cache: 'no-store', signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Stock registry unavailable.');
      setRegistry(data);
    }).catch(error => { if (!controller.signal.aborted) setRegistryError(error.message); });
    return () => controller.abort();
  }, [reload]);
  useEffect(() => {
    if (!order) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [order]);
  useEffect(() => {
    if (!busy && !leg?.outcomeUnknown) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [busy, leg?.outcomeUnknown]);
  const stock = registry?.stocks.find(s => s.symbol === 'NVDAx' && s.isVerified);
  const issue = registry?.unavailable.find(s => s.symbol === 'NVDAx');
  let parsed: bigint | null = null;
  try { parsed = parseUsdc(amount); } catch { /* Input explanation is displayed below. */ }
  const capable = wallet?.signer && isTransactionModifyingSigner(wallet.signer);
  const finished = leg?.status === 'success';
  const blocked = busy || !!leg?.outcomeUnknown || finished;
  const expiry = order ? quoteExpiry(order) : null;
  const expired = expiry !== null && now >= expiry;
  async function prepare() {
    if (lock.current || blocked || !wallet || !stock || !parsed) return;
    lock.current = true; setBusy(true); setError(null); setOrder(null); submission.current = null;
    const owner = wallet.account.address;
    const nextLeg: ExecutionLeg = { id: crypto.randomUUID(), inputMint: USDC_MINT, outputMint: stock.mint, inputSymbol: 'USDC', outputSymbol: stock.symbol, inputAmount: parsed, status: 'quoting' };
    setLeg(nextLeg); setOrderOwner(owner);
    try {
      const balanceAmount = await checkUsdcBalance(client, owner, parsed);
      setBalance({ owner, amount: balanceAmount });
      const quote = await getLegOrder(nextLeg, owner);
      await assertOrderFresh(quote, validateLegOrder(quote, nextLeg), client);
      if (client.wallet.getState().connected?.account.address !== owner) throw new Error('Wallet changed. Request a new quote.');
      setOrder(quote); setNow(Date.now());
      setLeg({ ...nextLeg, status: 'idle', expectedOutputAmount: BigInt(quote.outAmount!), requestId: quote.requestId! });
    } catch (error) { setLeg({ ...nextLeg, status: 'failed', error: error instanceof Error ? error.message : 'Could not prepare the purchase.' }); }
    finally { lock.current = false; setBusy(false); }
  }
  async function buy() {
    if (lock.current || blocked || !leg || !order || !orderOwner || !wallet || wallet.account.address !== orderOwner) return;
    lock.current = true; setBusy(true); setError(null);
    try {
      await executeLeg(leg, orderOwner, order, client, setLeg, payload => { submission.current = payload; });
      setOrder(null);
      setBalance(null);
    } finally { lock.current = false; setBusy(false); }
  }
  async function reconcile() {
    if (lock.current || !submission.current || !leg) return;
    lock.current = true; setBusy(true); setError(null);
    try { setLeg(applyExecutionResult(leg, await submitLeg(submission.current))); }
    catch (error) { setError(error instanceof Error ? error.message : 'Could not check the submission.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <section className="panel investment-panel">
    <span className="eyebrow">DAY 2 · SINGLE MAINNET PURCHASE</span><h2>Buy NVDAx with USDC</h2>
    <p className="muted small">First verify one small purchase using your connected wallet. This executes a real mainnet swap.</p>
    {!registry && !registryError && <p role="status">Loading verified stocks…</p>}
    {registryError && <ErrorNotice error={registryError} />}
    {(issue || (registry && !stock)) && <p role="alert" className="error">{issue?.reason === 'ambiguous' ? 'NVDAx has ambiguous verified mints. Buying is disabled.' : 'Verified NVDAx is unavailable.'}</p>}
    {(registryError || issue) && <button className="text-button" disabled={blocked} onClick={() => { setRegistry(null); setRegistryError(null); setReload(n => n + 1); }}>Refresh stock registry</button>}
    {!wallet && <p className="muted small">Connect your Wallet Standard wallet using the button above.</p>}
    {wallet && !capable && <p role="alert" className="error">This wallet does not support signing without sending. Use a compatible Wallet Standard wallet.</p>}
    <label htmlFor="single-amount">Total investment · USDC</label>
    <div className="amount-field"><input id="single-amount" inputMode="decimal" value={amount} disabled={blocked} onChange={event => { setAmount(event.target.value); setOrder(null); setLeg(null); setError(null); }} /><span>USDC</span></div>
    {!parsed && <p className="error">Enter a positive USDC amount with up to six decimal places.</p>}
    {balance && wallet?.account.address === balance.owner && <p className="muted small">Checked wallet balance: {formatUsdc(balance.amount)} USDC</p>}
    <p className="muted small">Allocation: 100% NVDAx. SOL may be needed for network fees and token account creation; Jupiter will report if this order cannot be funded.</p>
    {stock && <p className="muted small" style={{ overflowWrap: 'anywhere' }}>Verified mint: {stock.mint}</p>}
    {!finished && <button className="button secondary full" disabled={!!blocked || !wallet || !capable || !stock || !!issue || !parsed} onClick={prepare}>{leg?.status === 'failed' ? 'Retry · Review fresh quote' : 'Review quote'}</button>}
    {order && leg && stock && <div className="preview"><h3>Review your purchase</h3><div className="preview-total"><span>Spend</span><strong>{formatUsdc(leg.inputAmount)} USDC</strong></div><div className="preview-total"><span>Expected received</span><strong>{tokenAmount(BigInt(order.outAmount!), stock.decimals)} NVDAx</strong></div><p className="small muted">Price impact: {order.priceImpact === null ? 'Unavailable' : `${order.priceImpact}%`} · Router: {order.router ?? 'Jupiter'}</p><p className="small muted">Slippage and priority fees are determined by Jupiter. Expected output can change within the quoted slippage.</p>{expired && <p className="error">Quote expired. Review a fresh quote.</p>}<button className="button primary full" disabled={!!blocked || expired || !capable || wallet?.account.address !== orderOwner} onClick={buy}>Buy {formatUsdc(leg.inputAmount)} USDC of NVDAx</button></div>}
    {leg && <div className="preview" aria-live="polite"><h3>{labels[leg.status]}</h3><p>{formatUsdc(leg.inputAmount)} USDC → NVDAx</p>{leg.error && <ErrorNotice error={leg.error} />}{leg.outcomeUnknown && <><p className="small muted">Do not start another purchase or reload while this outcome is unresolved. Checking resubmits the same signed transaction, without a new order.</p><button className="button secondary" disabled={busy} onClick={reconcile}>Check execution</button></>}{finished && <><p>Single-stock purchase completed.</p><p>{leg.receivedAmount !== undefined && stock ? `Received ${tokenAmount(leg.receivedAmount, stock.decimals)} NVDAx` : 'Received amount unavailable; inspect the transaction.'}</p><p className="muted small">Verify settlement and received tokens using the transaction receipt.</p></>}{leg.signature && <a className="text-button" target="_blank" rel="noreferrer" href={`https://solscan.io/tx/${leg.signature}`}>View on Solscan ↗</a>}</div>}
    {error && <ErrorNotice error={error} />}
  </section>;
}
