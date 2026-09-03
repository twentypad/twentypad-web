import {
  createPublicClient,
  decodeEventLog,
  http,
  formatUnits,
  type Address,
  type Hex,
} from "viem";
import { base } from "viem/chains";
import { ADDRESSES } from "@/lib/chain";
import { requireServerRpcUrl } from "@/lib/server-rpc";
import { factoryAbi } from "@/lib/abi/factory";
import { serverSupabase } from "@/lib/supabase/server";
import { text } from "@/lib/types";
import { configuredEthUsd, marketEstimate } from "@/lib/market/tick-price";
import { poolManagerAbi } from "@/lib/abi/pool-manager";
const tokenAbi = [
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
] as const;
const client = createPublicClient({
  chain: base,
  transport: http(requireServerRpcUrl()),
});

const blockRange = BigInt(process.env.INDEXER_BLOCK_RANGE || "10");
const requestDelayMs = Number(process.env.INDEXER_REQUEST_DELAY_MS || "250");
const retryAttempts = Number(process.env.INDEXER_RETRY_ATTEMPTS || "5");

if (blockRange < 1n) throw new Error("INDEXER_BLOCK_RANGE must be at least 1");

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function rpcRequest<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retryAttempts; attempt++) {
    try {
      const result = await operation();
      if (requestDelayMs > 0) await wait(requestDelayMs);
      return result;
    } catch (error) {
      lastError = error;
      if (attempt + 1 < retryAttempts) {
        await wait(Math.min(5_000, requestDelayMs * 2 ** attempt));
      }
    }
  }
  throw lastError;
}

type DatabaseClient = NonNullable<ReturnType<typeof serverSupabase>>;

type LaunchedToken = {
  token: Address;
  creator: Address;
  poolId: Hex;
  quote: Address;
  initialTick: number;
  blockNumber: bigint;
  transactionHash: Hex;
};

type IndexedToken = {
  address: Address;
  quote: Address;
  decimals: number;
  pool_id: Hex;
};

async function upsertSwap(
  db: DatabaseClient,
  token: IndexedToken,
  log: {
    blockNumber: bigint;
    transactionHash: Hex;
    args: { amount0: bigint; amount1: bigint; tick: number };
  },
) {
  const tokenIs0 = BigInt(token.address) < BigInt(token.quote);
  const tokenDelta = tokenIs0 ? log.args.amount0 : log.args.amount1;
  const quoteDelta = tokenIs0 ? log.args.amount1 : log.args.amount0;
  const block = await rpcRequest(() =>
    client.getBlock({ blockNumber: log.blockNumber }),
  );
  const transaction = await rpcRequest(() =>
    client.getTransaction({ hash: log.transactionHash }),
  );
  const amountToken = Number(
    formatUnits(tokenDelta < 0n ? -tokenDelta : tokenDelta, token.decimals),
  );
  const quoteDecimals =
    token.quote.toLowerCase() === ADDRESSES.usdc.toLowerCase() ? 6 : 18;
  const amountQuote = Number(
    formatUnits(quoteDelta < 0n ? -quoteDelta : quoteDelta, quoteDecimals),
  );
  const signedQuote = Number(formatUnits(quoteDelta, quoteDecimals));
  const estimate = marketEstimate({
    tick: Number(log.args.tick),
    token: token.address,
    quote: token.quote,
    tokenDecimals: token.decimals,
    ethUsd: configuredEthUsd(),
  });
  const { error } = await db.from("trades").upsert(
    {
      token: token.address.toLowerCase(),
      tx: log.transactionHash.toLowerCase(),
      block_number: Number(log.blockNumber),
      timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
      trader: transaction.from.toLowerCase(),
      side: tokenDelta > 0n ? "buy" : "sell",
      amount_token: amountToken,
      amount_quote: amountQuote,
      quote_delta: -signedQuote,
      price_quote: estimate.priceQuote,
      price_usd: estimate.priceUsd,
      tick: Number(log.args.tick),
      indexer_version: 2,
    },
    { onConflict: "tx" },
  );
  if (error) throw error;
  const { error: statsError } = await db
    .from("token_stats")
    .update({
      price_quote: estimate.priceQuote,
      price_usd: estimate.priceUsd,
      fdv_quote: estimate.fdvQuote,
      fdv_usd: estimate.fdvUsd,
      current_tick: Number(log.args.tick),
      updated_at: new Date().toISOString(),
    })
    .eq("address", token.address.toLowerCase());
  if (statsError) throw statsError;
  const { error: refreshError } = await db.rpc("refresh_token_activity", {
    p_token: token.address.toLowerCase(),
  });
  if (refreshError) throw refreshError;
}

async function indexSwaps(
  db: DatabaseClient,
  fromBlock: bigint,
  toBlock: bigint,
) {
  const { data, error } = await db
    .from("tokens")
    .select("address,quote,decimals,pool_id");
  if (error) throw error;
  const byPool = new Map(
    (data || []).map((row) => [row.pool_id.toLowerCase(), row as IndexedToken]),
  );
  if (!byPool.size) return 0;
  const logs = await rpcRequest(() =>
    client.getLogs({
      address: ADDRESSES.poolManager,
      event: poolManagerAbi[0],
      fromBlock,
      toBlock,
    }),
  );
  let count = 0;
  for (const log of logs) {
    if (log.args.id === undefined) continue;
    const token = byPool.get(log.args.id.toLowerCase());
    if (
      !token ||
      log.args.amount0 === undefined ||
      log.args.amount1 === undefined ||
      log.args.tick === undefined
    )
      continue;
    await upsertSwap(db, token, {
      blockNumber: log.blockNumber,
      transactionHash: log.transactionHash,
      args: {
        amount0: log.args.amount0,
        amount1: log.args.amount1,
        tick: log.args.tick,
      },
    });
    count++;
  }
  return count;
}

async function upsertLaunchedToken(db: DatabaseClient, launch: LaunchedToken) {
  const { token, creator, poolId, quote, initialTick } = launch;
  const name = await rpcRequest(() =>
    client.readContract({
      address: token,
      abi: tokenAbi,
      functionName: "name",
    }),
  );
  const symbol = await rpcRequest(() =>
    client.readContract({
      address: token,
      abi: tokenAbi,
      functionName: "symbol",
    }),
  );
  const decimals = await rpcRequest(() =>
    client.readContract({
      address: token,
      abi: tokenAbi,
      functionName: "decimals",
    }),
  );
  const profile = await rpcRequest(() =>
    client.readContract({
      address: ADDRESSES.factory,
      abi: factoryAbi,
      functionName: "profiles",
      args: [token],
    }),
  );
  const block = await rpcRequest(() =>
    client.getBlock({ blockNumber: launch.blockNumber }),
  );
  const [image, description, website, twitter, telegram, discord, editable] =
    profile;
  const row = {
    address: token.toLowerCase(),
    creator: creator.toLowerCase(),
    name: text(name) || "-",
    symbol: text(symbol) || "-",
    decimals: Number(decimals),
    quote: quote.toLowerCase(),
    pool_id: poolId,
    initial_tick: initialTick,
    image: text(image),
    description: text(description),
    website: text(website),
    twitter: text(twitter),
    telegram: text(telegram),
    discord: text(discord),
    editable,
    launched_at: new Date(Number(block.timestamp) * 1000).toISOString(),
    launch_tx: launch.transactionHash,
    salt_uint: "",
    suffix: token.slice(-3).toLowerCase(),
  };
  const { error } = await db.from("tokens").upsert(row, {
    onConflict: "address",
  });
  if (error) throw error;

  const { error: creatorError } = await db
    .from("creators")
    .upsert(
      { address: creator.toLowerCase(), last_launch_at: row.launched_at },
      { onConflict: "address" },
    );
  if (creatorError) throw creatorError;

  const estimate = marketEstimate({
    tick: initialTick,
    token,
    quote,
    tokenDecimals: Number(decimals),
    ethUsd: configuredEthUsd(),
  });
  const { error: statsError } = await db.from("token_stats").upsert(
    {
      address: token.toLowerCase(),
      price_quote: estimate.priceQuote,
      initial_price_quote: estimate.priceQuote,
      price_usd: estimate.priceUsd,
      initial_price_usd: estimate.priceUsd,
      fdv_quote: estimate.fdvQuote,
      fdv_usd: estimate.fdvUsd,
      liquidity_quote: 0,
      volume_24h: 0,
      volume_lifetime: 0,
      trades_24h: 0,
      trades_lifetime: 0,
      price_change_24h: 0,
      current_tick: initialTick,
      last_trade_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "address", ignoreDuplicates: true },
  );
  if (statsError) throw statsError;

  const { data: saved, error: verifyError } = await db
    .from("tokens")
    .select("address")
    .eq("address", token.toLowerCase())
    .maybeSingle();
  if (verifyError || !saved) {
    throw new Error("Token upsert completed but database verification failed");
  }
  return row;
}

export async function indexFactory(toBlock?: bigint) {
  const db = serverSupabase(true);
  if (!db) throw new Error("Supabase server environment is not configured");
  const { data: state } = await db
    .from("indexer_state")
    .select("last_block")
    .eq("key", "factory")
    .maybeSingle();
  const configured = BigInt(process.env.INDEXER_START_BLOCK || "0");
  const fromBlock = state ? BigInt(state.last_block) + 1n : configured;
  if (fromBlock === 0n)
    throw new Error(
      "Set INDEXER_START_BLOCK to the factory deployment or first-launch block",
    );
  const chainHead =
    toBlock ?? (await rpcRequest(() => client.getBlockNumber()));
  const maxBlocksPerRun = BigInt(
    process.env.INDEXER_MAX_BLOCKS_PER_RUN || "1000",
  );
  if (maxBlocksPerRun < 1n) {
    throw new Error("INDEXER_MAX_BLOCKS_PER_RUN must be at least 1");
  }
  const boundedHead = fromBlock + maxBlocksPerRun - 1n;
  const head = boundedHead < chainHead ? boundedHead : chainHead;
  let indexed = 0;
  for (let start = fromBlock; start <= head; start += blockRange) {
    const end = start + blockRange - 1n < head ? start + blockRange - 1n : head;
    const logs = await rpcRequest(() =>
      client.getLogs({
        address: ADDRESSES.factory,
        fromBlock: start,
        toBlock: end,
      }),
    );
    for (const log of logs) {
      let decoded;
      try {
        decoded = decodeEventLog({
          abi: factoryAbi,
          data: log.data,
          topics: log.topics,
        });
      } catch {
        continue;
      }
      if (decoded.eventName !== "Launched") continue;
      const { token, creator, poolId, quote, initialTick } = decoded.args;
      await upsertLaunchedToken(db, {
        token,
        creator,
        poolId,
        quote,
        initialTick: Number(initialTick),
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash,
      });
      indexed++;
    }
    const { error } = await db.from("indexer_state").upsert({
      key: "factory",
      last_block: String(end),
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  }
  const { data: marketState } = await db
    .from("indexer_state")
    .select("last_block")
    .eq("key", "market")
    .maybeSingle();
  const marketFrom = marketState
    ? BigInt(marketState.last_block) + 1n
    : configured;
  const marketHead =
    marketFrom + maxBlocksPerRun - 1n < chainHead
      ? marketFrom + maxBlocksPerRun - 1n
      : chainHead;
  let swaps = 0;
  if (marketFrom <= marketHead) {
    for (let start = marketFrom; start <= marketHead; start += blockRange) {
      const end =
        start + blockRange - 1n < marketHead
          ? start + blockRange - 1n
          : marketHead;
      swaps += await indexSwaps(db, start, end);
      const { error } = await db.from("indexer_state").upsert({
        key: "market",
        last_block: String(end),
        updated_at: new Date().toISOString(),
      });
      if (error) throw error;
    }
  }
  return {
    fromBlock: String(fromBlock),
    toBlock: String(head),
    chainHead: String(chainHead),
    indexed,
    swaps,
    marketFromBlock: String(marketFrom),
    marketToBlock: String(marketHead),
    caughtUp: head >= chainHead,
  };
}

export async function indexSwapReceipt(tx: Hex, tokenAddress: Address) {
  const db = serverSupabase(true);
  if (!db) throw new Error("Supabase server environment is not configured");
  const { data, error } = await db
    .from("tokens")
    .select("address,quote,decimals,pool_id")
    .eq("address", tokenAddress.toLowerCase())
    .maybeSingle();
  if (error || !data)
    throw error || new Error("Token was not created through TwentyPad");
  const receipt = await rpcRequest(() =>
    client.getTransactionReceipt({ hash: tx }),
  );
  if (receipt.status !== "success")
    throw new Error("Swap transaction reverted");
  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ADDRESSES.poolManager.toLowerCase())
      continue;
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: poolManagerAbi,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    if (
      decoded.eventName !== "Swap" ||
      decoded.args.id.toLowerCase() !== data.pool_id.toLowerCase()
    )
      continue;
    await upsertSwap(db, data as IndexedToken, {
      blockNumber: receipt.blockNumber,
      transactionHash: receipt.transactionHash,
      args: {
        amount0: decoded.args.amount0,
        amount1: decoded.args.amount1,
        tick: decoded.args.tick,
      },
    });
    return;
  }
  throw new Error("No matching TwentyPad pool swap was found");
}
export async function indexReceipt(tx: Hex) {
  const db = serverSupabase(true);
  if (!db) throw new Error("Supabase server environment is not configured");
  const receipt = await rpcRequest(() =>
    client.getTransactionReceipt({ hash: tx }),
  );
  if (receipt.status !== "success")
    throw new Error("Launch transaction reverted");

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== ADDRESSES.factory.toLowerCase()) continue;
    let decoded;
    try {
      decoded = decodeEventLog({
        abi: factoryAbi,
        data: log.data,
        topics: log.topics,
      });
    } catch {
      continue;
    }
    if (decoded.eventName !== "Launched") continue;
    const { token, creator, poolId, quote, initialTick } = decoded.args;
    await upsertLaunchedToken(db, {
      token,
      creator,
      poolId,
      quote,
      initialTick: Number(initialTick),
      blockNumber: receipt.blockNumber,
      transactionHash: receipt.transactionHash,
    });
    return token;
  }
  throw new Error("Token was not created through TwentyPad");
}
