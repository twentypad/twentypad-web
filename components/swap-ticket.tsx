"use client";

import { useEffect, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { useAccount, useBalance, usePublicClient, useReadContract, useSendTransaction, useWriteContract } from "wagmi";
import { base } from "wagmi/chains";
import { toast } from "sonner";
import type { Token } from "@/lib/types";
import { ADDRESSES } from "@/lib/chain";
import { erc20Abi } from "@/lib/abi/erc20";
import { isNativeQuote, isStockQuote, quoteDecimals, quoteSymbol } from "@/lib/quotes";
import { buildAdapterTransaction, buildBridgePlan, quoteAdapterSwap, swapRouterAddress, type AdapterQuote } from "@/lib/twentypad-swap-router";
import { Unaudited } from "./unaudited";

export function SwapTicket({ token }: { token: Token }) {
  const [buy, setBuy] = useState(true);
  const [settlement, setSettlement] = useState<Address>(
    isStockQuote(token.quote) ? ADDRESSES.usdc : token.quote,
  );
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<AdapterQuote>();
  const [quoteError, setQuoteError] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [working, setWorking] = useState(false);
  const [slippage, setSlippage] = useState(5);
  const { address } = useAccount();
  const client = usePublicClient({ chainId: base.id });
  const { sendTransactionAsync, isPending } = useSendTransaction();
  const { writeContractAsync } = useWriteContract();
  const inputAsset = buy ? settlement : token.address;
  const inputDecimals = buy ? quoteDecimals(settlement) : token.decimals;
  const outputDecimals = buy ? token.decimals : quoteDecimals(settlement);
  const inputIsNative = isNativeQuote(inputAsset);
  const nativeBalance = useBalance({ address, chainId: base.id, query: { enabled: Boolean(address && inputIsNative), refetchInterval: 12_000 } });
  const tokenBalance = useReadContract({
    address: !inputIsNative ? inputAsset : undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: Boolean(address && !inputIsNative), refetchInterval: 12_000 },
  });
  const inputBalance = inputIsNative ? nativeBalance.data?.value : (tokenBalance.data as bigint | undefined);

  useEffect(() => {
    const timer = setTimeout(async () => {
      setQuote(undefined);
      setQuoteError("");
      if (!client || !amount || Number(amount) <= 0) return;
      try {
        setQuoting(true);
        setQuote(await quoteAdapterSwap({ client, buy, launchToken: token.address, quoteToken: token.quote, settlementToken: settlement, amountIn: parseUnits(amount, inputDecimals) }));
      } catch (error) {
        setQuoteError(error instanceof Error ? error.message : "No executable route is available.");
      } finally {
        setQuoting(false);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [amount, buy, client, inputDecimals, settlement, token.address, token.quote]);

  function setBalancePercentage(percent: number) {
    if (inputBalance === undefined) return;
    let selected = (inputBalance * BigInt(percent)) / 100n;
    if (percent === 100 && inputIsNative) {
      const reserve = parseUnits("0.0005", 18);
      selected = inputBalance > reserve ? inputBalance - reserve : 0n;
    }
    setAmount(formatUnits(selected, inputDecimals));
  }

  async function approve(asset: Address, amountIn: bigint) {
    if (isNativeQuote(asset)) return;
    if (!client || !address) throw new Error("Wallet client is unavailable.");
    const allowance = await client.readContract({ address: asset, abi: erc20Abi, functionName: "allowance", args: [address, swapRouterAddress()] });
    if (allowance >= amountIn) return;
    const hash = await writeContractAsync({ address: asset, abi: erc20Abi, functionName: "approve", args: [swapRouterAddress(), amountIn] });
    await client.waitForTransactionReceipt({ hash });
  }

  async function swap() {
    if (!address || !quote || !client) return;
    try {
      setWorking(true);
      const amountIn = parseUnits(amount, inputDecimals);
      await approve(inputAsset, amountIn);
      const multiplier = BigInt(10_000 - slippage * 100);
      const minQuoteOut = (quote.quoteOut * multiplier) / 10_000n;
      const minFinalOut = (quote.finalOut * multiplier) / 10_000n;
      const bridge = quote.bridge
        ? buildBridgePlan({ tokenIn: buy ? settlement : token.quote, tokenOut: buy ? token.quote : settlement, amountIn: buy ? amountIn : quote.quoteOut, minOut: buy ? minQuoteOut : minFinalOut, path: quote.bridge.path })
        : { commands: "0x" as const, inputs: [] };
      const transaction = buildAdapterTransaction({ buy, launchToken: token.address, quoteToken: token.quote, settlementToken: settlement, amountIn, minQuoteOut, minFinalOut, deadline: BigInt(Math.floor(Date.now() / 1000) + 1200), recipient: address, bridge });
      await client.estimateGas({ account: address, ...transaction });
      const hash = await sendTransactionAsync(transaction);
      await client.waitForTransactionReceipt({ hash });
      await fetch("/api/trades/upsert", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tx: hash, token: token.address }) });
      toast.success("Swap confirmed");
      setAmount("");
      setQuote(undefined);
      await (inputIsNative ? nativeBalance.refetch() : tokenBalance.refetch());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Swap failed");
    } finally {
      setWorking(false);
    }
  }

  const anti = Math.max(0, 20 - Math.floor((Date.now() - new Date(token.launched_at).getTime()) / 1000));
  const busy = working || isPending;
  return (
    <div className="card p-5">
      <div className="grid grid-cols-2 gap-2">
        {[true, false].map((value) => <button key={String(value)} onClick={() => { setBuy(value); setAmount(""); setQuote(undefined); }} className={buy === value ? "btn-primary" : "btn-secondary"}>{value ? "Buy" : "Sell"}</button>)}
      </div>
      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-twenty-muted">{buy ? "Pay with" : "Receive"}</span>
        <div className="grid grid-cols-2 gap-1 rounded-xl bg-twenty-navy-2 p-1">
          {[ADDRESSES.eth, ADDRESSES.usdc].map((asset) => (
            <button key={asset} onClick={() => { setSettlement(asset); setAmount(""); setQuote(undefined); }} className={`rounded-lg px-3 py-2 text-sm font-semibold ${settlement.toLowerCase() === asset.toLowerCase() ? "bg-twenty-blue text-white" : "text-twenty-muted"}`}>{quoteSymbol(asset)}</button>
          ))}
        </div>
      </div>
      {anti > 0 && <div className="mt-4 rounded-xl bg-twenty-warning/10 p-3 text-sm text-twenty-warning">Anti-snipe is active for about {anti}s.</div>}
      <div className="mt-5 flex items-center justify-between gap-3">
        <label className="label m-0">You pay</label>
        <span className="text-xs text-twenty-muted">Balance: {inputBalance === undefined ? "—" : formatUnits(inputBalance, inputDecimals)}</span>
      </div>
      <div className="relative">
        <input className="input pr-24 text-lg" inputMode="decimal" value={amount} disabled={busy} onChange={(event) => setAmount(event.target.value.replace(/[^0-9.]/g, ""))} />
        <span className="absolute right-3 top-3 text-sm text-twenty-muted">{buy ? quoteSymbol(settlement) : token.symbol || "B20"}</span>
      </div>
      <div className="mt-2 grid grid-cols-5 gap-1.5">
        {[10, 30, 50, 70, 100].map((percent) => <button key={percent} disabled={inputBalance === undefined || inputBalance === 0n || busy} onClick={() => setBalancePercentage(percent)} className="rounded-lg border border-twenty-line bg-twenty-navy px-1 py-2 text-xs font-semibold text-twenty-muted hover:border-twenty-blue hover:text-white disabled:opacity-40">{percent === 100 ? "Max" : `${percent}%`}</button>)}
      </div>
      <label className="label mt-4">Estimated received</label>
      <div className="input flex items-center text-lg">{quoting ? "Quoting…" : quote ? formatUnits(quote.finalOut, outputDecimals) : "—"}</div>
      {quoteError && <p className="mt-2 text-xs text-twenty-warning">{quoteError}</p>}
      <div className="mt-4 flex items-center justify-between text-xs text-twenty-muted">
        <span>Slippage per leg</span>
        <select value={slippage} onChange={(event) => setSlippage(Number(event.target.value))} className="rounded border border-twenty-line bg-twenty-navy p-2"><option value={5}>5%</option><option value={15}>15%</option><option value={25}>25% new pools</option></select>
      </div>
      <div className="mt-4 border-t border-twenty-line pt-4 text-xs text-twenty-muted"><div className="flex justify-between gap-4"><span>Route</span><span className="text-right">{quote?.route || "—"}</span></div></div>
      <button className="btn-primary mt-5 w-full" disabled={!address || !quote || busy || anti > 0 || Boolean(quoteError)} onClick={swap}>{!address ? "Connect wallet" : busy ? "Swapping…" : anti > 0 ? "Wait for anti-snipe" : "Swap"}</button>
      <div className="mt-4"><Unaudited /></div>
    </div>
  );
}
