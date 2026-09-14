'use client';
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';
export const client = createClient()
  .use(walletSigner({ chain: 'solana:mainnet', storage: null, autoConnect: false }))
  .use(solanaRpc({ rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com' }));
export type AppClient = Awaited<typeof client>;
