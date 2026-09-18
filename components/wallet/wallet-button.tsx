'use client';
import { useState } from 'react';
import { useClient } from '@solana/react';
import { useConnect, useConnectedWallet, useDisconnect, useWallets, useWalletStatus } from '@solana/kit-plugin-wallet/react';
import type { AppClient } from '@/lib/solana/client';
import { useHydrated } from '@/lib/use-hydrated';
export function WalletButton() {
  // Wallet discovery is browser-owned; keep SSR and initial hydration identical.
  const hydrated = useHydrated();
  return hydrated ? <WalletControl /> : <button className="button secondary" disabled>Restoring wallet…</button>;
}
function WalletControl() {
  const client = useClient<AppClient>();
  const wallets = useWallets(client);
  const connected = useConnectedWallet(client);
  const status = useWalletStatus(client);
  const connect = useConnect(client);
  const disconnect = useDisconnect(client);
  const [open, setOpen] = useState(false);
  const restoring = status === 'pending' || status === 'reconnecting';
  const busy = connect.isRunning || disconnect.isRunning || restoring;
  return <div className="wallet-control">
    {connected ? <button className="button secondary" disabled={busy} onClick={() => disconnect.dispatch()} title={`Disconnect ${connected.account.address}`}>
      <span className="status-dot" />{connected.account.address.slice(0, 4)}…{connected.account.address.slice(-4)} <span className="disconnect-label">· Disconnect</span>
    </button> : <button className="button secondary" aria-expanded={open} aria-controls="wallet-picker" disabled={busy} onClick={() => setOpen(!open)}>{restoring ? 'Restoring wallet…' : busy ? 'Connecting…' : 'Connect wallet'}</button>}
    {open && !connected && <div className="wallet-menu" id="wallet-picker">
      <strong>Choose your wallet</strong><p className="muted small">Wallet Standard · Solana mainnet</p>
      {wallets.length === 0 && <p>No compatible wallet found. Install or unlock Phantom, Backpack, or Solflare, then refresh this page.</p>}
      {wallets.map(wallet => <button className="button secondary" key={wallet.name} disabled={busy} onClick={async () => { try { await connect.dispatchAsync(wallet); setOpen(false); } catch { /* Action hook exposes the error below. */ } }}>{wallet.name}</button>)}
      <button className="text-button" onClick={() => setOpen(false)}>Close</button>
    </div>}
    {Boolean(connect.error || disconnect.error) && <p className="wallet-error" role="alert">Wallet request failed or was declined. Please try again.</p>}
  </div>;
}
