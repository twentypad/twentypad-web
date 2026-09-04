import type { Address } from "viem";
import { ADDRESSES } from "@/lib/chain";

export type QuoteCategory = "core" | "stock";

export type QuoteAsset = {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  category: QuoteCategory;
  native: boolean;
};

export const QUOTE_ASSETS = [
  { address: ADDRESSES.eth, symbol: "ETH", name: "Ether", decimals: 18, category: "core", native: true },
  { address: ADDRESSES.usdc, symbol: "USDC", name: "USD Coin", decimals: 6, category: "core", native: false },
  { address: "0xb200000000000000000000C2e324d24d7eEcd1fb", symbol: "AAPLc", name: "Apple Inc.", decimals: 8, category: "stock", native: false },
  { address: "0xb200000000000000000000d9192b6B456483C2E8", symbol: "AMZNc", name: "Amazon.com Inc.", decimals: 8, category: "stock", native: false },
  { address: "0xb2000000000000000000002D0BA3164cc74f58B7", symbol: "GOOGLc", name: "Alphabet Inc.", decimals: 8, category: "stock", native: false },
  { address: "0xb2000000000000000000008bC8786B856E61707C", symbol: "METAc", name: "Meta Platforms Inc.", decimals: 8, category: "stock", native: false },
  { address: "0xB200000000000000000000Ab99cFa739E253872B", symbol: "MSFTc", name: "Microsoft Corporation", decimals: 8, category: "stock", native: false },
  { address: "0xb2000000000000000000004884b426556b92883d", symbol: "MSTRc", name: "Strategy Inc.", decimals: 8, category: "stock", native: false },
  { address: "0xb20000000000000000000078ee7ce2fE4908108C", symbol: "NVDAc", name: "NVIDIA Corporation", decimals: 8, category: "stock", native: false },
  { address: "0xb200000000000000000000397293Cb8cda9a10c5", symbol: "SNDKc", name: "Sandisk Corporation", decimals: 8, category: "stock", native: false },
  { address: "0xb2000000000000000000007b9fcbd005511aCBd5", symbol: "SPCXc", name: "Space Exploration Technologies Corp.", decimals: 8, category: "stock", native: false },
  { address: "0xb2000000000000000000001e800a7f5189430cD0", symbol: "TSLAc", name: "Tesla Inc.", decimals: 8, category: "stock", native: false },
] as const satisfies readonly QuoteAsset[];

export type QuoteSymbol = (typeof QUOTE_ASSETS)[number]["symbol"];

const byAddress = new Map<string, QuoteAsset>(QUOTE_ASSETS.map((asset) => [asset.address.toLowerCase(), asset]));
const bySymbol = new Map<string, QuoteAsset>(QUOTE_ASSETS.map((asset) => [asset.symbol.toLowerCase(), asset]));

export function quoteAsset(address: Address | string): QuoteAsset | undefined {
  return byAddress.get(address.toLowerCase());
}

export function quoteAssetBySymbol(symbol: string): QuoteAsset | undefined {
  return bySymbol.get(symbol.toLowerCase());
}

export function quoteSymbol(address: Address | string) {
  return quoteAsset(address)?.symbol || "Unknown";
}

export function quoteDecimals(address: Address | string) {
  return quoteAsset(address)?.decimals ?? 18;
}

export function isNativeQuote(address: Address | string) {
  return quoteAsset(address)?.native ?? false;
}

export function isStockQuote(address: Address | string) {
  return quoteAsset(address)?.category === "stock";
}

export function configuredQuoteUsd(address: Address | string) {
  const asset = quoteAsset(address);
  if (!asset) return null;
  if (asset.symbol === "USDC") return 1;
  const value = Number(process.env[`${asset.symbol.toUpperCase()}_USD_PRICE`] || "");
  return Number.isFinite(value) && value > 0 ? value : null;
}
