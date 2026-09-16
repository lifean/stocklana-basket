import type { PreIpoAsset } from '@/types/pre-ipo';
import { premiumPercent } from '@/lib/tessera/normalize';
const dollars = (value: number | null) => value === null ? 'Unavailable' : value.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
export function TesseraData({ asset, marketPrice, compact = false }: { asset: PreIpoAsset; marketPrice: number | null; compact?: boolean }) {
  const premium = premiumPercent(asset.markPrice, marketPrice);
  return <div className="tessera-data small">
    {!compact && <><h3>{asset.symbol}</h3><p>{asset.name} <span className="tag">Tessera</span></p><dl><div><dt>Sector</dt><dd>{asset.sector ?? 'Unavailable'}</dd></div><div><dt>Mark Valuation</dt><dd>{dollars(asset.markValuation)}</dd></div><div><dt>Holders</dt><dd>{asset.holders?.toLocaleString() ?? 'Unavailable'}</dd></div></dl></>}
    <dl><div><dt>{compact ? 'Mark' : 'Tessera Mark Price'}</dt><dd>{dollars(asset.markPrice)}</dd></div><div><dt>{compact ? 'Market' : 'Jupiter Market Price'}</dt><dd>{marketPrice === null ? 'Market price unavailable' : dollars(marketPrice)}</dd></div></dl>
    <p className="muted">Market vs. Tessera Mark<br /><strong>{premium === null ? 'Unavailable' : Math.abs(premium) < 0.005 ? '0.00% · At mark' : `${premium > 0 ? '+' : ''}${premium.toFixed(2)}% ${premium > 0 ? 'Premium' : 'Discount'}`}</strong></p>
  </div>;
}
