# Stocklana Basket

Build, buy and rebalance tokenized stock portfolios directly from a Solana wallet.

## Problem

Tokenized stocks exist on Solana, but constructing a diversified portfolio still requires users to discover and buy individual assets one by one.

## Solution

Stocklana Basket lets users select a strategy, invest USDC across multiple tokenized stocks, hold those assets directly in their own wallet, and rebalance the portfolio.

Three public-stock presets: AI Leaders, US Growth and Core US; plus Future Markets for Tessera pre-IPO exposure. Allocations use integer basis points; onchain amounts use bigint. Public-stock assets are NVDAx, METAx, GOOGLx, QQQx and SPYx, resolved from Jupiter's verified registry. Future Markets resolves T-OpenAI and T-Kalshi from Tessera. Ambiguous symbols are unavailable rather than guessed.

## Why Solana

Tokenized equities are native onchain assets. Solana provides fast settlement, low transaction costs, self custody and composability; Jupiter aggregates available liquidity. The infrastructure runs 24/7, although individual assets and routes may have trading or geographic restrictions.

## Demo Flow

Connect Wallet → Choose Basket → Invest USDC → Review live quotes → Buy Basket → Sign component trades → View Portfolio → Rebalance preview → Rebalance → Updated holdings.

For AI Leaders, 100 USDC allocates 40 to NVDAx and 20 each to METAx, GOOGLx and QQQx. Every swap is independent. Execution pauses on failure; retry that asset or continue pending trades. Successful swaps remain completed and link to Solscan.

Rebalancing sells overweight positions first, refreshes confirmed balances and prices, then builds fresh buys using actual sell proceeds. Existing USDC is preserved. Drift under 100 basis points and trades below $1 are ignored.

## Architecture

```text
Browser
 |
Wallet Standard
 |
Next.js
 |
Jupiter APIs
 |-- Tokens V2
 |-- Price V3
 |-- Swap V2 (/order + /execute)
 |
Solana
```

The browser also reads Solana RPC through the Kit client. Wallet Standard signs Jupiter's versioned transactions, preserving other signer slots. The server proxies orders and execution; Jupiter submits transactions. There is no database or server wallet.

```text
app/                     App Router pages, layout and providers
  basket/[id]/           Basket allocation, preview and purchase
  portfolio/             Real holdings and rebalance
  swap-test/             Optional single-stock verification page
  api/stocks/            Verified supported stock registry
  api/tessera/           Tessera product data and mint-based decimals
  api/prices/            Batched Price V3 proxy (20 mints maximum)
  api/jupiter/           Swap V2 order and execute proxies
components/              Wallet, investment, execution and portfolio UI
lib/execution/           Shared signing, basket plan and rebalance engine
lib/jupiter/             Server clients, validation and normalization
lib/solana/              Mainnet client and confirmed balance reads
lib/                     Amounts, baskets, portfolio and rebalance calculations
types/                   Domain types
tests/                   Node unit tests
```

Metadata caches for 60 seconds and prices for 15 seconds per server instance. If Jupiter rejects the stocks tag, the registry falls back to the complete verified list, requires stock tags and checks duplicate symbols before selection. No stock mint or price is fabricated.

## Stack

Next.js App Router, TypeScript, Tailwind CSS, Node.js 24+, @solana/kit, @solana/react, RPC and wallet Kit plugins, Wallet Standard and Jupiter Developer APIs.

## Local Setup

```sh
npm install
cp .env.example .env.local
# Fill in the environment variables below.
npm run dev
```

Open http://localhost:3000. Use a Wallet Standard wallet with transaction-signing support, such as Phantom, Backpack or Solflare.

```sh
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Environment Variables

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SOLANA_RPC_URL` | Mainnet RPC endpoint accessible from the browser; configure provider origin restrictions for the deployed domain. This value is public. |
| `JUPITER_API_KEY` | Jupiter Developer API key, used only in server routes. Never prefix it with `NEXT_PUBLIC_`. |

Do not commit `.env.local`.

For Vercel, import the repository with the Next.js preset, select Node.js 24 and configure both variables for the intended environment before building. Enable Fluid compute and ensure the execute route's 90-second maximum duration is supported by the project. See [Vercel function duration configuration](https://vercel.com/docs/functions/configuring-functions/duration). No filesystem persistence is required. In-memory metadata caches are opportunistic across function instances.

## Security

The Jupiter API key stays server side. Assets remain in the user's wallet; the app never handles private keys. Users explicitly sign each trade. Server routes validate inputs and restrict orders to USDC and resolved supported stocks. Signing alone never marks a trade successful: Jupiter execution must report success with a transaction signature.

Unknown execution outcomes block fresh retries until checked using the original signed submission. Keep the execution tab open. Only `stocklana.activeBasket` is stored in localStorage; balances, prices and transaction records are not persisted. After reload, inspect real wallet holdings and transaction history before buying again. A selected basket does not imply that all components were purchased.

## Limitations

- Hackathon demo on mainnet: trades spend real USDC and require SOL for network fees/account creation.
- Preset baskets only; transactions execute as independent swaps and can partially complete.
- No historical cost basis or total P&L; the 24-hour indicator is weighted token price change.
- No automatic scheduled rebalancing. Exact target weights are not guaranteed.
- API availability, routing, issuer restrictions and RPC access can affect execution.
- Execution recovery is confined to the open tab; no cross-device transaction history.
- Mainnet extension-wallet signing, real purchase receipts and real rebalance settlement must be verified manually before submission. Automated fixtures do not establish a real trade.

This project is a hackathon demo and does not constitute investment advice. Tokenized securities may be subject to geographic restrictions.

## Future Work

Custom baskets, recurring investment, social/shareable portfolios and multi-issuer stock routing.

## Tessera pre-IPO exposure

Future Markets adds a single Pre-IPO preset: **T-OpenAI 60% / T-Kalshi 40%**. Existing public-stock basket allocations are unchanged. T-Tokens provide tokenized pre-IPO exposure, not direct ownership of OpenAI or Kalshi shares.

`GET /api/tessera` fetches the [official Tessera Product API](https://rest-api.tessera.pe/v1/public/token-details), caches results for 60 seconds and returns `assets`, executable `stocks`, and `unavailable` issues. Only the exact T-OpenAI and T-Kalshi symbols are allowed. Mint addresses come from Tessera; [Jupiter Tokens V2](https://developers.jup.ag/docs/tokens/token-information) supplies decimals through exact mint lookup. Missing, invalid or ambiguous products/metadata disable the basket. No Tessera API key is required.

Tessera `name`, `symbol`, `mint`, `sector`, `markPrice`, `markValuation` and `holders` are preserved. Unavailable fields remain null. Jupiter Price V3 supplies the separate market price; premium/discount is `(marketPrice / markPrice - 1) × 100`. A mark is a private-market reference, not guaranteed fair value, profit or expected return. Missing market prices never fall back to mark prices.

The existing `/order → wallet sign → /execute` flow, portfolio token-account reader and sell/refresh/buy rebalance engine are reused. Portfolio recognizes both providers; the selected basket targets apply to all resolved supported positions, including zero targets for assets outside that basket. Review all proposed sells. Only the original localStorage basket selection is persisted.

Pre-IPO token availability may vary by jurisdiction. This application is a hackathon demo and does not provide investment advice. See [Tessera's description of T-Token structure](https://blog.tessera.pe/posts/how-t-tokens-are-actually-structured).

Before demonstrating Future Markets, verify live `/api/tessera` data, market prices, executable Jupiter routes, two independent wallet approvals, received token balances, partial retry and a real rebalance. Upstream outages and unavailable routes disable the affected flow rather than substituting tokens. PreStocks is not integrated.
