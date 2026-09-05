# TwentyPad web app

Production-oriented Next.js App Router UI for the Base-only TwentyPad B20 launchpad. It reads discovery data from Supabase, creates launches through the live factory with `value = 0`, and routes direct-pair swaps through the Universal Router with the explicit TwentyPad Uniswap v4 PoolKey.

> Unaudited. Use at your own risk.

## Requirements

- Node.js 20+
- npm 10+
- A Supabase project
- A WalletConnect Cloud project ID
- A reliable Base mainnet RPC URL
- A deployed v4 quoter capable of quoting the full hooked PoolKey

## Local setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Open `http://localhost:3000`.

Keep the paid or keyed provider server-side:

```env
BASE_RPC_URL=https://base-mainnet.g.alchemy.com/v2/YOUR_ALCHEMY_KEY
NEXT_PUBLIC_RPC_PROXY_URL=/api/rpc
```

Do not prefix the Alchemy URL with `NEXT_PUBLIC_`. The older `NEXT_PUBLIC_BASE_RPC_URL` setting is no longer used and can be removed from `.env.local`.

Apply `supabase/schema.sql` in the Supabase SQL editor. Re-run the idempotent schema after upgrading an existing installation; it adds the discovery view, market columns, and aggregation functions without deleting token data. Populate all variables in `.env.local`. `NEXT_PUBLIC_V4_QUOTER_ADDRESS` must point to a Base v4 quoter that supports the exact PoolKey including the TwentyPad hook; it is intentionally not guessed or replaced with an aggregator.

For Pinata-hosted images, set the server-only `PINATA_JWT` and set `NEXT_PUBLIC_PINATA_GATEWAY` to your public or dedicated Pinata gateway origin. The Create form validates and compresses PNG/JPG/WebP images in the browser (GIF files retain animation), uploads through `/api/upload` without exposing the JWT, and stores the canonical `ipfs://CID` in the onchain token profile. The image component converts that portable URI into a gateway URL for display.

## Indexing

Set `INDEXER_START_BLOCK` to the factory deployment or first-launch block. Trigger a bounded backfill from a trusted scheduler:

```bash
curl -X POST http://localhost:3000/api/indexer \
  -H "Authorization: Bearer $INDEXER_SECRET"
```

The route advances independent `factory` and `market` cursors in `indexer_state`, decoding verified factory `Launched` events plus Uniswap v4 PoolManager `Swap` events for known TwentyPad pool IDs. The separate market cursor automatically starts at `INDEXER_START_BLOCK`, including on an existing installation whose factory cursor is already ahead. It defaults to 10-block `eth_getLogs` ranges and at most 1,000 blocks per cursor per invocation for restrictive free RPC providers, throttles requests, and retries transient failures. Tune `INDEXER_BLOCK_RANGE`, `INDEXER_MAX_BLOCKS_PER_RUN`, `INDEXER_REQUEST_DELAY_MS`, and `INDEXER_RETRY_ATTEMPTS` without changing code. Client pages never scan historical RPC logs. New launches call `/api/tokens/upsert`, while confirmed swaps call `/api/trades/upsert`; both decode the exact receipt immediately and do not wait for the historical cursor.

The discovery page uses only indexed data. A new token starts with its real tick-derived quote price and FDV, zero volume, and zero trades. Confirmed swaps update price, tick, lifetime/24-hour volume, trade counts, estimated quote liquidity, and price change. USDC values map directly to USD. For ETH and tokenized-stock pairs, set the corresponding optional server-only `<SYMBOL>_USD_PRICE` variable to a current external reference value to enable USD display; otherwise the UI keeps values in the real quote unit instead of inventing a conversion.

The `/swap` page uses an in-place, searchable token selector and supports only the verified direct PoolKey belonging to the selected TwentyPad token. Supported quote assets are ETH, USDC, AAPLc, AMZNc, GOOGLc, METAc, MSFTc, MSTRc, NVDAc, SNDKc, SPCXc, and TSLAc. It does not hand custom-hook pools to a generic aggregator. When upgrading from an earlier indexer version, run `supabase/schema.sql` once before deploying the new application code; the idempotent migration corrects the earlier reversed trade-side and quote-flow values and refreshes affected token statistics.

Swap execution uses the verified `TwentyPadSwapRouter` at
`0xaa8dac41aec9e253d550e42673795f9251d8bedc`. Users can pay with ETH or USDC and
receive ETH or USDC when selling. For stock-quoted launches, the client discovers
the best executable Uniswap v3 route across the standard fee tiers, optionally
routing through USDC, and supplies independently slippage-bounded bridge and
TwentyPad legs to the adapter. ERC-20 approvals target the adapter; its internal
Permit2 allowances are temporary. The deployed adapter does not support receiving
the stock quote directly on a sale, so the UI deliberately offers only ETH and
USDC settlement.

## Contract addresses

All production Base addresses are centralized in `lib/chain.ts`. Factory/profile/event ABIs and fee escrow calls match the open-source contracts at `github.com/twentypad/b20-instant-launcher`.

## Launch behavior

- B20 ASSET, 18 decimals, fixed 1,000,000,000 supply
- ETH, USDC, or a factory-registered Base tokenized-stock quote
- Uniswap v4 fee 0, tick spacing 200, TwentyPad launch hook
- One-sided token liquidity; locked in the hook
- 1% fee after anti-snipe, split 70% creator / 30% platform
- Browser salt search starts at `lastSaltUint + 1`, uses `predictToken`, caps at 50,000 attempts, and requires the current suffix
- Server and indexer reads use the private `BASE_RPC_URL`. Browser reads use the same-origin `/api/rpc` allowlisted proxy by default, so the provider key is not exposed and the browser does not fall back to the rate-limited public Base RPC. Salt prediction is grouped into configurable multicalls with retry/backoff.
- `createLaunch` is sent with no ETH value and a 4.5M gas limit

## Safety

The app never shows mock tokens or synthetic market stats. Missing images use `/token-placeholder.svg`; missing labels render `-`; optional strings are normalized to empty strings for database writes. Generic aggregator fallback is deliberately absent because it may ignore the custom hook.
