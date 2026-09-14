import { getBase64Encoder, getTransactionDecoder, isAddress } from '@solana/kit';
import type { ExecutePayload, JupiterExecutionResult, JupiterOrder } from '../../types/jupiter.ts';
import { record } from './normalize.ts';

export function isAtomicAmount(value: unknown): value is string {
  return typeof value === 'string' && /^(0|[1-9]\d{0,19})$/.test(value) && BigInt(value) <= 18_446_744_073_709_551_615n;
}
export function validateOrderParams(params: URLSearchParams) {
  const keys = ['inputMint', 'outputMint', 'amount', 'taker'];
  if ([...params.keys()].some(k => !keys.includes(k)) || keys.some(k => params.getAll(k).length !== 1)) throw new Error('Provide inputMint, outputMint, amount and taker exactly once.');
  const inputMint = params.get('inputMint')!;
  const outputMint = params.get('outputMint')!;
  const amount = params.get('amount')!;
  const taker = params.get('taker')!;
  if (![inputMint, outputMint, taker].every(isAddress)) throw new Error('Mints and taker must be valid Solana addresses.');
  if (inputMint === outputMint) throw new Error('Input and output mints must differ.');
  if (!isAtomicAmount(amount) || BigInt(amount) <= 0n) throw new Error('Amount must be a positive integer in token atomic units within the u64 range.');
  return { inputMint, outputMint, amount, taker };
}
export function decodeSwapTransaction(value: unknown) {
  if (typeof value !== 'string' || !value.length || value.length > 1644 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error('Invalid base64 transaction.');
  const bytes = getBase64Encoder().encode(value);
  if (bytes.length > 1232) throw new Error('Transaction exceeds the Solana size limit.');
  return getTransactionDecoder().decode(bytes);
}
export function validateExecutePayload(value: unknown): ExecutePayload {
  if (!record(value) || Object.keys(value).some(k => !['signedTransaction', 'requestId'].includes(k)) || typeof value.requestId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(value.requestId)) throw new Error('Provide a valid signedTransaction and requestId.');
  const transaction = decodeSwapTransaction(value.signedTransaction);
  if (!Object.values(transaction.signatures).some(signature => signature?.some(byte => byte !== 0))) throw new Error('Transaction has no signature.');
  return { signedTransaction: value.signedTransaction as string, requestId: value.requestId };
}
const text = (v: unknown) => typeof v === 'string' ? v : null;
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v) ? v : null;
const atomic = (v: unknown) => isAtomicAmount(v) ? v : null;
export function normalizeOrder(value: unknown): JupiterOrder {
  if (!record(value)) throw new Error('Invalid Jupiter order response.');
  const height = typeof value.lastValidBlockHeight === 'number' && Number.isSafeInteger(value.lastValidBlockHeight) ? String(value.lastValidBlockHeight) : value.lastValidBlockHeight;
  return {
    transaction: text(value.transaction), requestId: text(value.requestId),
    inputMint: text(value.inputMint), outputMint: text(value.outputMint),
    inAmount: atomic(value.inAmount), outAmount: atomic(value.outAmount),
    inUsdValue: number(value.inUsdValue), outUsdValue: number(value.outUsdValue),
    priceImpact: number(value.priceImpact), router: text(value.router),
    lastValidBlockHeight: atomic(height), expireAt: text(value.expireAt),
    errorCode: number(value.errorCode), errorMessage: text(value.errorMessage) ?? text(value.error),
  };
}
export function normalizeExecutionResult(value: unknown): JupiterExecutionResult {
  if (!record(value) || (value.status !== 'Success' && value.status !== 'Failed')) throw new Error('Jupiter execution outcome is not known yet.');
  return {
    status: value.status, signature: text(value.signature), code: number(value.code),
    totalInputAmount: atomic(value.totalInputAmount), totalOutputAmount: atomic(value.totalOutputAmount),
    inputAmountResult: atomic(value.inputAmountResult), outputAmountResult: atomic(value.outputAmountResult),
    error: text(value.error),
  };
}
