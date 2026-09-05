import { formatUnits, type Address } from "viem";
import { ADDRESSES } from "@/lib/chain";
import type { Token } from "@/lib/types";
import type { AdapterQuote } from "@/lib/twentypad-swap-router";
import { quoteDecimals } from "@/lib/quotes";
import { configuredQuoteUsd } from "@/lib/quotes";

function validPrice(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function launchUsdPrice(token?: Token) {
  if (!token) return null;
  const stored = validPrice(token.token_stats?.price_usd);
  if (stored) return stored;
  const quotePrice = validPrice(token.token_stats?.price_quote);
  const quoteUsd = quoteUsdPrice(token);
  return quotePrice && quoteUsd ? quotePrice * quoteUsd : null;
}

export function quoteUsdPrice(token?: Token) {
  if (!token) return null;
  if (token.quote.toLowerCase() === ADDRESSES.usdc.toLowerCase()) return 1;
  const configured = configuredQuoteUsd(token.quote);
  if (configured) return configured;
  const priceUsd = validPrice(token.token_stats?.price_usd);
  const priceQuote = validPrice(token.token_stats?.price_quote);
  return priceUsd && priceQuote ? priceUsd / priceQuote : null;
}

export function quoteAmountUsd(token: Token, amount?: number | null) {
  const price = quoteUsdPrice(token);
  return amount != null && Number.isFinite(amount) && price ? amount * price : null;
}

export function settlementUsdPrice(args: {
  token?: Token;
  settlement?: Address;
  buy: boolean;
  amountIn?: bigint;
  inputDecimals: number;
  outputDecimals: number;
  quote?: AdapterQuote;
}) {
  const { token, settlement, buy, amountIn, inputDecimals, outputDecimals, quote } = args;
  if (!token || !settlement) return null;
  if (settlement.toLowerCase() === ADDRESSES.usdc.toLowerCase()) return 1;

  const quoteUsd = quoteUsdPrice(token);
  if (settlement.toLowerCase() === token.quote.toLowerCase()) return quoteUsd;
  if (!quoteUsd || !quote) return null;

  const quoteAmount = Number(formatUnits(quote.quoteOut, quoteDecimals(token.quote)));
  if (!Number.isFinite(quoteAmount) || quoteAmount <= 0) return null;

  if (buy && amountIn) {
    const settlementAmount = Number(formatUnits(amountIn, inputDecimals));
    return settlementAmount > 0 ? (quoteAmount * quoteUsd) / settlementAmount : null;
  }
  if (!buy && quote.finalOut > 0n) {
    const settlementAmount = Number(formatUnits(quote.finalOut, outputDecimals));
    return settlementAmount > 0 ? (quoteAmount * quoteUsd) / settlementAmount : null;
  }
  return null;
}

export function amountUsd(amount: string | number | null | undefined, unitUsd: number | null) {
  if (amount == null || !unitUsd) return null;
  const numeric = typeof amount === "number" ? amount : Number(amount);
  return Number.isFinite(numeric) ? numeric * unitUsd : null;
}
