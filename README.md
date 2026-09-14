# Stocklana Basket

A hackathon MVP for exploring three preset tokenized equity strategies on Solana, connecting a Wallet Standard wallet, and previewing how a USDC investment is allocated. Buy Basket is disabled; this phase never signs or submits transactions.

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
- `types/` contains basket, stock, execution and portfolio domain types. Execution types are definitions only.
- `lib/baskets.ts` defines the three presets and validates integer weights totaling 10,000 basis points. `lib/amounts.ts` parses USDC as bigint and assigns rounding remainders without losing atomic units.
- `GET /api/stocks` uses Jupiter Tokens V2's stocks tag, requires exact symbols and `isVerified === true`, and returns `{ stocks, unavailable }`. Multiple distinct verified candidate mints make the symbol unavailable; candidate addresses are returned and logged. No stock mint addresses are hard-coded.
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

Unit tests cover allocation precision, amount validation, verified-token filtering, ambiguous symbols, and missing prices. With credentials configured, check `/api/stocks` for real verified stocks and use the returned mints with `/api/prices`. In an extension-enabled browser, connect and disconnect a Wallet Standard wallet and check the USDC balance. No signatures should be requested.

## Mainnet and MVP limitations

**Mainnet only.** Jupiter swaps use mainnet. Configure a mainnet RPC and use a Solana mainnet wallet. The application never handles private keys.

This phase is preview-only: no execution, signing, swap quotes, custom baskets, rebalancing, or portfolio tracking. Estimates assume 1 USDC ≈ $1 and use current Jupiter USD prices; they exclude slippage, fees and issuer-specific token-to-share ratios. Prices may be missing and require manual refresh. Tokenized equities involve issuer and market risk. An ambiguous symbol stays unavailable until its canonical mint is independently confirmed. Rate limits and wallet/RPC availability can prevent live data loading.

Day 2 work, not implemented: Jupiter swap quote/order integration, wallet signing, execution of individual legs, and accurate success/failure/partial-result reporting.

This project is a hackathon demo and does not constitute investment advice.
