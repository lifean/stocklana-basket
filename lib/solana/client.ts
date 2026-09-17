'use client';
import { createClient } from '@solana/kit';
import { solanaRpc } from '@solana/kit-plugin-rpc';
import { walletSigner } from '@solana/kit-plugin-wallet';
// Remember only the selected wallet/account for this tab. Storage can be
// unavailable in restricted browsers; manual connection must still work.
const walletStorage = typeof window === 'undefined' ? null : {
  getItem(key: string) { try { return window.sessionStorage.getItem(key); } catch { return null; } },
  setItem(key: string, value: string) { try { window.sessionStorage.setItem(key, value); } catch { /* Connection remains usable without persistence. */ } },
  removeItem(key: string) { try { window.sessionStorage.removeItem(key); } catch { /* Storage may be blocked by the browser. */ } },
};
export const client = createClient()
  .use(walletSigner({ chain: 'solana:mainnet', storage: walletStorage, storageKey: 'stocklana.wallet', autoConnect: true }))
  .use(solanaRpc({ rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com' }));
export type AppClient = Awaited<typeof client>;
