import { PRESTOCKS_SYMBOLS } from './prestocks/normalize.ts';
import type { StockAsset } from '../types/stock.ts';
import { MVP_SYMBOLS } from './jupiter/normalize.ts';
import { TESSERA_SYMBOLS } from './tessera/normalize.ts';
// Only the server's resolved allowlist can enter the shared balance/execution paths.
export function isSupportedAsset(asset: StockAsset): boolean {
  if (asset.provider === 'tessera' || asset.provider === 'prestocks') return (asset.provider === 'tessera' ? TESSERA_SYMBOLS : PRESTOCKS_SYMBOLS).some(s => s === asset.symbol) && asset.preIpo?.provider === asset.provider && asset.preIpo.mint === asset.mint && asset.preIpo.symbol === asset.symbol && Number.isInteger(asset.decimals) && asset.decimals >= 0 && asset.decimals <= 255;
  return (!asset.provider || asset.provider === 'xstocks') && asset.isVerified && MVP_SYMBOLS.includes(asset.symbol);
}
