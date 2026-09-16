import type { PreIpoAsset } from '@/types/pre-ipo';
import { referenceGapPercent } from '@/lib/prestocks/normalize';
const money = (n: number | null | undefined) => n == null ? 'Unavailable' : n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const percent = (n: number | null) => n === null ? 'Unavailable' : `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
export function PreStocksData({ asset, jupiterPrice, compact = false }: { asset: PreIpoAsset; jupiterPrice: number | null; compact?: boolean }) {
  const premium = referenceGapPercent(asset.markPrice, asset.marketPrice);
  const gap = referenceGapPercent(asset.markValuation, asset.impliedValuation);
  return <div className="tessera-data prestocks-data small">
    {!compact && <><h3>{asset.name}</h3><span className="tag">PreStocks</span><dl><div><dt>Mark Valuation</dt><dd>{money(asset.markValuation)}</dd></div><div><dt>Implied Valuation</dt><dd>{money(asset.impliedValuation)}</dd></div><div><dt>Implied vs. Mark Valuation</dt><dd>{percent(gap)}</dd></div></dl></>}
    <dl><div><dt>PreStocks Mark Price</dt><dd>{money(asset.markPrice)}</dd></div><div><dt>PreStocks Token Price</dt><dd>{money(asset.marketPrice)}</dd></div><div><dt>Jupiter Market Price</dt><dd>{jupiterPrice === null ? 'Market price unavailable' : money(jupiterPrice)}</dd></div></dl>
    <p className="muted">Market Premium<br /><strong>{percent(premium)}{premium === null ? '' : Math.abs(premium) < 0.005 ? ' · At mark' : premium > 0 ? ' Premium' : ' Discount'}</strong></p>
  </div>;
}
