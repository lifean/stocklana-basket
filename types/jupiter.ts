export interface JupiterOrder {
  transaction: string | null;
  requestId: string | null;
  inputMint: string | null;
  outputMint: string | null;
  inAmount: string | null;
  outAmount: string | null;
  inUsdValue: number | null;
  outUsdValue: number | null;
  priceImpact: number | null;
  router: string | null;
  lastValidBlockHeight: string | null;
  expireAt: string | null;
  errorCode: number | null;
  errorMessage: string | null;
}
export interface JupiterExecutionResult {
  status: 'Success' | 'Failed';
  signature: string | null;
  code: number | null;
  totalInputAmount: string | null;
  totalOutputAmount: string | null;
  inputAmountResult: string | null;
  outputAmountResult: string | null;
  error: string | null;
}
export interface ExecutePayload { signedTransaction: string; requestId: string; }
