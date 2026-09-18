import type { Basket } from '@/types/basket';
import type { StockRegistry } from '@/types/stock';
import { TokenIdentity } from './token-identity';

export function BasketAllocation({ basket, registry }: { basket: Basket; registry: StockRegistry | null | undefined }) {
  const exposure = basket.provider === 'prestocks' ? 'PreStocks exposure' : basket.provider === 'tessera' ? 'Tessera T-Token exposure' : 'Tokenized equity';
  return <section className="panel">
    <span className="eyebrow">THE STRATEGY</span><h2>Target allocation</h2>
    <dl className="target-list target-token-list">
      {basket.assets.map(asset => <div key={asset.symbol}>
        <dt><TokenIdentity asset={asset} registry={registry} description={`${asset.symbol} · ${exposure}`} /></dt>
        <dd>{asset.weightBps / 100}%</dd>
      </div>)}
    </dl>
    <p className="muted small">Each allocation is held as an individual token. You keep control of your wallet.</p>
  </section>;
}
