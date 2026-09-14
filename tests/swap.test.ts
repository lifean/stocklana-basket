import assert from 'node:assert/strict';
import test from 'node:test';
import { address, getBase58Decoder, getBase64Decoder, getCompiledTransactionMessageEncoder, getTransactionEncoder, type SignatureBytes, type Transaction, type TransactionModifyingSigner } from '@solana/kit';
import { applyExecutionResult, executeLeg, signOrderTransaction, validateLegOrder } from '../lib/execution/leg.ts';
import { decodeSwapTransaction, normalizeExecutionResult, normalizeOrder, validateExecutePayload, validateOrderParams } from '../lib/jupiter/swap-validation.ts';
import { USDC_MINT } from '../lib/amounts.ts';
import type { ExecutionLeg } from '../types/execution.ts';
import type { AppClient } from '../lib/solana/client.ts';

// Synthetic wire fixtures ONLY: known addresses, no private keys or real signatures.
const owner = address(USDC_MINT);
const other = address('So11111111111111111111111111111111111111112');
const messageBytes = getCompiledTransactionMessageEncoder().encode({ version: 0, header: { numSignerAccounts: 2, numReadonlySignerAccounts: 0, numReadonlyNonSignerAccounts: 0 }, staticAccounts: [owner, other], lifetimeToken: USDC_MINT, instructions: [], addressTableLookups: [] }) as Transaction['messageBytes'];
const transaction: Transaction = { messageBytes, signatures: { [owner]: null, [other]: null } };
const encoded = getBase64Decoder().decode(getTransactionEncoder().encode(transaction));
const leg: ExecutionLeg = { id: 'unit-leg', inputMint: USDC_MINT, outputMint: other, inputSymbol: 'USDC', outputSymbol: 'fixture', inputAmount: 1_000_000n, status: 'idle' };
const order = normalizeOrder({ transaction: encoded, requestId: 'unit-request', inputMint: leg.inputMint, outputMint: leg.outputMint, inAmount: '1000000', outAmount: '42', lastValidBlockHeight: '100', router: 'jupiterz' });
function signer(sign: () => Promise<Transaction>): TransactionModifyingSigner {
  return { address: owner, modifyAndSignTransactions: async () => [await sign()] } as unknown as TransactionModifyingSigner;
}
const fakeSignature = new Uint8Array(64).fill(1) as SignatureBytes;
const sign = signer(async () => ({ ...transaction, signatures: { ...transaction.signatures, [owner]: fakeSignature } }));
const client = {
  wallet: { getState: () => ({ connected: { account: { address: owner }, signer: sign } }) },
  rpc: {
    getGenesisHash: () => ({ send: async () => '5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d' }),
    getBlockHeight: () => ({ send: async () => 10n }),
    getTokenAccountsByOwner: () => ({ send: async () => ({ value: [{ account: { data: { parsed: { info: { tokenAmount: { amount: '10000000' } } } } } }] }) }),
  },
} as unknown as AppClient;

test('order validation rejects duplicated, missing, invalid and unsafe query values', () => {
  const params = new URLSearchParams({ inputMint: USDC_MINT, outputMint: other, amount: '1000000', taker: owner });
  assert.equal(validateOrderParams(params).amount, '1000000');
  for (const amount of ['0', '-1', '1e6', '1.5', '18446744073709551616']) { const p = new URLSearchParams(params); p.set('amount', amount); assert.throws(() => validateOrderParams(p)); }
  params.append('taker', owner); assert.throws(() => validateOrderParams(params));
});
test('null, empty, error, mismatched and expired orders cannot be signed', () => {
  for (const invalid of [{ transaction: null }, { transaction: '' }, { requestId: null }, { errorCode: 2 }, { inAmount: '2' }, { outputMint: USDC_MINT }, { expireAt: '2020-01-01T00:00:00Z' }]) assert.throws(() => validateLegOrder({ ...order, ...invalid }, leg));
  assert.ok(validateLegOrder(order, leg));
});
test('partial wallet signing preserves the market-maker slot and existing signatures', async () => {
  const signed = decodeSwapTransaction(await signOrderTransaction(transaction, sign));
  assert.deepEqual(signed.signatures[owner], fakeSignature);
  assert.equal(signed.signatures[other], null);
  const existing = { ...transaction, signatures: { ...transaction.signatures, [other]: fakeSignature } };
  const result = decodeSwapTransaction(await signOrderTransaction(existing, sign));
  assert.deepEqual(result.signatures[other], fakeSignature);
});
test('wallet modification and missing wallet signatures are rejected', async () => {
  await assert.rejects(() => signOrderTransaction(transaction, signer(async () => transaction)), /did not sign/);
  await assert.rejects(() => signOrderTransaction(transaction, signer(async () => ({ ...transaction, messageBytes: new Uint8Array([1]) as unknown as Transaction['messageBytes'] }))), /changed the Jupiter transaction/);
});
test('execute input rejects unsigned, malformed, oversized and unexpected fields', async () => {
  for (const value of [{ signedTransaction: encoded, requestId: 'test' }, { signedTransaction: 'bad', requestId: 'test' }, { signedTransaction: 'A'.repeat(2000), requestId: 'test' }]) assert.throws(() => validateExecutePayload(value));
  const valid = { signedTransaction: await signOrderTransaction(transaction, sign), requestId: 'test' };
  assert.deepEqual(validateExecutePayload(valid), valid);
  assert.throws(() => validateExecutePayload({ ...valid, privateKey: 'forbidden-extra-field' }));
});
test('success requires a complete execute response and cannot be rolled back', () => {
  assert.throws(() => normalizeExecutionResult({ signature: 'x' }));
  const result = normalizeExecutionResult({ status: 'Success', code: 0, signature: getBase58Decoder().decode(fakeSignature), totalOutputAmount: '42' });
  const success = applyExecutionResult(leg, result);
  assert.equal(success.status, 'success'); assert.equal(success.receivedAmount, 42n);
  assert.equal(applyExecutionResult(success, { ...result, status: 'Failed' }), success);
  assert.throws(() => applyExecutionResult(leg, { ...result, signature: null }));
});
test('single leg only succeeds after execute, and transport loss blocks a fresh purchase', async () => {
  const originalFetch = globalThis.fetch;
  const statuses: string[] = [];
  try {
    globalThis.fetch = async () => Response.json({ status: 'Success', code: 0, signature: getBase58Decoder().decode(fakeSignature), totalOutputAmount: '42' });
    const result = await executeLeg(leg, owner, order, client, l => statuses.push(l.status), () => {});
    assert.deepEqual(statuses, ['awaiting-signature', 'executing', 'success']); assert.equal(result.receivedAmount, 42n);
    globalThis.fetch = async () => { throw new Error('Network dropped after submission'); };
    const unknown = await executeLeg(leg, owner, order, client, () => {}, () => {});
    assert.equal(unknown.status, 'failed'); assert.equal(unknown.outcomeUnknown, true);
  } finally { globalThis.fetch = originalFetch; }
});
test('wallet rejection never calls execute and is safe to retry with a fresh quote', async () => {
  const rejectedSigner = signer(async () => { throw new Error('Wallet rejected signature'); });
  const rejecting = {
    ...client,
    wallet: { getState: () => ({ connected: { account: { address: owner }, signer: rejectedSigner } }) },
  } as unknown as AppClient;
  let submitted = false;
  const result = await executeLeg(leg, owner, order, rejecting, () => {}, () => { submitted = true; });
  assert.equal(submitted, false); assert.equal(result.status, 'failed'); assert.equal(result.outcomeUnknown, false);
  assert.match(result.error!, /rejected/);
});
