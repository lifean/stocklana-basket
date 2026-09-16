import type { AssetProvider } from '@/types/basket';
export const providerNames: Record<AssetProvider, string> = { xstocks: 'xStocks', prestocks: 'PreStocks', tessera: 'Tessera' };
export function ProviderBadge({ provider = 'xstocks', powered = false }: { provider?: AssetProvider; powered?: boolean }) {
  return <span className="tag provider-badge">{powered ? 'Powered by ' : ''}{providerNames[provider]}</span>;
}
