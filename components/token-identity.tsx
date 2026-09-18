'use client';
import Image from 'next/image';
import { useState } from 'react';
import type { BasketAsset } from '@/types/basket';
import type { StockAsset, StockRegistry } from '@/types/stock';
import { TokenAddressCopy } from './token-address-copy';

function imageUrl(value: string | null | undefined) {
  if (!value) return null;
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
}

function TokenIcon({ stock, name }: { stock: StockAsset | null; name: string }) {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [imageUrl(stock?.icon), imageUrl(stock?.preIpo?.image)].find(url => url && !failed.includes(url));
  return <span className="home-token-icon" aria-hidden="true">
    {src ? <Image src={src} alt="" width={28} height={28} unoptimized onError={() => setFailed(current => [...current, src])} /> : name[0]?.toUpperCase()}
  </span>;
}

export function TokenIdentity({ asset, registry, description }: { asset: BasketAsset; registry: StockRegistry | null | undefined; description?: string }) {
  const provider = asset.provider ?? 'xstocks';
  const matches = registry?.stocks.filter(stock => stock.symbol === asset.symbol && (stock.provider ?? 'xstocks') === provider) ?? [];
  const unavailable = registry?.unavailable.some(issue => issue.symbol === asset.symbol && (issue.provider ?? provider) === provider);
  const stock = !unavailable && matches.length === 1 && matches[0].mint ? matches[0] : null;
  return <>
    <TokenIcon stock={stock} name={asset.stockSymbol} />
    <span className="home-token-info">
      <span className="home-token-name">{asset.stockSymbol}</span>
      {description && <small className="token-description">{description}</small>}
      {stock ? <TokenAddressCopy key={stock.mint} mint={stock.mint} symbol={asset.symbol} /> : <span className="token-address-placeholder">{registry === undefined ? 'Loading address…' : 'Address unavailable'}</span>}
    </span>
  </>;
}
