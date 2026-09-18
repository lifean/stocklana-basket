'use client';
import { useConnectedWallet, useWalletStatus } from '@solana/kit-plugin-wallet/react';
import type { AppClient } from './client';
import { useHydrated } from '../use-hydrated.ts';

export function useWalletConnection(client: AppClient) {
  const hydrated = useHydrated();
  const connected = useConnectedWallet(client);
  const status = useWalletStatus(client);

  // A persisted wallet may reconnect before hydration reaches this component.
  // Mask only the initial snapshot; never unmount the transaction UI on reconnect.
  return {
    wallet: hydrated ? connected : null,
    restoring: !hydrated || status === 'pending' || status === 'reconnecting',
  };
}
