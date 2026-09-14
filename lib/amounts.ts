import type { BasketAsset } from '../types/basket.ts';
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const USDC_DECIMALS = 6;
export function parseUsdc(value: string): bigint {
  if (!/^\d{1,10}(\.\d{1,6})?$/.test(value.trim())) throw new Error('Enter a positive USDC amount with up to 6 decimal places (maximum 9,999,999,999.999999).');
  const [whole, fraction = ''] = value.trim().split('.');
  const amount = BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  if (amount <= 0n) throw new Error('Investment amount must be greater than zero.');
  return amount;
}
export function formatUsdc(amount: bigint): string {
  const fraction = (amount % 1_000_000n).toString().padStart(6, '0').replace(/0+$/, '');
  return `${amount / 1_000_000n}${fraction ? `.${fraction}` : ''}`;
}
// Largest remainders keep every atomic unit allocated, with stable tie-breaking.
export function allocateUsdc(amount: bigint, assets: BasketAsset[]): bigint[] {
  if (amount <= 0n || assets.some(a => !Number.isInteger(a.weightBps) || a.weightBps <= 0) || assets.reduce((sum, a) => sum + a.weightBps, 0) !== 10_000) throw new Error('Invalid allocation');
  const parts = assets.map(a => amount * BigInt(a.weightBps));
  const result = parts.map(p => p / 10_000n);
  const order = parts.map((p, i) => ({ i, remainder: p % 10_000n })).sort((a, b) => a.remainder === b.remainder ? a.i - b.i : a.remainder > b.remainder ? -1 : 1);
  const leftover = amount - result.reduce((sum, a) => sum + a, 0n);
  for (let i = 0; i < Number(leftover); i++) result[order[i].i]++;
  return result;
}
