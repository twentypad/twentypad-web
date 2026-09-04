"use client";
import { useEffect, useState } from "react";
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
import type { Token } from "@/lib/types";
import { ADDRESSES } from "@/lib/chain";
import { poolKey, quoterAbi, buildDirectSwap } from "@/lib/uniswap-v4";
import { erc20Abi } from "@/lib/abi/erc20";
import { permit2Abi } from "@/lib/abi/permit2";
import { toast } from "sonner";
import { Unaudited } from "./unaudited";
import { isNativeQuote, quoteDecimals, quoteSymbol } from "@/lib/quotes";
export function SwapTicket({ token }: { token: Token }) {
  const [buy, setBuy] = useState(true),
    [amount, setAmount] = useState(""),
    [out, setOut] = useState<bigint>(),
    [quoting, setQuoting] = useState(false),
    [working, setWorking] = useState(false),
    [slippage, setSlippage] = useState(15);
  const { address } = useAccount();
  const client = usePublicClient({ chainId: base.id });
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const quote = token.quote,
    pairDecimals = quoteDecimals(quote),
    pairSymbol = quoteSymbol(quote);
  const inputDecimals = buy ? pairDecimals : token.decimals;
  const inputAsset = buy ? quote : token.address;
  const inputIsNative = isNativeQuote(inputAsset);
  const nativeBalance = useBalance({
    address,
    chainId: base.id,
    query: {
      enabled: Boolean(address && inputIsNative),
      refetchInterval: 12_000,
    },
  });
  const tokenBalance = useReadContract({
    address: !inputIsNative ? inputAsset : undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: {
      enabled: Boolean(address && !inputIsNative),
      refetchInterval: 12_000,
    },
  });
  const inputBalance = inputIsNative
    ? nativeBalance.data?.value
    : (tokenBalance.data as bigint | undefined);
  const inputBalanceLoading = inputIsNative
    ? nativeBalance.isLoading
    : tokenBalance.isLoading;
  const inputSymbol = buy ? pairSymbol : token.symbol || "B20";

  function setBalancePercentage(percent: number) {
    if (inputBalance === undefined) return;
    let selected = (inputBalance * BigInt(percent)) / 100n;
    if (percent === 100 && inputIsNative) {
      const gasReserve = parseUnits("0.0005", 18);
      selected = inputBalance > gasReserve ? inputBalance - gasReserve : 0n;
    }
    setAmount(formatUnits(selected, inputDecimals));
  }
  useEffect(() => {
    const timer = setTimeout(async () => {
      setOut(undefined);
      if (!client || !amount || Number(amount) <= 0) return;
      const quoter = process.env.NEXT_PUBLIC_V4_QUOTER_ADDRESS as
        Address | undefined;
      if (!quoter) return;
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
      } catch (e) {
        toast.error(
          e instanceof Error ? e.message : "Dedicated hook quote failed",
        );
      } finally {
        setQuoting(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [amount, buy, client, inputDecimals, quote, token.address]);
  async function approve(asset: Address, amountIn: bigint) {
    if (isNativeQuote(asset)) return;
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
      const hash = await writeContractAsync({
        address: asset,
        abi: erc20Abi,
        functionName: "approve",
        args: [ADDRESSES.permit2, maxUint256],
      });
      await client.waitForTransactionReceipt({ hash });
    }
    const permitAllowance = await client.readContract({
      address: ADDRESSES.permit2,
      abi: permit2Abi,
      functionName: "allowance",
      args: [address, asset, ADDRESSES.router],
    });
    if (permitAllowance[0] < amountIn || permitAllowance[1] <= now + 1200) {
      const hash = await writeContractAsync({
        address: ADDRESSES.permit2,
        abi: permit2Abi,
        functionName: "approve",
        args: [asset, ADDRESSES.router, (1n << 160n) - 1n, expiry],
      });
      await client.waitForTransactionReceipt({ hash });
    }
  }
  async function swap() {
    if (!address || !out || !client) return;
    try {
      setWorking(true);
      const amountIn = parseUnits(amount, inputDecimals);
      await approve(buy ? quote : token.address, amountIn);
      const minOut = (out * BigInt(10_000 - slippage * 100)) / 10_000n;
      const tx = buildDirectSwap({
        token: token.address,
        quote,
        buy,
        amountIn,
        minOut,
        deadline: BigInt(Math.floor(Date.now() / 1000) + 1200),
      });
      await client.estimateGas({
        account: address,
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
      const hash = await sendTransactionAsync({
        to: tx.to,
        data: tx.data,
        value: tx.value,
      });
      await client.waitForTransactionReceipt({ hash });
      await fetch("/api/trades/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tx: hash, token: token.address }),
      });
      toast.success("Swap confirmed");
      setAmount("");
      await (inputIsNative ? nativeBalance.refetch() : tokenBalance.refetch());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Swap failed");
    } finally {
      setWorking(false);
    }
  }
  const anti = Math.max(
    0,
    20 -
      Math.floor((Date.now() - new Date(token.launched_at).getTime()) / 1000),
  );
  return (
    <div className="card p-5">
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((v) => (
          <button
            key={String(v)}
            onClick={() => setBuy(v)}
            className={buy === v ? "btn-primary" : "btn-secondary"}
          >
            {v ? "Buy" : "Sell"}
          </button>
        ))}
      </div>
      {anti > 0 && (
        <div className="mt-4 rounded-xl bg-twenty-warning/10 p-3 text-sm text-twenty-warning">
          Anti-snipe is active for about {anti}s. Fees decay from 99% to 1%;
          exact-output is blocked.
        </div>
      )}
      <div className="mt-5 flex items-center justify-between gap-3">
        <label className="label m-0">You pay</label>
        <span className="text-xs text-twenty-muted">
          Balance: {inputBalanceLoading
            ? "…"
            : inputBalance === undefined
              ? "—"
              : `${Number(formatUnits(inputBalance, inputDecimals)).toLocaleString(undefined, { maximumFractionDigits: 6 })} ${inputSymbol}`}
        </span>
      </div>
      <div className="relative">
        <input
          className="input pr-20 text-lg"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
        />
        <span className="absolute right-3 top-3 text-sm text-twenty-muted">
          {buy ? pairSymbol : token.symbol || "B20"}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {[10, 30, 50, 70, 100].map((percent) => (
          <button
            key={percent}
            type="button"
            disabled={inputBalance === undefined || inputBalance === 0n || working || isPending}
            onClick={() => setBalancePercentage(percent)}
            className="rounded-lg border border-twenty-line bg-twenty-navy px-1 py-2 text-xs font-semibold text-twenty-muted transition hover:border-twenty-blue hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {percent === 100 ? "Max" : `${percent}%`}
          </button>
        ))}
      </div>
      <label className="label mt-4">Estimated received</label>
      <div className="input flex items-center text-lg">
        {quoting
          ? "Quoting…"
          : out
            ? formatUnits(out, buy ? token.decimals : pairDecimals)
            : "—"}
      </div>
      {!process.env.NEXT_PUBLIC_V4_QUOTER_ADDRESS && (
        <p className="mt-2 text-xs text-twenty-warning">
          Dedicated v4 hook quoter is not configured. Generic Uniswap and
          aggregator quotes may not price this pool.
        </p>
      )}
      <div className="mt-4 flex items-center justify-between text-xs text-twenty-muted">
        <span>Slippage</span>
        <select
          value={slippage}
          onChange={(e) => setSlippage(Number(e.target.value))}
          className="rounded border border-twenty-line bg-twenty-navy p-2"
        >
          <option value={15}>15%</option>
          <option value={25}>25% new pools</option>
          <option value={5}>5%</option>
        </select>
      </div>
      <div className="mt-4 space-y-2 border-t border-twenty-line pt-4 text-xs text-twenty-muted">
        <div className="flex justify-between">
          <span>Fee</span>
          <span>1% after anti-snipe</span>
        </div>
        <div className="flex justify-between gap-4">
          <span>Route</span>
          <span className="text-right">Direct quote → v4 hook</span>
        </div>
      </div>
      <button
        className="btn-primary mt-5 w-full"
        disabled={!address || !out || working || isPending || anti > 0}
        onClick={swap}
      >
        {!address
          ? "Connect wallet"
          : working || isPending
            ? "Swapping…"
            : anti > 0
              ? "Wait for anti-snipe"
              : "Swap"}
      </button>
      <div className="mt-4">
        <Unaudited />
      </div>
    </div>
  );
}
