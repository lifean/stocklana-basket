import test from 'node:test';
import assert from 'node:assert/strict';
import { createTokenRegistryCache, TOKEN_REGISTRY_TTL } from '../lib/token-registry-cache.ts';

const registry = (name: string) => ({ stocks: [], unavailable: [], warnings: [name] });
function fixture() {
  let time = 1000;
  const requests: { url: string; resolve: (response: Response) => void }[] = [];
  const cache = createTokenRegistryCache({
    now: () => time,
    fetcher: ((url: string) => new Promise<Response>(resolve => requests.push({ url, resolve }))) as typeof fetch,
  });
  return { cache, requests, advance: (ms: number) => { time += ms; }, tick: () => Promise.resolve() };
}

test('page consumers share one request and reuse successful registry data for five minutes', async () => {
  const { cache, requests, advance, tick } = fixture();
  const first = cache.load('xstocks');
  const second = cache.load('xstocks');
  await tick();
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/stocks');
  requests[0].resolve(Response.json(registry('first')));
  assert.equal(await first, await second);
  advance(TOKEN_REGISTRY_TTL - 1);
  assert.equal(await cache.load('xstocks'), cache.read('xstocks').data);
  assert.equal(requests.length, 1);
  advance(1);
  const refresh = cache.load('xstocks');
  await tick();
  assert.equal(requests.length, 2);
  assert.deepEqual(cache.read('xstocks').data, registry('first'), 'keep stale display while refreshing');
  requests[1].resolve(Response.json(registry('updated')));
  await refresh;
  assert.deepEqual(cache.read('xstocks').data, registry('updated'));
});

test('manual refresh bypasses TTL, publishes shared data, and coalesces concurrent refreshes', async () => {
  const { cache, requests, tick } = fixture();
  let updates = 0;
  const unsubscribe = cache.subscribe(() => updates++);
  const initial = cache.load('prestocks'); await tick();
  requests[0].resolve(Response.json(registry('initial'))); await initial;
  const refresh = cache.load('prestocks', true);
  const other = cache.load('prestocks', true); await tick();
  assert.equal(requests.length, 2);
  requests[1].resolve(Response.json(registry('new')));
  assert.equal(await refresh, await other);
  assert.equal(updates, 2);
  assert.deepEqual(cache.read('prestocks').data, registry('new'));
  unsubscribe();
});

test('failed refresh retains stale display without extending freshness and retries on the next visit', async () => {
  const { cache, requests, advance, tick } = fixture();
  const initial = cache.load('tessera'); await tick();
  requests[0].resolve(Response.json(registry('initial'))); await initial;
  const stamp = cache.read('tessera').updatedAt;
  advance(TOKEN_REGISTRY_TTL);
  const failed = cache.load('tessera'); await tick();
  requests[1].resolve(Response.json({ error: 'Offline' }, { status: 503 }));
  await assert.rejects(failed, /Offline/);
  assert.equal(cache.read('tessera').updatedAt, stamp);
  assert.deepEqual(cache.read('tessera').data, registry('initial'));
  const retry = cache.load('tessera'); await tick();
  assert.equal(requests.length, 3);
  requests[2].resolve(Response.json(registry('recovered'))); await retry;
  assert.equal(cache.read('tessera').error, null);
});

test('invalid responses are not cached and provider caches remain independent', async () => {
  const { cache, requests, tick } = fixture();
  const xstocks = cache.load('xstocks');
  const tessera = cache.load('tessera'); await tick();
  requests[0].resolve(Response.json({ stocks: 'invalid', unavailable: [] }));
  requests[1].resolve(Response.json(registry('tessera')));
  await assert.rejects(xstocks, /Invalid token data/); await tessera;
  assert.equal(cache.read('xstocks').data, undefined);
  assert.deepEqual(cache.read('tessera').data, registry('tessera'));
  const retry = cache.load('xstocks'); await tick();
  requests[2].resolve(Response.json(registry('xstocks'))); await retry;
  assert.deepEqual(cache.read('tessera').data, registry('tessera'));
});

test('transaction checks always require a network response and never fall back to the display cache', async () => {
  const { cache, requests, tick } = fixture();
  const initial = cache.load('xstocks'); await tick();
  requests[0].resolve(Response.json(registry('cached'))); await initial;
  const fresh = cache.fresh('xstocks');
  const concurrent = cache.fresh('xstocks'); await tick();
  assert.equal(requests.length, 2);
  requests[1].resolve(Response.json(registry('fresh')));
  assert.equal(await fresh, await concurrent);
  assert.deepEqual(await fresh, registry('fresh'));
  assert.deepEqual(cache.read('xstocks').data, registry('cached'), 'trade validation must not reset mounted trade UI');
  const failed = cache.fresh('xstocks'); await tick();
  requests[2].resolve(Response.json({ error: 'Offline' }, { status: 503 }));
  await assert.rejects(failed, /Offline/);
});
