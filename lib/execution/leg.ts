import {
  address, blockhash, getBase58Encoder, getBase64Decoder, getCompiledTransactionMessageDecoder,
  getTransactionEncoder, isTransactionModifyingSigner,
  type Transaction, type TransactionModifyingSigner,
} from '@solana/kit';
import type { AppClient } from '../solana/client.ts';
import type { ExecutionLeg } from '../../types/execution.ts';
import type { ExecutePayload, JupiterExecutionResult, JupiterOrder } from '../../types/jupiter.ts';
import { decodeSwapTransaction, isAtomicAmount, normalizeExecutionResult, normalizeOrder } from '../jupiter/swap-validation.ts';
import { USDC_MINT } from '../amounts.ts';

export function orderError(order: JupiterOrder): string {
  if (order.errorMessage) return order.errorMessage;
  if (order.errorCode === 1) return 'Insufficient USDC to fund this swap.';
  if (order.errorCode === 2 && order.router !== 'jupiterz') return 'Insufficient SOL for transaction fees or account creation.';
  if (order.errorCode === 2) return 'The required token account is missing.';
  return 'Jupiter could not build an executable route. Try a fresh quote.';
}
export function quoteExpiry(order: JupiterOrder): number | null {
  if (!order.expireAt) return null;
  const numeric = /^\d+(\.\d+)?$/.test(order.expireAt) ? Number(order.expireAt) : null;
  const expiry = numeric === null ? Date.parse(order.expireAt) : numeric < 1e12 ? numeric * 1000 : numeric;
  if (!Number.isFinite(expiry)) throw new Error('Jupiter returned an invalid quote expiry.');
  return expiry;
}
export function validateLegOrder(order: JupiterOrder, leg: ExecutionLeg, now = Date.now()) {
  if ((order.errorCode !== null && order.errorCode !== 0) || order.errorMessage || !order.transaction?.trim()) throw new Error(orderError(order));
  if (!order.requestId || !/^[A-Za-z0-9_-]{1,200}$/.test(order.requestId)) throw new Error('Jupiter order is missing a valid requestId.');
  if (order.inputMint !== leg.inputMint || order.outputMint !== leg.outputMint || order.inAmount !== leg.inputAmount.toString()) throw new Error('Jupiter order does not match the requested purchase.');
  if (!isAtomicAmount(order.outAmount) || BigInt(order.outAmount) <= 0n) throw new Error('No output available for this route.');
  const expiry = quoteExpiry(order);
  if (expiry !== null && now >= expiry) throw new Error('Quote expired. Request a fresh quote.');
  return decodeSwapTransaction(order.transaction);
}
const sameBytes = (a: ArrayLike<number>, b: ArrayLike<number>) => a.length === b.length && Array.from(a).every((byte, i) => byte === b[i]);
export async function signOrderTransaction(transaction: Transaction, signer: TransactionModifyingSigner) {
  if (!(signer.address in transaction.signatures)) throw new Error('The connected wallet is not a required signer of this order.');
  const [signed] = await signer.modifyAndSignTransactions([transaction]);
  if (!signed || !sameBytes(transaction.messageBytes, signed.messageBytes)) throw new Error('The wallet changed the Jupiter transaction. Request a fresh quote.');
  const walletSignature = signed.signatures[signer.address];
  if (!walletSignature?.some(byte => byte !== 0)) throw new Error('The wallet did not sign this transaction.');
  for (const [key, existing] of Object.entries(transaction.signatures)) {
    const returned = signed.signatures[address(key)];
    if (existing && returned && !sameBytes(existing, returned)) throw new Error('The wallet changed an existing signature.');
  }
  // Preserve pre-existing signatures and unsigned RFQ market-maker slots.
  const result = { ...transaction, signatures: { ...transaction.signatures, ...signed.signatures } };
  for (const [key, existing] of Object.entries(transaction.signatures)) {
    if (existing) result.signatures[address(key)] = existing;
  }
  return getBase64Decoder().decode(getTransactionEncoder().encode(result));
}
function requireWallet(client: AppClient, owner: string) {
  const connected = client.wallet.getState().connected;
  if (!connected || connected.account.address !== owner) throw new Error('Wallet disconnected or changed. Reconnect the original wallet.');
  if (!connected.signer || !isTransactionModifyingSigner(connected.signer)) throw new Error('This wallet must support signing transactions without sending them.');
  return connected.signer;
}
export async function checkUsdcBalance(client: AppClient, owner: string, amount: bigint) {
  requireWallet(client, owner);
  const signal = AbortSignal.timeout(12_000);
  const [genesis, accounts] = await Promise.all([
    client.rpc.getGenesisHash().send({ abortSignal: signal }),
    client.rpc.getTokenAccountsByOwner(address(owner), { mint: address(USDC_MINT) }, { encoding: 'jsonParsed', commitment: 'confirmed' }).send({ abortSignal: signal }),
  ]);
  if (genesis !== '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d') throw new Error('The configured RPC is not Solana mainnet.');
  const balance = accounts.value.reduce((sum, entry) => sum + BigInt(entry.account.data.parsed.info.tokenAmount.amount), 0n);
  if (balance < amount) throw new Error('Insufficient USDC balance.');
  return balance;
}
export async function assertOrderFresh(order: JupiterOrder, transaction: Transaction, client: AppClient) {
  const expiry = quoteExpiry(order);
  if (expiry !== null && Date.now() >= expiry) throw new Error('Quote expired. Request a fresh quote.');
  const signal = AbortSignal.timeout(12_000);
  if (order.lastValidBlockHeight) {
    const height = await client.rpc.getBlockHeight({ commitment: 'confirmed' }).send({ abortSignal: signal });
    if (height > BigInt(order.lastValidBlockHeight)) throw new Error('Transaction expired. Request a fresh quote.');
  } else if (expiry === null) {
    // Some routers omit the height. Validate the actual message blockhash instead.
    const message = getCompiledTransactionMessageDecoder().decode(transaction.messageBytes);
    const result = await client.rpc.isBlockhashValid(blockhash(message.lifetimeToken), { commitment: 'confirmed' }).send({ abortSignal: signal });
    if (!result.value) throw new Error('Transaction blockhash expired. Request a fresh quote.');
  }
  if (expiry !== null && Date.now() >= expiry) throw new Error('Quote expired. Request a fresh quote.');
}
export async function getLegOrder(leg: ExecutionLeg, owner: string): Promise<JupiterOrder> {
  const params = new URLSearchParams({ inputMint: leg.inputMint, outputMint: leg.outputMint, amount: leg.inputAmount.toString(), taker: owner });
  const response = await fetch(`/api/jupiter/order?${params}`, { cache: 'no-store', signal: AbortSignal.timeout(30_000) });
  const data = await response.json();
  if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Jupiter order request failed.');
  const order = normalizeOrder(data);
  validateLegOrder(order, leg);
  return order;
}
export class UnknownExecutionError extends Error {}
export async function submitLeg(payload: ExecutePayload): Promise<JupiterExecutionResult> {
  try {
    const response = await fetch('/api/jupiter/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(75_000) });
    const data = await response.json();
    if (!response.ok) throw new Error('Execution response unavailable.');
    return normalizeExecutionResult(data);
  } catch { throw new UnknownExecutionError('Execution outcome is unknown. Check this submission before making another purchase.'); }
}
export function applyExecutionResult(leg: ExecutionLeg, result: JupiterExecutionResult): ExecutionLeg {
  if (leg.status === 'success') return leg;
  if (result.status === 'Success') {
    if (!result.signature || !/^[1-9A-HJ-NP-Za-km-z]{64,88}$/.test(result.signature) || getBase58Encoder().encode(result.signature).length !== 64 || result.code !== 0) throw new UnknownExecutionError('Jupiter returned an incomplete success response. Check this submission.');
    return { ...leg, status: 'success', signature: result.signature, receivedAmount: result.totalOutputAmount === null ? undefined : BigInt(result.totalOutputAmount), error: undefined, outcomeUnknown: false };
  }
  // Unknown router errors must be reconciled before a fresh order could spend twice.
  const uncertain = result.code === null || [-1001, -2001].includes(result.code) || (!!leg.outcomeUnknown && !result.signature);
  return { ...leg, status: 'failed', signature: result.signature ?? undefined, error: result.error || `Jupiter execution failed (code ${result.code ?? 'unknown'}).`, outcomeUnknown: uncertain };
}
export async function executeLeg(leg: ExecutionLeg, owner: string, order: JupiterOrder, client: AppClient, onChange: (leg: ExecutionLeg) => void, onSubmission: (payload: ExecutePayload) => void): Promise<ExecutionLeg> {
  if (leg.status === 'success') return leg;
  let current = { ...leg };
  let submitted = false;
  const update = (patch: Partial<ExecutionLeg>) => { current = { ...current, ...patch }; onChange(current); };
  try {
    const transaction = validateLegOrder(order, leg);
    await checkUsdcBalance(client, owner, leg.inputAmount);
    await assertOrderFresh(order, transaction, client);
    update({ status: 'awaiting-signature', error: undefined, requestId: order.requestId!, expectedOutputAmount: BigInt(order.outAmount!) });
    const signedTransaction = await signOrderTransaction(transaction, requireWallet(client, owner));
    requireWallet(client, owner);
    await assertOrderFresh(order, transaction, client);
    const payload = { signedTransaction, requestId: order.requestId! };
    onSubmission(payload);
    submitted = true;
    update({ status: 'executing' });
    current = applyExecutionResult(current, await submitLeg(payload));
    onChange(current);
  } catch (error) {
    update({ status: 'failed', error: error instanceof Error ? error.message : 'Wallet request was declined or the swap failed.', outcomeUnknown: submitted });
  }
  return current;
}
