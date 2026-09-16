# Stocklana Basket

Build, buy and rebalance tokenized stock portfolios directly from a Solana wallet.

## Problem

Tokenized stocks exist on Solana, but constructing a diversified portfolio still requires users to discover and buy individual assets one by one.

## Solution

Stocklana Basket lets users select a strategy, invest USDC across multiple tokenized stocks, hold those assets directly in their own wallet, and rebalance the portfolio.

Three public-stock presets: AI Leaders, US Growth and Core US; plus Future Markets for Tessera exposure and Pre-IPO AI Leaders for PreStocks exposure. Allocations use integer basis points; onchain amounts use bigint. Public-stock assets are NVDAx, METAx, GOOGLx, QQQx and SPYx, resolved from Jupiter's verified registry. Future Markets resolves T-OpenAI and T-Kalshi from Tessera. Ambiguous symbols are unavailable rather than guessed.

## Why Solana

Tokenized equities are native onchain assets. Solana provides fast settlement, low transaction costs, self custody and composability; Jupiter aggregates available liquidity. The infrastructure runs 24/7, although individual assets and routes may have trading or geographic restrictions.

## Demo Flow

Connect Wallet → Choose Basket → Invest USDC → Review live quotes → Buy Basket → Sign component trades → View Portfolio → Rebalance preview → Rebalance → Updated holdings.

For AI Leaders, 100 USDC allocates 40 to NVDAx and 20 each to METAx, GOOGLx and QQQx. Every swap is independent. Execution pauses on failure; retry that asset or continue pending trades. Successful swaps remain completed and link to Solscan.

Rebalancing sells overweight positions first, refreshes confirmed balances and prices, then builds fresh buys using actual sell proceeds. Existing USDC is preserved. Drift under 100 basis points and trades below $1 are ignored.

## Architecture

```text
                     Stocklana Basket
                            |
            +---------------+---------------+
            |               |               |
         xStocks        PreStocks        Tessera
            |               |               |
     Jupiter Tokens   PreStocks API     Tessera API
            |               |               |
            +---------------+---------------+
                            |
                   Unified Asset Layer
                            |
                     Basket Engine
                            |
              +-------------+-------------+
              |                           |
         Jupiter Price               Jupiter Swap V2
                                          |
                                   Solana Wallet
                                          |
                                      Portfolio
                                          |
                                      Rebalance
```

The browser also reads Solana RPC through the Kit client. Wallet Standard signs Jupiter's versioned transactions, preserving other signer slots. The server proxies orders and execution; Jupiter submits transactions. There is no database or server wallet.

```text
app/                     App Router pages, layout and providers
  basket/[id]/           Basket allocation, preview and purchase
  portfolio/             Real holdings and rebalance
  swap-test/             Optional single-stock verification page
  api/stocks/            Verified supported stock registry
  api/tessera/           Tessera product data and mint-based decimals
  api/prestocks/         PreStocks product/valuation data and mint-based decimals
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

## Tessera integration details

Future Markets adds a single Pre-IPO preset: **T-OpenAI 60% / T-Kalshi 40%**. Existing public-stock basket allocations are unchanged. T-Tokens provide tokenized pre-IPO exposure, not direct ownership of OpenAI or Kalshi shares.

`GET /api/tessera` fetches the [official Tessera Product API](https://rest-api.tessera.pe/v1/public/token-details), caches results for 60 seconds and returns `assets`, executable `stocks`, and `unavailable` issues. Only the exact T-OpenAI and T-Kalshi symbols are allowed. Mint addresses come from Tessera; [Jupiter Tokens V2](https://developers.jup.ag/docs/tokens/token-information) supplies decimals through exact mint lookup. Missing, invalid or ambiguous products/metadata disable the basket. No Tessera API key is required.

Tessera `name`, `symbol`, `mint`, `sector`, `markPrice`, `markValuation` and `holders` are preserved. Unavailable fields remain null. Jupiter Price V3 supplies the separate market price; premium/discount is `(marketPrice / markPrice - 1) × 100`. A mark is a private-market reference, not guaranteed fair value, profit or expected return. Missing market prices never fall back to mark prices.

The existing `/order → wallet sign → /execute` flow, portfolio token-account reader and sell/refresh/buy rebalance engine are reused. Portfolio recognizes both providers; the selected basket targets apply to all resolved supported positions, including zero targets for assets outside that basket. Review all proposed sells. Only the original localStorage basket selection is persisted.

Pre-IPO token availability may vary by jurisdiction. This application is a hackathon demo and does not provide investment advice. See [Tessera's description of T-Token structure](https://blog.tessera.pe/posts/how-t-tokens-are-actually-structured).

Before demonstrating Future Markets, verify live `/api/tessera` data, market prices, executable Jupiter routes, two independent wallet approvals, received token balances, partial retry and a real rebalance. Upstream outages and unavailable routes disable the affected flow rather than substituting tokens.


## PreStocks integration details

**Pre-IPO AI Leaders** (`/basket/preipo-ai-leaders`) adds OPENAI 35%, ANTHROPIC 30%, ANDURIL 20% and FIGUREAI 15%. The existing public-stock and Tessera allocations are unchanged.

`GET /api/prestocks` fetches [the official PreStocks API](https://prestocks.com/api/prestocks) without a new API key and caches normalized data for 60 seconds. It returns `assets`, executable `stocks` and `unavailable` issues. Exact symbols select the four supported products; `contract_address` establishes mint identity. Duplicate symbols, invalid addresses and missing exact-mint Jupiter metadata/decimals disable the basket. No production mint or valuation fallback is hard-coded.

Mapping: `name → name`, `symbol → symbol`, `contract_address → mint`, `markPrice → markPrice`, `tokenPrice → marketPrice`, `markValuation → markValuation`, `impliedValuation → impliedValuation`, `image → image`, `external_url → externalUrl`, `supply → supply`, and `provider = prestocks`. Unavailable fields remain null. The shared Jupiter Tokens V2 resolver supplies decimals by mint.

The Private Market Data panel labels PreStocks Mark Price, PreStocks Token Price and optional Jupiter Market Price separately. Sponsor token prices never replace Jupiter prices in portfolio valuation, rebalance sizing or transaction quotes.

- Market premium/discount: `(tokenPrice / markPrice - 1) × 100`.
- Implied vs. Mark Valuation: `(impliedValuation / markValuation - 1) × 100`.
- Basket vs. Mark: sum of valid component premiums multiplied by their original basis-point weights / 10000. Incomplete coverage is explicitly displayed; missing values are excluded without rescaling the remaining weights.

Nonpositive denominators or invalid analytics produce “Unavailable”. Missing sponsor analytics do not block otherwise safely resolved trades. Execution reuses the existing independent Jupiter Swap V2 legs and partial retry UI; holdings use actual chain balances and the same sell/refresh/recalculate/buy rebalance engine. Provider outages unrelated to held or targeted assets do not interrupt existing baskets.

PreStocks availability is jurisdiction-dependent. PreStocks provide economic exposure and do not represent direct ownership of the referenced company's shares. Hackathon demo only; not investment advice. Marks and valuation gaps are informational, not guaranteed fair value or trade recommendations. See [PreStocks legal FAQ](https://prestocks.com/faq?tab=legal).

Before a mainnet demo, verify fresh sponsor data and quotes, approve the four trades with a real wallet, check Solscan receipts and received balances, and exercise partial retry and rebalance settlement. The selected basket targets apply to all recognized holdings; review any proposed sales of assets outside that basket.


## Stocklana Bounty Integrations

### PreStocks

The official `https://prestocks.com/api/prestocks` response dynamically discovers OPENAI, ANTHROPIC, ANDURIL and FIGUREAI through exact symbols and `contract_address`. The **Pre-IPO AI Leaders** basket allocates 35% / 30% / 20% / 15%.

Private Market Data presents PreStocks **mark price, token price, mark valuation and implied valuation**. Premium/discount compares its token price with its mark; implied-vs-mark valuation is shown separately. **Basket vs. Mark** weights valid premiums by target allocations and explicitly identifies missing components without rescaling. Jupiter market prices are separately labeled and never overwrite sponsor prices.

### Tessera

The official `https://rest-api.tessera.pe/v1/public/token-details` response dynamically discovers **T-OpenAI** and **T-Kalshi**. The **Future Markets** basket allocates 60% / 40%.

Private Market Data presents **Tessera mark prices, mark valuations, holder counts and sectors** where supplied. Premium/discount compares Jupiter's on-chain price with Tessera's mark. **Basket vs. Tessera Mark** is unavailable until every component has valid pricing; missing marks or market prices are never treated as zero.

### Shared execution and source transparency

Both integrations resolve decimals using Jupiter Tokens V2 by the official mint, then reuse `/order → Wallet Standard sign → /execute`. Swaps are independent and partial failures remain visible and individually retryable. Onchain token accounts supply portfolio holdings; Jupiter prices supply portfolio values. Rebalance sells overweight assets, refreshes confirmed balances and prices, recalculates buys from actual proceeds, then requests fresh orders.

A shared provider badge and `PreIpoMetrics` component keep both baskets in one product. Labels distinguish “Private-market data provided by PreStocks/Tessera” from “On-chain market price via Jupiter”. Sponsor responses include a server `fetchedAt` timestamp retained through the 60-second cache; the UI displays local update time and supports manual refresh. This timestamp describes retrieval, not the provider's own valuation publication time.

Pre-IPO tokens provide tokenized economic exposure under their respective provider structures and do not necessarily represent direct ownership of the referenced company's shares. Availability may vary by jurisdiction. This hackathon demo is for informational purposes only and is not investment advice.

## Submission verification

Run `npm run lint`, `npm run typecheck`, `npm test` and `npm run build`. Unit tests cover provider identity, decimals, allocations, analytics, signing and rebalance sequencing. Browser regression checks use isolated wallet/RPC/execution fixtures; no automated test trade spends mainnet funds. Production paths use live provider APIs, Jupiter and Solana RPC only.

Before submission, open a clean browser session for AI Leaders, Pre-IPO AI Leaders and Future Markets. Connect a funded wallet, inspect live data and allocations, review fresh Jupiter orders, then approve only small intended trades. Verify Solscan receipts, actual received balances, rejected-signature recovery, individual failed-leg retry and sell/refresh/buy rebalance settlement. If a portfolio is within the drift/minimum-trade thresholds, no rebalance is expected. Keep unresolved execution tabs open; transaction recovery is held in memory.

Suggested 60-second demo: 0–10s show Public Stocks and Pre-IPO categories; 10–25s show PreStocks valuations and its 100 USDC preview; 25–40s show Tessera marks, holders/sectors and its preview; 40–50s show a prepared real execution receipt and wallet-held positions; 50–60s show target/current/drift and a rebalance preview. Obtain real receipts beforehand rather than rushing signatures during the demo.
