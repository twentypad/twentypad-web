import type { Address } from "viem";
import { ADDRESSES } from "@/lib/chain";

const SUPPLY = 1_000_000_000;

export type MarketEstimate = {
  priceQuote: number;
  priceUsd: number | null;
  fdvQuote: number;
  fdvUsd: number | null;
};

export function quoteDecimals(quote: Address) {
  return quote.toLowerCase() === ADDRESSES.usdc.toLowerCase() ? 6 : 18;
}

export function quoteSymbol(quote: Address) {
  return quote.toLowerCase() === ADDRESSES.usdc.toLowerCase() ? "USDC" : "ETH";
}

export function priceFromTick(
  tick: number,
  token: Address,
  quote: Address,
  tokenDecimals = 18,
): number {
  const tokenIsCurrency0 = BigInt(token) < BigInt(quote);
  const currency0Decimals = tokenIsCurrency0
    ? tokenDecimals
    : quoteDecimals(quote);
  const currency1Decimals = tokenIsCurrency0
    ? quoteDecimals(quote)
    : tokenDecimals;
  const currency1PerCurrency0 =
    Math.pow(1.0001, tick) *
    Math.pow(10, currency0Decimals - currency1Decimals);
  return tokenIsCurrency0 ? currency1PerCurrency0 : 1 / currency1PerCurrency0;
}

export function marketEstimate(args: {
  tick: number;
  token: Address;
  quote: Address;
  tokenDecimals?: number;
  ethUsd?: number | null;
}): MarketEstimate {
  const priceQuote = priceFromTick(
    args.tick,
    args.token,
    args.quote,
    args.tokenDecimals,
  );
  const isUsdc = args.quote.toLowerCase() === ADDRESSES.usdc.toLowerCase();
  const quoteUsd = isUsdc ? 1 : args.ethUsd || null;
  return {
    priceQuote,
    priceUsd: quoteUsd ? priceQuote * quoteUsd : null,
    fdvQuote: priceQuote * SUPPLY,
    fdvUsd: quoteUsd ? priceQuote * SUPPLY * quoteUsd : null,
  };
}

export function configuredEthUsd() {
  const value = Number(process.env.ETH_USD_PRICE || "");
  return Number.isFinite(value) && value > 0 ? value : null;
}
