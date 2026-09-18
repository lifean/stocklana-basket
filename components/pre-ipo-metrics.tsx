import type { PreIpoAsset } from '@/types/pre-ipo';
import type { StockPrice, StockRegistry } from '@/types/stock';
import { calculatePremiumPercent, formatPremium, formatSignedPercent } from '@/lib/pre-ipo';
import { providerNames } from './provider-badge';
import { TokenIcon } from './token-identity';

const present = (n: number | null | undefined): n is number => n != null && Number.isFinite(n) && n >= 0;
const dollars = (n: number) => n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 2 });
const price = (n: number | null | undefined) => present(n) ? dollars(n) : '-';

export function PreIpoMetricsTable({ assets, prices, registry, provider }: {
  assets: PreIpoAsset[];
  prices: Record<string, StockPrice>;
  registry: StockRegistry | null;
  provider: PreIpoAsset['provider'];
}) {
  return <>
    <div className="private-market-table-scroll" role="region" aria-label="Private market token metrics" tabIndex={0}>
      <table className="private-market-table">
        <thead><tr>
          <th scope="col">Token</th><th scope="col" className="market-sector">Sector</th>
          <th scope="col">{providerNames[provider]} Mark Price</th>
          {provider === 'prestocks' && <th scope="col">PreStocks Token Price</th>}
          <th scope="col">Jupiter Market Price</th>
          <th scope="col">{provider === 'tessera' ? 'Market vs. Tessera Mark' : 'Token Price vs. Mark'}</th>
          <th scope="col">Mark Valuation</th><th scope="col">Implied Valuation</th>
          <th scope="col">Implied vs. Mark Valuation</th><th scope="col">Holders</th>
        </tr></thead>
        <tbody>{assets.map(asset => {
          const jupiterPrice = prices[asset.mint]?.usdPrice ?? null;
          const market = asset.provider === 'prestocks' ? asset.marketPrice : jupiterPrice;
          const premium = calculatePremiumPercent(market, asset.markPrice);
          const gap = calculatePremiumPercent(asset.impliedValuation, asset.markValuation);
          const stock = registry?.stocks.find(stock => stock.mint === asset.mint && stock.provider === asset.provider) ?? null;
          return <tr key={asset.mint}>
            <th scope="row"><div className="private-market-token"><TokenIcon stock={stock} name={asset.name} /><span>{asset.name}<small>{asset.symbol}</small></span></div></th>
            <td className="market-sector">{asset.sector || '-'}</td>
            <td>{price(asset.markPrice)}</td>
            {provider === 'prestocks' && <td>{price(asset.marketPrice)}</td>}
            <td>{price(jupiterPrice)}</td><td>{premium === null ? '-' : formatPremium(premium)}</td>
            <td>{price(asset.markValuation)}</td><td>{price(asset.impliedValuation)}</td>
            <td>{gap === null ? '-' : formatSignedPercent(gap)}</td><td>{present(asset.holders) ? asset.holders.toLocaleString() : '-'}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    <p className="small muted">Private-market data provided by {providerNames[provider]} · On-chain market price via Jupiter</p>
  </>;
}
