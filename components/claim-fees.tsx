"use client";

import { formatUnits, type Address } from "viem";
import { useAccount, useReadContracts, useWriteContract } from "wagmi";
import { toast } from "sonner";
import { ADDRESSES } from "@/lib/chain";
import { escrowAbi } from "@/lib/abi/escrow";
import { QUOTE_ASSETS } from "@/lib/quotes";

export function ClaimFees() {
  const { address } = useAccount();
  const calls = address
    ? QUOTE_ASSETS.map((asset) => ({
        address: ADDRESSES.escrow,
        abi: escrowAbi,
        functionName: "owed" as const,
        args: [address, asset.address] as const,
      }))
    : [];
  const { data, refetch } = useReadContracts({ contracts: calls });
  const { writeContractAsync, isPending } = useWriteContract();

  async function claim(asset: Address, symbol: string) {
    try {
      const hash = await writeContractAsync({
        address: ADDRESSES.escrow,
        abi: escrowAbi,
        functionName: "claim",
        args: [asset],
      });
      toast.success(`${symbol} claim submitted: ${hash.slice(0, 10)}…`);
      await refetch();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Claim failed");
    }
  }

  if (!address)
    return (
      <div className="card p-5 text-sm text-twenty-muted">
        Connect the creator wallet to check claimable fees.
      </div>
    );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {QUOTE_ASSETS.map((asset, index) => {
        const raw = (data?.[index]?.result as bigint | undefined) || 0n;
        return (
          <div className="card p-5" key={asset.address}>
            <p className="text-sm text-twenty-muted">
              Claimable {asset.symbol}
            </p>
            <p className="my-3 truncate text-2xl font-semibold">
              {formatUnits(raw, asset.decimals)}
            </p>
            <button
              className="btn-primary w-full"
              disabled={isPending || raw === 0n}
              onClick={() => claim(asset.address, asset.symbol)}
            >
              Claim {asset.symbol}
            </button>
          </div>
        );
      })}
    </div>
  );
}
