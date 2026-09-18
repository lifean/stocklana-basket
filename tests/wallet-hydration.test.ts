import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import type { AppClient } from '../lib/solana/client.ts';
import { useWalletConnection } from '../lib/solana/use-wallet-connection.ts';

function WalletView({ client }: { client: AppClient }) {
  const { wallet, restoring } = useWalletConnection(client);
  return createElement('span', { 'data-owner': wallet?.account.address ?? '' }, restoring ? 'Restoring wallet…' : 'Ready');
}

test('wallet UI has the same server snapshot before and after an early reconnect', () => {
  const render = (status: string, connected: unknown) => {
    const client = { wallet: { getState: () => ({ status, connected }), subscribe: () => () => {} } } as unknown as AppClient;
    return renderToString(createElement(WalletView, { client }));
  };
  const initial = render('pending', null);
  assert.equal(initial, '<span data-owner="">Restoring wallet…</span>');
  assert.equal(render('reconnecting', null), initial);
  assert.equal(render('connected', { account: { address: 'restored-wallet' } }), initial);
  assert.equal(render('disconnected', null), initial);
});
