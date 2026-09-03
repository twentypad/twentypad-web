"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { ArrowDown, Check, Search, Settings2, X } from "lucide-react";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { formatUnits, maxUint256, parseUnits, type Address } from "viem";
import {
  useAccount,
  useBalance,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useWriteContract,
} from "wagmi";
import { base } from "wagmi/chains";
import { toast } from "sonner";
import type { Token } from "@/lib/types";
import { ADDRESSES } from "@/lib/chain";
import { shortAddress, label } from "@/lib/format";
import { buildDirectSwap, poolKey, quoterAbi } from "@/lib/uniswap-v4";
import { erc20Abi } from "@/lib/abi/erc20";
import { permit2Abi } from "@/lib/abi/permit2";
import { tokenImageUrl } from "./token-image";
import { Unaudited } from "./unaudited";

type SelectorSide = "pay" | "receive";

function isNative(address: Address) {
  return address.toLowerCase() === ADDRESSES.eth.toLowerCase();
}

function quoteName(address: Address) {
  return isNative(address) ? "ETH" : "USDC";
}

function displayedBalance(balance?: { value: bigint; decimals: number }) {
  if (!balance) return "—";
  const formatted = formatUnits(balance.value, balance.decimals);
  const numeric = Number(formatted);
  if (!Number.isFinite(numeric)) return formatted || "0";
  return numeric.toLocaleString(undefined, { maximumFractionDigits: 6 });
}

function exactBalance(balance?: { value: bigint; decimals: number }) {
  return balance ? formatUnits(balance.value, balance.decimals) : "";
}

function useAssetBalance({
  wallet,
  asset,
  decimals,
}: {
  wallet?: Address;
  asset?: Address;
  decimals: number;
}) {
  const native = Boolean(asset && isNative(asset));
  const nativeBalance = useBalance({
    address: wallet,
    chainId: base.id,
    query: {
      enabled: Boolean(wallet && asset && native),
      refetchInterval: 12_000,
    },
  });
  const tokenBalance = useReadContract({
    address: asset && !native ? asset : undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: wallet ? [wallet] : undefined,
    chainId: base.id,
    query: {
      enabled: Boolean(wallet && asset && !native),
      refetchInterval: 12_000,
    },
  });
  const tokenValue = tokenBalance.data as bigint | undefined;
  return {
    data: native
      ? nativeBalance.data
      : tokenValue === undefined
        ? undefined
        : { value: tokenValue, decimals },
    error: native ? nativeBalance.error : tokenBalance.error,
    isLoading: native ? nativeBalance.isLoading : tokenBalance.isLoading,
    refetch: native ? nativeBalance.refetch : tokenBalance.refetch,
  };
}

function AssetIcon({
  token,
  quote,
  size = 30,
}: {
  token?: Token;
  quote?: Address;
  size?: number;
}) {
  if (token) {
    return (
      <Image
        src={tokenImageUrl(token.image)}
        alt={label(token.symbol)}
        width={size}
        height={size}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
        unoptimized
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full bg-twenty-blue font-bold text-white"
      style={{ width: size, height: size }}
    >
      {quote && isNative(quote) ? "Ξ" : "$"}
    </span>
  );
}

export function SwapInterface({ tokens }: { tokens: Token[] }) {
  const [token, setToken] = useState<Token>();
  const [buy, setBuy] = useState(true);
  const [amount, setAmount] = useState("");
  const [out, setOut] = useState<bigint>();
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState("");
  const [working, setWorking] = useState(false);
  const [selector, setSelector] = useState<SelectorSide>();
  const [query, setQuery] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [slippage, setSlippage] = useState(15);
  const { address } = useAccount();
  const { openConnectModal } = useConnectModal();
  const client = usePublicClient({ chainId: base.id });
  const { sendTransactionAsync } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();

  const quote = token?.quote;
  const quoteDecimals =
    quote?.toLowerCase() === ADDRESSES.usdc.toLowerCase() ? 6 : 18;
  const inputAsset = token && quote ? (buy ? quote : token.address) : undefined;
  const outputAsset =
    token && quote ? (buy ? token.address : quote) : undefined;
  const inputDecimals = buy ? quoteDecimals : token?.decimals || 18;
  const outputDecimals = buy ? token?.decimals || 18 : quoteDecimals;
  const {
    data: inputBalance,
    error: inputBalanceError,
    isLoading: inputBalanceLoading,
    refetch: refetchInputBalance,
  } = useAssetBalance({
    wallet: address,
    asset: inputAsset,
    decimals: inputDecimals,
  });
  const {
    data: outputBalance,
    error: outputBalanceError,
    isLoading: outputBalanceLoading,
    refetch: refetchOutputBalance,
  } = useAssetBalance({
    wallet: address,
    asset: outputAsset,
    decimals: outputDecimals,
  });

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return tokens;
    return tokens.filter((item) =>
      [item.name, item.symbol, item.address].some((value) =>
        value.toLowerCase().includes(needle),
      ),
    );
  }, [query, tokens]);

  useEffect(() => {
    setOut(undefined);
    setQuoteError("");
    if (!token || !quote || !client || !amount || Number(amount) <= 0) return;
    const quoter = process.env.NEXT_PUBLIC_V4_QUOTER_ADDRESS as
      Address | undefined;
    if (!quoter) {
      setQuoteError("TwentyPad v4 quoter is not configured.");
      return;
    }
    const timer = setTimeout(async () => {
      try {
        setQuoting(true);
        const key = poolKey(token.address, quote);
        const zeroForOne = buy
          ? key.currency0 === quote
          : key.currency0 === token.address;
        const result = await client.readContract({
          address: quoter,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              poolKey: key,
              zeroForOne,
              exactAmount: parseUnits(amount, inputDecimals),
              hookData: "0x",
            },
          ],
        });
        setOut(result[0]);
      } catch (error) {
        setQuoteError(
          error instanceof Error ? error.message : "Unable to quote this swap.",
        );
      } finally {
        setQuoting(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [amount, buy, client, inputDecimals, quote, token]);

  function selectB20(nextToken: Token) {
    setToken(nextToken);
    setBuy(selector !== "pay");
    setAmount("");
    setOut(undefined);
    setSelector(undefined);
    setQuery("");
  }

  function selectQuote() {
    if (!token) return;
    setBuy(selector === "pay");
    setAmount("");
    setOut(undefined);
    setSelector(undefined);
    setQuery("");
  }

  function flip() {
    if (!token || working) return;
    setBuy((current) => !current);
    setAmount("");
    setOut(undefined);
  }

  async function approve(asset: Address, amountIn: bigint) {
    if (isNative(asset)) return;
    if (!client || !address) throw new Error("Wallet client is unavailable");
    const now = Math.floor(Date.now() / 1000);
    const expiry = now + 30 * 24 * 3600;
    const erc20Allowance = await client.readContract({
      address: asset,
      abi: erc20Abi,
      functionName: "allowance",
      args: [address, ADDRESSES.permit2],
    });
    if (erc20Allowance < amountIn) {
      const approval = await writeContractAsync({
        address: asset,
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDRESSES.permit2, maxUint256],
      });
      await client.waitForTransactionReceipt({ hash: approval });
    }
    const permitAllowance = await client.readContract({
      address: ADDRESSES.permit2,
      abi: permit2Abi,
      functionName: "allowance",
      args: [address, asset, ADDRESSES.router],
    });
    if (permitAllowance[0] < amountIn || permitAllowance[1] <= now + 1200) {
      const permit = await writeContractAsync({
        address: ADDRESSES.permit2,
        abi: permit2Abi,
        functionName: "approve",
        args: [asset, ADDRESSES.router, (1n << 160n) - 1n, expiry],
      });
      await client.waitForTransactionReceipt({ hash: permit });
    }
  }

  async function swap() {
    if (!token || !quote || !address || !out || !client || !inputAsset) return;
    try {
      setWorking(true);
      const amountIn = parseUnits(amount, inputDecimals);
      await approve(inputAsset, amountIn);
      const minOut = (out * BigInt(10_000 - slippage * 100)) / 10_000n;
      const transaction = buildDirectSwap({
        token: token.address,
        quote,
        buy,
        amountIn,
        minOut,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
      });
      await client.estimateGas({
        account: address,
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
      });
      const hash = await sendTransactionAsync({
        to: transaction.to,
        data: transaction.data,
        value: transaction.value,
      });
      await client.waitForTransactionReceipt({ hash });
      const indexed = await fetch("/api/trades/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tx: hash, token: token.address }),
      });
      if (!indexed.ok)
        throw new Error("Swap succeeded, but activity indexing failed.");
      toast.success("Swap confirmed");
      setAmount("");
      setOut(undefined);
      await Promise.all([refetchInputBalance(), refetchOutputBalance()]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Swap failed");
    } finally {
      setWorking(false);
    }
  }

  const anti = token
    ? Math.max(
        0,
        20 -
          Math.floor(
            (Date.now() - new Date(token.launched_at).getTime()) / 1000,
          ),
      )
    : 0;
  const payIsToken = Boolean(token && !buy);
  const receiveIsToken = Boolean(token && buy);

  function selectorButton(side: SelectorSide, isToken: boolean) {
    const selectedQuote = token && !isToken ? token.quote : undefined;
    return (
      <button
        disabled={working}
        onClick={() => setSelector(side)}
        className="inline-flex min-h-11 max-w-[55%] items-center gap-2 rounded-full bg-twenty-navy px-3 font-semibold hover:bg-twenty-line disabled:opacity-50"
      >
        {token ? (
          <AssetIcon
            token={isToken ? token : undefined}
            quote={selectedQuote}
          />
        ) : null}
        <span className="truncate">
          {token
            ? isToken
              ? label(token.symbol)
              : quoteName(token.quote)
            : "Select token"}
        </span>
        <span className="text-twenty-muted">⌄</span>
      </button>
    );
  }

  return (
    <>
      <div className="mx-auto w-full max-w-[480px]">
        <div className="mb-3 flex items-center justify-between px-1">
          <h1 className="text-xl font-semibold">Swap</h1>
          <button
            onClick={() => setSettingsOpen((value) => !value)}
            className="grid h-10 w-10 place-items-center rounded-xl hover:bg-twenty-surface"
            aria-label="Swap settings"
          >
            <Settings2 size={19} />
          </button>
        </div>
        <div className="rounded-3xl border border-twenty-line bg-twenty-surface p-2 shadow-2xl">
          {settingsOpen && (
            <div className="mb-2 rounded-2xl bg-twenty-navy-2 p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Slippage tolerance</span>
                <select
                  value={slippage}
                  onChange={(event) => setSlippage(Number(event.target.value))}
                  className="rounded-lg border border-twenty-line bg-twenty-navy px-3 py-2 text-sm"
                >
                  <option value={5}>5%</option>
                  <option value={15}>15%</option>
                  <option value={25}>25%</option>
                </select>
              </div>
            </div>
          )}
          <div className="rounded-2xl bg-twenty-navy-2 p-4">
            <div className="mb-5 flex items-center justify-between text-sm text-twenty-muted">
              <span>You pay</span>
              <span>
                Balance:{" "}
                {inputBalanceLoading ? "…" : displayedBalance(inputBalance)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <input
                aria-label="Amount to pay"
                inputMode="decimal"
                value={amount}
                disabled={working}
                onChange={(event) =>
                  setAmount(event.target.value.replace(/[^0-9.]/g, ""))
                }
                placeholder="0"
                className="min-w-0 flex-1 bg-transparent text-4xl outline-none placeholder:text-twenty-muted/50 disabled:opacity-50"
              />
              {selectorButton("pay", payIsToken)}
            </div>
            {inputBalance && (
              <button
                disabled={working}
                onClick={() => setAmount(exactBalance(inputBalance))}
                className="mt-3 text-xs font-semibold text-twenty-blue-soft"
              >
                Max
              </button>
            )}
          </div>
          <div className="relative z-10 -my-2 flex justify-center">
            <button
              disabled={!token || working}
              onClick={flip}
              className="grid h-10 w-10 place-items-center rounded-xl border-4 border-twenty-surface bg-twenty-navy-2 hover:bg-twenty-line disabled:opacity-50"
              aria-label="Switch swap direction"
            >
              <ArrowDown size={17} />
            </button>
          </div>
          <div className="rounded-2xl bg-twenty-navy-2 p-4">
            <div className="mb-5 flex items-center justify-between text-sm text-twenty-muted">
              <span>You receive</span>
              <span>
                Balance:{" "}
                {outputBalanceLoading ? "…" : displayedBalance(outputBalance)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0 flex-1 truncate text-4xl text-twenty-muted">
                {quoting ? "…" : out ? formatUnits(out, outputDecimals) : "0"}
              </div>
              {selectorButton("receive", receiveIsToken)}
            </div>
          </div>
          {token && (
            <div className="px-3 pb-2 pt-4 text-xs text-twenty-muted">
              <div className="flex justify-between">
                <span>Fee after anti-snipe</span>
                <span>1%</span>
              </div>
              <div className="mt-2 flex justify-between">
                <span>Minimum received</span>
                <span>
                  {out
                    ? formatUnits(
                        (out * BigInt(10_000 - slippage * 100)) / 10_000n,
                        outputDecimals,
                      )
                    : "—"}
                </span>
              </div>
              <div className="mt-2 flex justify-between gap-5">
                <span>Route</span>
                <span className="text-right">Direct TwentyPad v4 hook</span>
              </div>
            </div>
          )}
          {quoteError && (
            <p className="mx-3 my-3 line-clamp-3 text-xs text-twenty-warning">
              {quoteError}
            </p>
          )}
          {(inputBalanceError || outputBalanceError) && (
            <p className="mx-3 my-3 text-xs text-twenty-danger">
              Wallet balance unavailable. Check the Base RPC connection and try
              again.
            </p>
          )}
          {anti > 0 && (
            <p className="mx-3 my-3 text-xs text-twenty-warning">
              Anti-snipe is active for approximately {anti}s.
            </p>
          )}
          <button
            onClick={!address ? openConnectModal : swap}
            disabled={Boolean(
              address && (!token || !out || working || anti > 0),
            )}
            className="btn-primary mt-2 w-full rounded-2xl py-4 text-base"
          >
            {!address
              ? "Connect wallet"
              : !token
                ? "Select a token"
                : working
                  ? "Confirming…"
                  : anti > 0
                    ? "Wait for anti-snipe"
                    : quoteError
                      ? "Quote unavailable"
                      : "Swap"}
          </button>
        </div>
        <div className="mt-4">
          <Unaudited />
        </div>
      </div>

      {selector && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          onClick={() => setSelector(undefined)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Select a token"
            className="max-h-[82vh] w-full max-w-md overflow-hidden rounded-t-3xl border border-twenty-line bg-twenty-navy-2 shadow-2xl sm:rounded-3xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5">
              <h2 className="text-lg font-semibold">Select a token</h2>
              <button
                onClick={() => setSelector(undefined)}
                className="grid h-9 w-9 place-items-center rounded-lg hover:bg-twenty-surface"
                aria-label="Close token selector"
              >
                <X size={19} />
              </button>
            </div>
            <div className="relative px-4">
              <Search
                className="pointer-events-none absolute left-7 top-1/2 -translate-y-1/2 text-twenty-muted"
                size={18}
              />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name or paste address"
                className="input pl-11"
              />
            </div>
            {token && (
              <div className="px-4 pt-4">
                <button
                  onClick={selectQuote}
                  className="flex w-full items-center gap-3 rounded-2xl border border-twenty-line p-3 text-left hover:bg-twenty-surface"
                >
                  <AssetIcon quote={token.quote} size={38} />
                  <div>
                    <div className="font-semibold">
                      {quoteName(token.quote)}
                    </div>
                    <div className="text-xs text-twenty-muted">
                      Base · pool quote token
                    </div>
                  </div>
                  {((selector === "pay" && buy) ||
                    (selector === "receive" && !buy)) && (
                    <Check
                      className="ml-auto text-twenty-blue-soft"
                      size={18}
                    />
                  )}
                </button>
              </div>
            )}
            <div className="mt-4 max-h-[52vh] overflow-y-auto border-t border-twenty-line p-2">
              {filtered.map((item) => (
                <button
                  key={item.address}
                  onClick={() => selectB20(item)}
                  className="flex w-full items-center gap-3 rounded-2xl p-3 text-left hover:bg-twenty-surface"
                >
                  <AssetIcon token={item} size={40} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">
                        {label(item.symbol)}
                      </span>
                      <span className="text-xs text-twenty-muted">
                        {quoteName(item.quote)} pair
                      </span>
                    </div>
                    <div className="truncate text-sm text-twenty-muted">
                      {label(item.name)} · {shortAddress(item.address)}
                    </div>
                  </div>
                  {token?.address.toLowerCase() ===
                    item.address.toLowerCase() &&
                    ((selector === "pay" && !buy) ||
                      (selector === "receive" && buy)) && (
                      <Check
                        className="ml-auto shrink-0 text-twenty-blue-soft"
                        size={18}
                      />
                    )}
                </button>
              ))}
              {!filtered.length && (
                <div className="p-8 text-center text-sm text-twenty-muted">
                  No indexed TwentyPad token found.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
