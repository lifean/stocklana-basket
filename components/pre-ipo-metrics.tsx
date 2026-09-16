import type { PreIpoAsset } from '@/types/pre-ipo';
import { calculatePremiumPercent, formatPremium, formatSignedPercent } from '@/lib/pre-ipo';
import { ProviderBadge, providerNames } from './provider-badge';
const present = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n >= 0;
const dollars = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
export function PreIpoMetrics({ asset, jupiterPrice, compact = false }: { asset: PreIpoAsset; jupiterPrice: number | null; compact?: boolean }) {
  const market = asset.provider === 'prestocks' ? asset.marketPrice : jupiterPrice;
  const premium = calculatePremiumPercent(market, asset.markPrice);
  const gap = calculatePremiumPercent(asset.impliedValuation, asset.markValuation);
  const provider = providerNames[asset.provider];
  return <div className="preipo-metrics small">
    {!compact && <><h3>{asset.name}</h3><ProviderBadge provider={asset.provider} /><dl>
      {asset.sector && <div><dt>Sector</dt><dd>{asset.sector}</dd></div>}
      {present(asset.markValuation) && <div><dt>Mark Valuation</dt><dd>{dollars(asset.markValuation)}</dd></div>}
      {present(asset.impliedValuation) && <div><dt>Implied Valuation</dt><dd>{dollars(asset.impliedValuation)}</dd></div>}
      {gap !== null && <div><dt>Implied vs. Mark Valuation</dt><dd>{formatSignedPercent(gap)}</dd></div>}
      {present(asset.holders) && <div><dt>Holders</dt><dd>{asset.holders.toLocaleString()}</dd></div>}
    </dl></>}
    <dl>
      {present(asset.markPrice) && <div><dt>{provider} Mark Price</dt><dd>{dollars(asset.markPrice)}</dd></div>}
      {asset.provider === 'prestocks' && present(asset.marketPrice) && <div><dt>PreStocks Token Price</dt><dd>{dollars(asset.marketPrice)}</dd></div>}
      {present(jupiterPrice) && <div><dt>Jupiter Market Price</dt><dd>{dollars(jupiterPrice)}</dd></div>}
    </dl>
    {!present(jupiterPrice) && <p className="muted">Jupiter market price unavailable</p>}
    <p className="muted">{asset.provider === 'tessera' ? 'Market vs. Tessera Mark' : 'Token Price vs. Mark'}<br /><strong>{formatPremium(premium)}</strong></p>
    {!compact && <p className="muted">Private-market data provided by {provider}<br />On-chain market price via Jupiter</p>}
  </div>;
}
