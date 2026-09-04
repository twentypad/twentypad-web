"use client";
import { useState } from "react";
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useSwitchChain,
} from "wagmi";
import { base } from "wagmi/chains";
import { decodeEventLog, type Address, type Hex } from "viem";
import { ADDRESSES } from "@/lib/chain";
import { factoryAbi } from "@/lib/abi/factory";
import { mineSalt } from "@/lib/salt-miner";
import { TokenImage } from "./token-image";
import { Unaudited } from "./unaudited";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { prepareTokenImage } from "@/lib/image-upload";
import { QUOTE_ASSETS, quoteAsset } from "@/lib/quotes";
type Form = {
  name: string;
  symbol: string;
  quote: Address;
  image: string;
  description: string;
  website: string;
  twitter: string;
  telegram: string;
  discord: string;
  editable: boolean;
};
type LaunchStage = "idle" | "wallet" | "confirming" | "indexing" | "success";
const initial: Form = {
  name: "",
  symbol: "",
  quote: ADDRESSES.eth,
  image: "",
  description: "",
  website: "",
  twitter: "",
  telegram: "",
  discord: "",
  editable: true,
};
export function CreateForm() {
  const [f, setF] = useState(initial),
    [salt, setSalt] = useState<Hex>(),
    [predicted, setPredicted] = useState<Address>(),
    [mining, setMining] = useState(false),
    [progress, setProgress] = useState(0),
    [review, setReview] = useState(false),
    [uploading, setUploading] = useState(false),
    [launchStage, setLaunchStage] = useState<LaunchStage>("idle");
  const { address, chainId } = useAccount();
  const client = usePublicClient({ chainId: base.id });
  const { writeContractAsync, isPending } = useWriteContract();
  const { switchChainAsync } = useSwitchChain();
  const router = useRouter();
  const update = <K extends keyof Form>(k: K, v: Form[K]) => {
    setF((x) => ({ ...x, [k]: v }));
    setSalt(undefined);
    setPredicted(undefined);
  };
  async function uploadImage(file?: File) {
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await prepareTokenImage(file);
      const body = new FormData();
      body.append("file", prepared);
      const response = await fetch("/api/upload", { method: "POST", body });
      const result = (await response.json()) as { uri?: string; error?: string };
      if (!response.ok || !result.uri) {
        throw new Error(result.error || "Image upload failed");
      }
      update("image", result.uri);
      toast.success("Image uploaded to IPFS");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Image upload failed");
    } finally {
      setUploading(false);
    }
  }
  async function findSalt() {
    if (!client) return;
    setMining(true);
    setProgress(0);
    try {
      const [last, suffix] = await Promise.all([
        client.readContract({
          address: ADDRESSES.factory,
          abi: factoryAbi,
          functionName: "lastSaltUint",
        }),
        client.readContract({
          address: ADDRESSES.factory,
          abi: factoryAbi,
          functionName: "tokenSuffix",
        }),
      ]);
      const r = await mineSalt(client, last + 1n, suffix, 50_000, setProgress);
      setSalt(r.salt);
      setPredicted(r.address);
      toast.success(
        `Found ${r.address.slice(-3)} in ${r.attempts.toLocaleString()} attempts`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Salt search failed");
    } finally {
      setMining(false);
    }
  }
  async function submit() {
    if (!address || !client || !salt) return;
    setLaunchStage("wallet");
    try {
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
      }
      const hash = await writeContractAsync({
        address: ADDRESSES.factory,
        abi: factoryAbi,
        functionName: "createLaunch",
        args: [
          {
            name: f.name.trim(),
            symbol: f.symbol.trim(),
            salt,
            quote: f.quote,
            profile: {
              image: f.image.trim(),
              description: f.description.trim(),
              website: f.website.trim(),
              twitter: f.twitter.trim(),
              telegram: f.telegram.trim(),
              discord: f.discord.trim(),
              editable: f.editable,
            },
          },
        ],
        gas: 4_500_000n,
      });
      setLaunchStage("confirming");
      const receipt = await client.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("The launch transaction reverted");
      }
      let token = predicted;
      for (const log of receipt.logs) {
        try {
          const d = decodeEventLog({
            abi: factoryAbi,
            data: log.data,
            topics: log.topics,
          });
          if (d.eventName === "Launched") token = d.args.token;
        } catch {}
      }
      if (!token) throw new Error("Launched token address was not found in receipt");
      setLaunchStage("indexing");
      const indexed = await fetch("/api/tokens/upsert", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tx: hash }),
      });
      if (!indexed.ok) {
        const result = (await indexed.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(result?.error || "Token launched, but indexing failed");
      }
      setLaunchStage("success");
      toast.success("B20 launched");
      router.replace(`/token/${token}`);
    } catch (e) {
      setLaunchStage("idle");
      toast.error(e instanceof Error ? e.message : "Launch failed");
    }
  }
  const launching = launchStage !== "idle";
  const selectedQuote = quoteAsset(f.quote) || QUOTE_ASSETS[0];
  const valid =
    f.name.trim().length > 0 &&
    f.name.length <= 50 &&
    /^[^\s]{1,11}$/.test(f.symbol);
  return (
    <div
      className={`grid gap-6 lg:grid-cols-[1.2fr_.8fr] ${launching ? "pointer-events-none select-none" : ""}`}
      aria-busy={launching}
    >
      <form
        className="card space-y-5 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) setReview(true);
        }}
      >
        <div>
          <label className="label">Token image</label>
          <label className="btn-secondary mb-3 w-full cursor-pointer">
            {uploading ? "Compressing and uploading…" : "Upload to IPFS via Pinata"}
            <input
              className="sr-only"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              disabled={uploading || launching}
              onChange={(event) => {
                void uploadImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
          </label>
          <input
            className="input"
            type="url"
            value={f.image}
            onChange={(e) => update("image", e.target.value)}
            placeholder="https://… or ipfs://…"
          />
          <p className="mt-1 text-xs text-twenty-muted">
            PNG, JPG, WebP, or GIF, max 2MB after compression. You can also paste
            an existing HTTPS or ipfs:// URL.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Name *</label>
            <input
              className="input"
              maxLength={50}
              required
              value={f.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </div>
          <div>
            <label className="label">Symbol *</label>
            <input
              className="input"
              maxLength={11}
              required
              pattern="[^\s]+"
              value={f.symbol}
              onChange={(e) => update("symbol", e.target.value)}
              placeholder="TWENTY"
            />
          </div>
        </div>
        <div>
          <label className="label">Pair</label>
          <p className="mb-2 text-xs text-twenty-muted">Core assets</p>
          <div className="grid grid-cols-2 gap-2">
            {QUOTE_ASSETS.filter((asset) => asset.category === "core").map((asset) => (
              <button
                type="button"
                disabled={launching}
                onClick={() => update("quote", asset.address)}
                className={f.quote.toLowerCase() === asset.address.toLowerCase() ? "btn-primary" : "btn-secondary"}
                key={asset.address}
              >
                {asset.symbol}
              </button>
            ))}
          </div>
          <p className="mb-2 mt-4 text-xs text-twenty-muted">Tokenized stocks on Base</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {QUOTE_ASSETS.filter((asset) => asset.category === "stock").map((asset) => (
              <button
                type="button"
                disabled={launching}
                onClick={() => update("quote", asset.address)}
                className={f.quote.toLowerCase() === asset.address.toLowerCase() ? "btn-primary" : "btn-secondary"}
                key={asset.address}
                title={asset.name}
              >
                {asset.symbol}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-twenty-muted">
            Selected: {selectedQuote.name} ({selectedQuote.symbol}) · {selectedQuote.decimals} decimals
          </p>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="input min-h-24 py-3"
            value={f.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {(["website", "twitter", "telegram", "discord"] as const).map((k) => (
            <div key={k}>
              <label className="label capitalize">
                {k === "twitter" ? "X" : k}
              </label>
              <input
                className="input"
                value={f[k]}
                onChange={(e) => update(k, e.target.value)}
              />
            </div>
          ))}
        </div>
        <label className="flex items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={f.editable}
            onChange={(e) => update("editable", e.target.checked)}
            className="h-4 w-4"
          />{" "}
          Allow creator to edit profile later
        </label>
        <button
          className="btn-primary w-full"
          disabled={!valid || !address || launching}
        >
          {address ? "Review launch" : "Connect wallet to launch"}
        </button>
        <Unaudited />
      </form>
      <aside className="space-y-4">
        <div className="card p-5">
          <div className="flex items-center gap-3">
            <TokenImage src={f.image} alt={f.name || "Preview"} size={56} />
            <div>
              <h2 className="text-xl font-semibold">
                {f.name || "Token name"}
              </h2>
              <p className="text-twenty-muted">
                ${f.symbol || "SYMBOL"} / {selectedQuote.symbol}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3 text-sm">
            {[
              ["Supply", "1,000,000,000"],
              ["Opening FDV", "~$4,000"],
              ["Pool", "Uniswap v4 · LP locked"],
              ["Swap fee", "1% · 70% creator / 30% platform"],
              ["Anti-snipe", "99% → 1% over 20s"],
              ["Protocol launch fee", "0 ETH · Base gas only"],
            ].map(([a, b]) => (
              <div
                className="flex justify-between gap-3 border-b border-twenty-line pb-2"
                key={a}
              >
                <span className="text-twenty-muted">{a}</span>
                <span className="text-right">{b}</span>
              </div>
            ))}
          </div>
          <button
            className="btn-secondary mt-5 w-full"
            onClick={findSalt}
            disabled={mining || !valid || launching}
          >
            {mining
              ? `Finding a ca7 address… ${progress.toLocaleString()}`
              : predicted
                ? "Mine another ca7 address"
                : "Find ca7 address"}
          </button>
          {predicted && (
            <p className="mt-3 break-all rounded-lg bg-twenty-navy p-3 font-mono text-xs text-twenty-ca7">
              {predicted}
            </p>
          )}
        </div>
      </aside>
      {review && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4">
          <div className="card max-w-lg p-6">
            <h2 className="text-2xl font-semibold">Review launch</h2>
            <p className="mt-2 text-twenty-muted">
              {f.name} (${f.symbol}) paired with {selectedQuote.symbol}. Fixed 1B supply;
              position permanently locked.
            </p>
            {predicted ? (
              <p className="mt-4 break-all font-mono text-xs">{predicted}</p>
            ) : (
              <button
                onClick={findSalt}
                className="btn-secondary mt-4 w-full"
                disabled={mining || launching}
              >
                {mining
                  ? "Finding a ca7 address…"
                  : "Mine required ca7 address"}
              </button>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setReview(false)}
                disabled={launching}
                className="btn-secondary flex-1"
              >
                Back
              </button>
              <button
                onClick={submit}
                disabled={!predicted || isPending || launching}
                className="btn-primary flex-1"
              >
                {isPending ? "Launching…" : "Launch · value 0"}
              </button>
            </div>
          </div>
        </div>
      )}
      {launching && (
        <div className="pointer-events-auto fixed inset-0 z-[100] grid place-items-center bg-twenty-navy/85 p-4 backdrop-blur-sm">
          <div className="card w-full max-w-md p-7 text-center shadow-glow">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-twenty-line border-t-twenty-blue" />
            <h2 className="mt-5 text-xl font-semibold">
              {launchStage === "wallet" && "Confirm launch in your wallet"}
              {launchStage === "confirming" && "Deploying token…"}
              {launchStage === "indexing" && "Saving token details…"}
              {launchStage === "success" && "Token created"}
            </h2>
            <p className="mt-2 text-sm text-twenty-muted">
              {launchStage === "wallet"
                ? "Do not refresh or submit another transaction."
                : launchStage === "success"
                  ? "Opening the token details page…"
                  : "Waiting for Base confirmation. Keep this page open."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
