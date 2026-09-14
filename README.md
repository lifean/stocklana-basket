# Stocklana Basket

A hackathon MVP for exploring three preset tokenized equity strategies on Solana, connecting a Wallet Standard wallet, and previewing how a USDC investment is allocated. Buy Basket remains disabled until the first real single-stock swap is verified. `/swap-test` now supports a real, wallet-approved USDC → NVDAx purchase on mainnet.

## Setup

Requires Node.js 24+ and npm.

```sh
npm install
cp .env.example .env.local
# Fill in .env.local, then:
npm run dev
```

Open http://localhost:3000. Choose AI Leaders, enter 100 USDC, and preview NVDA 40 / META 20 / GOOGL 20 / QQQ 20. Wallet connection is optional for previewing.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Browser-accessible **mainnet** RPC endpoint with CORS support. Public by design; use a domain-restricted public RPC credential if needed. Falls back to Solana's rate-limited public mainnet endpoint. |
| `JUPITER_API_KEY` | Server-only key from the Jupiter developer portal. Required for live stocks and prices. Never prefix it with `NEXT_PUBLIC_`. |

Restart the dev server after changing environment variables. Public RPC configuration is embedded at build time, so rebuild production after changing it. Do not commit `.env.local`.

## Architecture and stack

- Next.js App Router, TypeScript, React, Tailwind CSS; no database or authentication.
- `lib/solana/client.ts` composes Solana Kit, RPC and Wallet Standard wallet plugins. `app/providers.tsx` publishes it through `@solana/react`. Wallet discovery supports compatible Phantom, Backpack and Solflare installations without wallet-specific adapters. Wallet persistence is disabled.
- `types/` contains basket, stock, execution and portfolio domain types. Execution legs track the single-stock purchase state; basket execution remains gated.
- `lib/baskets.ts` defines the three presets and validates integer weights totaling 10,000 basis points. `lib/amounts.ts` parses USDC as bigint and assigns rounding remainders without losing atomic units.
- `GET /api/stocks` uses Jupiter Tokens V2's stocks tag, requires exact symbols and `isVerified === true`, and returns `{ stocks, unavailable }`. If Jupiter explicitly rejects its documented stocks tag, the route falls back to the complete verified registry and requires a `stocks` tag on the selected token. Ambiguity is checked across all verified candidates before this tag filter. Multiple distinct verified candidate mints make the symbol unavailable; candidate addresses are returned and logged. No stock mint addresses are hard-coded.
- `GET /api/prices?ids=...` validates 1–20 mint addresses and proxies Jupiter Price V3. Each requested mint maps to `usdPrice`, `liquidity`, `priceChange24h`, and `decimals`. Missing fields, including liquidity when absent upstream, are `null`.
- `lib/jupiter/client.ts` is server-only, applies timeouts, and caches in memory for 60 seconds (metadata) and 15 seconds (prices), with concurrent request deduplication and a 100-entry bound. Cache is per server instance; errors are not cached.
- `components/investment-form.tsx` fetches metadata/prices on mount or explicit refresh, displays per-stock unavailable states, and reads total wallet USDC across token accounts every 30 seconds. Only `stocklana.activeBasket` is written to localStorage, as a preset ID. Prices and balances are never persisted.

Official API references: [Solana React client](https://solana.com/docs/frontend/react-hooks), [Jupiter Tokens V2](https://developers.jup.ag/docs/tokens/token-information), [Jupiter Price V3](https://developers.jup.ag/docs/price).

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

Unit tests cover allocation precision, amount validation, token safety, missing prices, order validation, partial signing, wallet rejection, execute results and uncertain submissions. With credentials configured, check `/api/stocks` for real verified stocks and use the returned mints with `/api/prices`. In an extension-enabled browser, connect and disconnect a Wallet Standard wallet and check the USDC balance. The Day 1 preview never requests a signature. The Day 2 `/swap-test` route requests a transaction signature only after reviewing a quote and clicking Buy.

## Mainnet and MVP limitations

**Mainnet only.** Jupiter swaps use mainnet. Configure a mainnet RPC and use a Solana mainnet wallet. The application never handles private keys.

Basket purchasing remains gated on verifying one real mainnet swap. No custom baskets, historical P&L, cost basis, or automated scheduling is implemented. Day 3 adds current holdings and wallet-approved rebalancing at `/portfolio`. Estimates assume 1 USDC ≈ $1 and use current Jupiter USD prices; they exclude slippage, fees and issuer-specific token-to-share ratios. Prices may be missing and require manual refresh. Tokenized equities involve issuer and market risk. An ambiguous symbol stays unavailable until its canonical mint is independently confirmed. Rate limits and wallet/RPC availability can prevent live data loading.

## Day 2: first mainnet swap

1. Start the app and open `/swap-test` (also linked from the basket preview).
2. Connect a funded Wallet Standard wallet. The default test amount is **1 USDC**; review it before buying. The wallet may also need SOL for fees and token account creation.
3. Click **Review quote**, inspect expected received amount and price impact, then click **Buy** and approve in your wallet.
4. Wait for **Completed**, then inspect the Solscan link. A signature alone is not success: Jupiter must return `status: Success` and `code: 0`.
5. Share the resulting signature for mainnet verification before basket orchestration is built.

`GET /api/jupiter/order` validates mints, positive u64 atomic amount and taker, restricts pairs to mainnet USDC ↔ an unambiguous verified registry stock, and calls only `GET https://api.jup.ag/swap/v2/order`. Orders are never cached. Slippage and priority fees are left to Jupiter.

`POST /api/jupiter/execute` accepts a size-bounded JSON body containing the partially signed base64 transaction and requestId. It calls only `POST https://api.jup.ag/swap/v2/execute`. The key remains server-only. `lib/execution/leg.ts` decodes/encodes with Kit and calls the Wallet Standard transaction signer without sending from the wallet. It preserves other required signer slots and existing signatures, rejects changed message bytes, checks the original wallet, input-token balance, mainnet RPC and quote validity, and waits for Jupiter's execution result.

Definite failures can be retried via **Review fresh quote**, with a new order and requestId. An uncertain execution blocks new purchases: **Check execution** resubmits the same signed transaction to reconcile its outcome. Keep the page open while executing or reconciling. State is memory-only; after a reload, check wallet history before buying again. No private keys, signed transactions, orders, prices or balances are stored persistently.

Current gate: no real wallet signature or confirmed swap has yet been verified in the development environment. Basket planning, sequential four-leg execution, per-leg basket retries, Portfolio Created, and View Portfolio remain pending that required first swap.

Official flow: [Jupiter Swap V2 order and execute](https://developers.jup.ag/docs/swap/order-and-execute).

This project is a hackathon demo and does not constitute investment advice.


## Day 3: holdings and rebalance

Open `/portfolio` from the header and connect a Wallet Standard wallet. The page reads both original SPL Token and Token-2022 accounts through the existing Kit RPC client, sums accounts by verified mint, and ignores unsupported tokens. All stock mints and USDC are priced in one `/api/prices` request. Missing prices or unresolved registry entries prevent rebalancing; incomplete totals and weights are shown as unavailable.

Targets come only from `stocklana.activeBasket`. With no valid preset selected, holdings still display but automatic rebalance is disabled. Zero-balance target assets are included so missing allocations are visible. Current stock weights are rounded to basis points with remainder correction to total 10,000. The weighted 24-hour metric describes token price changes at current holdings weights, not investment P&L.

`lib/rebalance.ts` is pure and testable. It ignores drift below 100 bps and trades below $1. USD arithmetic uses numbers; conversion into atomic swap amounts uses decimal ratios and bigint, rounded down.

Rebalance execution uses the existing Swap V2 engine:

1. Review current/target weights, approximate sells/buys and transaction count.
2. Overweight holdings sell sequentially into USDC. A failed sell can be retried before the buy phase, or the user can continue with proceeds from successful sells.
3. Refresh balances and prices. The RPC must confirm successful signatures, and account reads use their slots as `minContextSlot` to avoid planning from pre-swap balances.
4. Recalculate underweights against remaining stock value plus actual unspent sell proceeds. Available cash is capped by both the change from the starting USDC balance and Jupiter's reported actual received/spent amounts. Existing USDC is preserved. If cash is short, buy allocations scale down and trades below $1 are omitted.
5. Buy sequentially with fresh orders; refresh again before each buy and after completion. Failed buys can be retried individually after recalculation. Successful legs are never replayed. After buying has begun, remaining failed sells require reviewing a new plan.

Unknown execution outcomes pause the run and block new spending until reconciled. Quote/signature rejection and definite execution failures remain distinguishable from an uncertain submission. State and signed payloads stay in memory only; keep the page open, and inspect wallet history if it is reloaded. Leaving the page stops further signing requests, but a transaction already submitted can still finish.

`Rebalance partially completed` preserves successful trade links and offers recovery. `Rebalance trades completed` means the planned executable trades finished, not that exact target percentages were achieved. Fees, rounding, minimum-trade rules, liquidity, and price movement can leave residual drift or USDC.

Tests include holdings aggregation, missing prices, thresholds, weight totals, exact atomic conversion, sell/refresh/buy ordering, actual-proceeds funding, retries, and uncertain submissions. Real extension-wallet approval and mainnet rebalance receipts must be verified with the user's connected wallet; synthetic test fixtures are confined to tests.
