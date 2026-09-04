import { serverSupabase } from "./server";
import type { Token, TokenStats, Trade } from "@/lib/types";

type DiscoveryRow = Omit<Token, "token_stats"> &
  Partial<Omit<TokenStats, "address">>;

function discoveryToken(row: DiscoveryRow): Token {
  const hasStats = row.current_tick != null || row.price_quote != null;
  return {
    ...row,
    token_stats: hasStats
      ? {
          address: row.address,
          price_quote: row.price_quote ?? null,
          initial_price_quote: row.initial_price_quote ?? null,
          price_usd: row.price_usd ?? null,
          initial_price_usd: row.initial_price_usd ?? null,
          fdv_quote: row.fdv_quote ?? null,
          fdv_usd: row.fdv_usd ?? null,
          liquidity_quote: row.liquidity_quote ?? 0,
          volume_24h: row.volume_24h ?? 0,
          volume_lifetime: row.volume_lifetime ?? 0,
          trades_24h: row.trades_24h ?? 0,
          trades_lifetime: row.trades_lifetime ?? 0,
          price_change_24h: row.price_change_24h ?? 0,
          current_tick: row.current_tick ?? row.initial_tick,
          last_trade_at: row.last_trade_at ?? null,
          holders: row.holders ?? null,
          updated_at: row.updated_at ?? row.launched_at,
        }
      : null,
  };
}

export async function getDiscoveryTokens(opts: {
  q?: string;
  quote?: string;
  quotes?: string[];
  sort?: string;
  page?: number;
  pageSize?: number;
}) {
  const db = serverSupabase();
  const page = Math.max(1, opts.page || 1);
  const pageSize = Math.min(48, Math.max(1, opts.pageSize || 24));
  if (!db) return { tokens: [] as Token[], count: 0, page, pageSize };
  const columns: Record<string, string> = {
    trending: "volume_24h",
    new: "launched_at",
    volume: "volume_24h",
    fdv: "fdv_usd",
    trades: "trades_24h",
    liquidity: "liquidity_quote",
  };
  const sort = columns[opts.sort || "new"] || "launched_at";
  const offset = (page - 1) * pageSize;
  let query = db
    .from("token_discovery")
    .select("*", { count: "exact" })
    .order(sort, { ascending: false, nullsFirst: false })
    .range(offset, offset + pageSize - 1);
  if (opts.q) {
    query = opts.q.startsWith("0x")
      ? query.ilike("address", `${opts.q}%`)
      : query.or(`name.ilike.%${opts.q}%,symbol.ilike.%${opts.q}%`);
  }
  if (opts.quote) query = query.eq("quote", opts.quote.toLowerCase());
  if (opts.quotes?.length)
    query = query.in(
      "quote",
      opts.quotes.map((quote) => quote.toLowerCase()),
    );
  const { data, count, error } = await query;
  if (error) throw error;
  return {
    tokens: ((data || []) as DiscoveryRow[]).map(discoveryToken),
    count: count || 0,
    page,
    pageSize,
  };
}

export async function getDiscoverySummary() {
  const empty = {
    tokens: 0,
    volume24h: 0,
    trades24h: 0,
    highestFdv: null as number | null,
  };
  const db = serverSupabase();
  if (!db) return empty;
  const { data, error } = await db.rpc("discovery_summary");
  if (error || !data?.[0]) return empty;
  const row = data[0] as Record<string, string | number | null>;
  return {
    tokens: Number(row.tokens_launched || 0),
    volume24h: Number(row.volume_24h || 0),
    trades24h: Number(row.trades_24h || 0),
    highestFdv: row.highest_fdv == null ? null : Number(row.highest_fdv),
  };
}
export async function getTokens(
  opts: {
    q?: string;
    quote?: string;
    sort?: string;
    creator?: string;
    limit?: number;
  } = {},
) {
  const db = serverSupabase();
  if (!db) return [] as Token[];
  let query = db
    .from("tokens")
    .select("*,token_stats(*)")
    .limit(opts.limit || 50);
  if (opts.q) {
    query = opts.q.startsWith("0x")
      ? query.ilike("address", `${opts.q}%`)
      : query.or(`name.ilike.%${opts.q}%,symbol.ilike.%${opts.q}%`);
  }
  if (opts.quote) query = query.eq("quote", opts.quote);
  if (opts.creator) query = query.eq("creator", opts.creator);
  const sort =
    opts.sort === "volume_24h" ? "launched_at" : opts.sort || "launched_at";
  query = query.order(sort, { ascending: false });
  const { data } = await query;
  return (data || []) as Token[];
}
export async function getToken(address: string) {
  const db = serverSupabase();
  if (!db) return null;
  const { data } = await db
    .from("tokens")
    .select("*,token_stats(*)")
    .ilike("address", address)
    .maybeSingle();
  return data as Token | null;
}
export async function getTrades(address: string) {
  const db = serverSupabase();
  if (!db) return [] as Trade[];
  const { data } = await db
    .from("trades")
    .select("*")
    .ilike("token", address)
    .order("timestamp", { ascending: false })
    .limit(50);
  return (data || []) as Trade[];
}
