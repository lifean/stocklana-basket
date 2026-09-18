'use client';
import { useEffect, useId, useState } from 'react';
import { BasketAllocation } from './basket-allocation';
import { BasketPurchase } from './basket-purchase';
import { PreIpoMetrics } from './pre-ipo-metrics';
import { PreIpoNotice } from './pre-ipo-notice';
import { ProviderBadge, providerNames } from './provider-badge';
import { calculateBasketPremium, formatSignedPercent } from '@/lib/pre-ipo';
import type { PreIpoAsset, PreIpoRegistry } from '@/types/pre-ipo';
import { ErrorNotice } from './error-notice';
import { address } from '@solana/kit';
import { useClient } from '@solana/react';
import { useWalletConnection } from '@/lib/solana/use-wallet-connection';
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
  const formId = useId();
  const client = useClient<AppClient>();
  const { wallet: connected, restoring } = useWalletConnection(client);
  const owner = connected?.account.address;
  const [executionStarted, setExecutionStarted] = useState(false);
  const [amount, setAmount] = useState('100');
  const [preview, setPreview] = useState<bigint | null>(null);
  const [validation, setValidation] = useState<string | null>(null);
  const [registry, setRegistry] = useState<StockRegistry | null>(null);
  const [fetchedAt, setFetchedAt] = useState<number | null>(null);
  const isPreIpo = basket.provider === 'tessera' || basket.provider === 'prestocks';
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
        const data = await getJson<StockRegistry | PreIpoRegistry>(basket.provider === 'prestocks' ? '/api/prestocks' : basket.provider === 'tessera' ? '/api/tessera' : '/api/stocks', controller.signal);
        if (controller.signal.aborted) return;
        setRegistry(data);
        if ('assets' in data) { setPreIpoAssets(data.assets); setFetchedAt(data.fetchedAt ?? null); }
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
  const weighted = calculateBasketPremium(preIpoAssets, basket.assets, prices);
  const allocations = preview !== null ? allocateUsdc(preview, basket.assets) : [];
  function updateAmount(value: string) { setAmount(value); setPreview(null); setValidation(null); }
  function refreshData() { setLoading(true); setDataError(null); setRegistry(null); setPreIpoAssets([]); setFetchedAt(null); setPrices({}); setRefresh(n => n + 1); }
  const overview = <><span className="eyebrow">MAKE IT YOURS</span><h2>Start with USDC</h2>
    <form id={formId} onSubmit={event => { event.preventDefault(); try { const value = parseUsdc(amount); setValidation(null); setPreview(value); } catch (error) { setPreview(null); setValidation((error as Error).message); } }}>
      <fieldset disabled={executionStarted}><label htmlFor="investment-amount">Investment Amount</label><div className="amount-field"><input id="investment-amount" inputMode="decimal" autoComplete="off" value={amount} onChange={e => updateAmount(e.target.value)} aria-invalid={!!validation} aria-describedby={validation ? 'amount-error' : undefined} /><span>USDC</span></div>
      <div className="quick-select">{[25, 50, 100].map(value => <button type="button" className={amount === String(value) ? 'selected' : ''} key={value} onClick={() => updateAmount(String(value))}>${value}</button>)}</div>
      <div className="balance-line small muted">{restoring ? <span role="status">Restoring wallet…</span> : owner ? <><span>{balance?.error ? 'USDC balance unavailable. Check your RPC connection.' : balance?.amount !== null && balance?.amount !== undefined ? `Wallet balance: ${formatUsdc(balance.amount)} USDC` : 'Loading USDC balance…'}</span><button className="text-button" type="button" onClick={() => { setBalanceState(null); setBalanceRefresh(n => n + 1); }}>Refresh</button></> : 'Connect your wallet to see your USDC balance. You can preview without connecting.'}</div>
      {validation && <p role="alert" className="error" id="amount-error">{validation}</p>}
      {balance?.amount === 0n && !executionStarted && <p className="small muted">Your wallet has no USDC. Add mainnet USDC and some SOL for network fees to invest.</p>}
      {insufficient && <p role="alert" className="error">Insufficient USDC balance for this investment. You can still review the allocation.</p>}
      </fieldset>
    </form>
    <div className="market-status" aria-live="polite">{loading ? <p className="muted small">Loading {isPreIpo ? providerNames[basket.provider!] : 'verified stock'} data and Jupiter prices…</p> : <><p className="small muted">{isPreIpo ? `Private-market data provided by ${providerNames[basket.provider!]}` : 'Market data from Jupiter'} <button className="text-button" disabled={executionStarted} onClick={refreshData}>Refresh</button></p>{dataError && <ErrorNotice error={dataError} />}{registry?.unavailable.filter(s => basket.assets.some(a => a.symbol === s.symbol)).map(s => <p className="error small" key={s.symbol}>{s.symbol}: {s.message ?? (s.reason === 'ambiguous' ? 'Multiple verified mints found. Unavailable until the canonical mint is confirmed.' : 'Verified stock unavailable.')}</p>)}</>}</div>
  </>;
  const previewContent = preview !== null ? <div className="preview" aria-live="polite"><span className="eyebrow">INVESTMENT PREVIEW</span><h3>Invest {formatUsdc(preview)} USDC</h3>{isPreIpo && <p>{basket.name}</p>}<div className="preview-legs">{basket.assets.map((asset, i) => {
      const stock = registry?.stocks.find(s => s.symbol === asset.symbol);
      const price = stock ? prices[stock.mint]?.usdPrice : null;
      const shares = price ? Number(allocations[i]) / 1_000_000 / price : null;
      const issue = registry?.unavailable.find(s => s.symbol === asset.symbol);
      return <div className="preview-leg" key={asset.symbol}><div><strong>{isPreIpo ? asset.displaySymbol ?? asset.stockSymbol : asset.symbol}</strong>{isPreIpo && <span className="muted small">{asset.weightBps / 100}% target allocation</span>}<span className="muted small">{loading ? 'Loading estimate…' : issue?.reason === 'ambiguous' ? 'Ambiguous stock symbol' : !stock ? 'Stock unavailable' : shares === null ? 'Price unavailable' : `≈ ${shares.toLocaleString(undefined, { maximumFractionDigits: Math.min(stock.decimals, 8) })} estimated tokens`}</span></div><strong>{formatUsdc(allocations[i])} <span className="muted small">USDC</span></strong></div>;
    })}</div><div className="preview-total"><strong>Total</strong><strong>{formatUsdc(preview)} USDC</strong></div><p className="muted small">Indicative estimates using current USD prices and 1 USDC ≈ $1. These are token units, not a swap quote; fees, slippage, and issuer share ratios are not included.</p></div> : null;
  const canReview = preview !== null && registry && !loading && (!dataError || basket.provider === 'tessera' || basket.provider === 'prestocks') && !registry.unavailable.some(s => basket.assets.some(a => a.symbol === s.symbol));
  return <div className="basket-grid">
    <div className="basket-strategy"><BasketAllocation basket={basket} registry={registry ?? (loading ? undefined : null)} />
      {isPreIpo && <details className="panel private-market-details"><summary>Private Market Data<span className="small muted">Prices, valuations & provider details</span></summary>{fetchedAt && <p className="small muted">Sponsor data updated <time dateTime={new Date(fetchedAt).toISOString()}>{new Date(fetchedAt).toLocaleTimeString()}</time> · Refresh may use the 60-second cache.</p>}{preIpoAssets.map(asset => <PreIpoMetrics key={asset.mint} asset={asset} jupiterPrice={prices[asset.mint]?.usdPrice ?? null} />)}<p className="small muted">Marks are reference values, not guaranteed fair value. Premium and valuation differences are informational, not expected returns.</p>{isPreIpo && <><p><ProviderBadge provider={basket.provider} powered /></p><div className="weighted-premium"><strong>{basket.provider === 'tessera' ? 'Basket vs. Tessera Mark' : 'Basket vs. Mark'}</strong><p>{formatSignedPercent(basket.provider === 'tessera' && weighted.coveredBps !== 10000 ? null : weighted.value)}</p><p className="small muted">{basket.provider === 'prestocks' ? 'Weighted difference between current PreStocks token prices and PreStocks mark prices.' : 'Weighted difference between Jupiter on-chain market prices and Tessera mark prices.'}</p>{weighted.coveredBps < 10000 && <p className="small muted">{basket.provider === 'tessera' ? 'Unavailable until all components have valid prices.' : `Partial data: ${weighted.coveredBps / 100}% of target allocation covered; remaining weights are not rescaled.`} Missing: {weighted.excludedSymbols.join(', ')}.</p>}</div></>}<PreIpoNotice /></details>}
    </div>
    <section className="panel investment-panel" aria-label="Basket investment" tabIndex={0}>
      <div className="investment-overview">{overview}</div>
      {canReview && preview !== null && registry ? <BasketPurchase availableBalance={balance?.amount ?? null} onStarted={() => setExecutionStarted(true)} key={`${basket.id}:${preview}`} basket={basket} amount={preview} registry={registry} previewContent={previewContent} /> : <>
        {previewContent && <div className="investment-details">{previewContent}</div>}
        <div className="investment-actions"><button className="button primary full" type="submit" form={formId} disabled={executionStarted}>Preview Investment <span>→</span></button></div>
      </>}
    </section>
  </div>;
}
