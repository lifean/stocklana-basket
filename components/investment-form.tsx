'use client';
import { useEffect, useState } from 'react';
import { BasketPurchase } from './basket-purchase';
import { TesseraData } from './tessera-data';
import type { PreIpoAsset, TesseraRegistry } from '@/types/pre-ipo';
import { ErrorNotice } from './error-notice';
import { address } from '@solana/kit';
import { useClient } from '@solana/react';
import { useConnectedWallet } from '@solana/kit-plugin-wallet/react';
import type { AppClient } from '@/lib/solana/client';
import type { Basket } from '@/types/basket';
import type { StockRegistry, StockPrice } from '@/types/stock';
import { allocateUsdc, formatUsdc, parseUsdc, USDC_MINT } from '@/lib/amounts';

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Could not load market data.');
  return data as T;
}
export function InvestmentForm({ basket }: { basket: Basket }) {
  const client = useClient<AppClient>();
  const connected = useConnectedWallet(client);
  const owner = connected?.account.address;
  const [executionStarted, setExecutionStarted] = useState(false);
  const [amount, setAmount] = useState('100');
  const [preview, setPreview] = useState<bigint | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [registry, setRegistry] = useState<StockRegistry | null>(null);
  const [preIpoAssets, setPreIpoAssets] = useState<PreIpoAsset[]>([]);
  const [prices, setPrices] = useState<Record<string, StockPrice>>({});
  const [dataError, setDataError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [balanceState, setBalanceState] = useState<{ owner: string; amount: bigint | null; error: boolean } | null>(null);
  const [balanceRefresh, setBalanceRefresh] = useState(0);
  const balance = owner && balanceState?.owner === owner ? balanceState : null;
  useEffect(() => {
    try { localStorage.setItem('stocklana.activeBasket', basket.id); } catch { /* Storage may be disabled. */ }
  }, [basket.id]);
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const data = await getJson<StockRegistry | TesseraRegistry>(basket.provider === 'tessera' ? '/api/tessera' : '/api/stocks', controller.signal);
        if (controller.signal.aborted) return;
        setRegistry(data);
        if ('assets' in data) setPreIpoAssets(data.assets);
        const ids = 'assets' in data ? data.assets.map(s => s.mint) : data.stocks.map(s => s.mint);
        const livePrices = ids.length ? await getJson<Record<string, StockPrice>>(`/api/prices?ids=${ids.join(',')}`, controller.signal) : {};
        if (!controller.signal.aborted) setPrices(livePrices);
      } catch (error) {
        if (!controller.signal.aborted) setDataError(error instanceof Error ? error.message : 'Market data is unavailable.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [refresh, basket.provider]);
  useEffect(() => {
    if (!owner) return;
    const controller = new AbortController();
    async function loadBalance() {
      try {
        const response = await client.rpc.getTokenAccountsByOwner(address(owner!), { mint: address(USDC_MINT) }, { encoding: 'jsonParsed', commitment: 'confirmed' }).send({ abortSignal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        const total = response.value.reduce((sum, entry) => sum + BigInt(entry.account.data.parsed.info.tokenAmount.amount), 0n);
        if (!controller.signal.aborted) setBalanceState({ owner: owner!, amount: total, error: false });
      } catch { if (!controller.signal.aborted) setBalanceState({ owner: owner!, amount: null, error: true }); }
    }
    void loadBalance();
    const timer = setInterval(() => void loadBalance(), 30_000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [client, owner, balanceRefresh]);
  let parsed: bigint | null = null;
  try { parsed = parseUsdc(amount); } catch { /* Shown on submission. */ }
  const insufficient = parsed !== null && balance?.amount !== null && balance?.amount !== undefined && parsed > balance.amount;
  const allocations = preview !== null ? allocateUsdc(preview, basket.assets) : [];
  function updateAmount(value: string) { setAmount(value); setPreview(null); setValidation(null); }
  function refreshData() { setLoading(true); setDataError(null); setRegistry(null); setPreIpoAssets([]); setPrices({}); setRefresh(n => n + 1); }
  return <section className="panel investment-panel"><span className="eyebrow">MAKE IT YOURS</span><h2>Start with USDC</h2>
    <form onSubmit={event => { event.preventDefault(); try { const value = parseUsdc(amount); setValidation(null); setPreview(value); } catch (error) { setPreview(null); setValidation((error as Error).message); } }}>
      <fieldset disabled={executionStarted}><label htmlFor="investment-amount">Investment Amount</label><div className="amount-field"><input id="investment-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={e => updateAmount(e.target.value)} aria-invalid={!!validation} aria-describedby={validation ? 'amount-error' : undefined} /><span>USDC</span></div>
      <div className="quick-select">{[25, 50, 100].map(value => <button type="button" className={amount === String(value) ? 'selected' : ''} key={value} onClick={() => updateAmount(String(value))}>${value}</button>)}</div>
      <div className="balance-line small muted">{owner ? <><span>{balance?.error ? 'USDC balance unavailable. Check your RPC connection.' : balance?.amount !== null && balance?.amount !== undefined ? `Wallet balance: ${formatUsdc(balance.amount)} USDC` : 'Loading USDC balance…'}</span><button className="text-button" type="button" onClick={() => { setBalanceState(null); setBalanceRefresh(n => n + 1); }}>Refresh</button></> : 'Connect your wallet to see your USDC balance. You can preview without connecting.'}</div>
      {validation && <p role="alert" className="error" id="amount-error">{validation}</p>}
      {balance?.amount === 0n && !executionStarted && <p className="small muted">Your wallet has no USDC. Add mainnet USDC and some SOL for network fees to invest.</p>}
      {insufficient && <p role="alert" className="error">Insufficient USDC balance for this investment. You can still review the allocation.</p>}
      <button className="button primary full" type="submit">Preview Investment <span>→</span></button></fieldset>
    </form>
    <div className="market-status" aria-live="polite">{loading ? <p className="muted small">Loading verified stock metadata and Jupiter prices…</p> : <><p className="small muted">Market data from Jupiter <button className="text-button" disabled={executionStarted} onClick={refreshData}>Refresh</button></p>{dataError && <ErrorNotice error={dataError} />}{registry?.unavailable.filter(s => basket.assets.some(a => a.symbol === s.symbol)).map(s => <p className="error small" key={s.symbol}>{s.symbol}: {s.message ?? (s.reason === 'ambiguous' ? 'Multiple verified mints found. Unavailable until the canonical mint is confirmed.' : 'Verified stock unavailable.')}</p>)}</>}</div>
    {basket.provider === 'tessera' && <section aria-label="Tessera reference data"><span className="tag">Tessera · Pre-IPO</span>{preIpoAssets.map(asset => <TesseraData key={asset.mint} asset={asset} marketPrice={prices[asset.mint]?.usdPrice ?? null} />)}<p className="small muted">Tessera marks are private-market reference values, not guaranteed fair value or expected returns. T-Tokens provide tokenized pre-IPO exposure, not direct ownership of company shares.</p><p className="small muted">Pre-IPO token availability may vary by jurisdiction. This application is a hackathon demo and does not provide investment advice.</p></section>}
    {preview !== null && <div className="preview" aria-live="polite"><span className="eyebrow">INVESTMENT PREVIEW</span><h3>Invest {formatUsdc(preview)} USDC</h3><div className="preview-legs">{basket.assets.map((asset, i) => {
      const stock = registry?.stocks.find(s => s.symbol === asset.symbol);
      const price = stock ? prices[stock.mint]?.usdPrice : null;
      const shares = price ? Number(allocations[i]) / 1_000_000 / price : null;
      const preIpo = preIpoAssets.find(s => s.symbol === asset.symbol);
      const issue = registry?.unavailable.find(s => s.symbol === asset.symbol);
      return <div className="preview-leg" key={asset.symbol}><div><strong>{asset.symbol}</strong><span className="muted small">{loading ? 'Loading estimate…' : issue?.reason === 'ambiguous' ? 'Ambiguous stock symbol' : !stock ? 'Stock unavailable' : shares === null ? 'Price unavailable' : `≈ ${shares.toLocaleString(undefined, { maximumFractionDigits: Math.min(stock.decimals, 8) })} estimated shares`}</span>{preIpo && <TesseraData compact asset={preIpo} marketPrice={price ?? null} />}</div><strong>{formatUsdc(allocations[i])} <span className="muted small">USDC</span></strong></div>;
    })}</div><div className="preview-total"><strong>Total</strong><strong>{formatUsdc(preview)} USDC</strong></div><p className="muted small">Indicative estimates using current USD prices and 1 USDC ≈ $1. These are token units, not a swap quote; fees, slippage, and issuer share ratios are not included.</p>{registry && !loading && (!dataError || basket.provider === 'tessera') && !registry.unavailable.some(s => basket.assets.some(a => a.symbol === s.symbol)) && <BasketPurchase availableBalance={balance?.amount ?? null} onStarted={() => setExecutionStarted(true)} key={`${basket.id}:${preview}`} basket={basket} amount={preview} registry={registry} />}</div>}
  </section>;
}
