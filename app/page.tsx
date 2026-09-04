import Link from "next/link";
import { DiscoveryDisplay } from "@/components/discovery-display";
import { TopTokenStrip } from "@/components/top-token-strip";
import { QUOTE_ASSETS, quoteAssetBySymbol } from "@/lib/quotes";
import { money, number } from "@/lib/format";
import {
  getDiscoverySummary,
  getDiscoveryTokens,
} from "@/lib/supabase/queries";

export const revalidate = 15;
type Params = Record<string, string | undefined>;

function href(params: Params, changes: Params) {
  const query = new URLSearchParams();
  Object.entries({ ...params, ...changes }).forEach(
    ([key, value]) => value && query.set(key, value),
  );
  return query.size ? `/?${query}` : "/";
}

export default async function Discover({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const requestedPair = params.pair || "";
  const selectedAsset = quoteAssetBySymbol(requestedPair);
  const pair =
    requestedPair === "Stocks" || selectedAsset ? requestedPair : undefined;
  const quote = selectedAsset?.address;
  const stockQuotes =
    pair === "Stocks"
      ? QUOTE_ASSETS.filter((asset) => asset.category === "stock").map(
          (asset) => asset.address,
        )
      : undefined;
  const allowedSorts = [
    "trending",
    "new",
    "volume",
    "fdv",
    "trades",
    "liquidity",
  ];
  const sort = allowedSorts.includes(params.sort || "") ? params.sort : "new";
  const view = params.view === "list" ? "list" : "cards";
  const [result, summary, top] = await Promise.all([
    getDiscoveryTokens({ q: params.q, quote, quotes: stockQuotes, sort, page, pageSize: 24 }),
    getDiscoverySummary(),
    getDiscoveryTokens({ sort: "volume", page: 1, pageSize: 6 }),
  ]);
  const pages = Math.max(1, Math.ceil(result.count / result.pageSize));

  return (
    <div className="space-y-10">
      <section className="flex flex-col gap-6 border-b border-twenty-line py-7 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-twenty-blue-soft">
            B20 token launchpad on Base
          </p>
          <h1 className="mt-2 max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
            Launch once. Trade immediately.
          </h1>
          <p className="mt-3 max-w-2xl text-twenty-muted">
            Fixed-supply tokens with Uniswap v4 liquidity created and locked in
            one transaction.
          </p>
        </div>
        <Link href="/create" className="btn-primary shrink-0">
          Launch a token
        </Link>
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Tokens launched", number(summary.tokens)],
          ["Quote assets", number(QUOTE_ASSETS.length)],
          ["24h trades", number(summary.trades24h)],
          [
            "Highest FDV",
            summary.highestFdv == null ? "—" : money(summary.highestFdv),
          ],
        ].map(([title, value]) => (
          <div className="card p-4" key={title}>
            <div className="text-xs text-twenty-muted">{title}</div>
            <div className="mt-2 text-xl font-semibold sm:text-2xl">
              {value}
            </div>
          </div>
        ))}
      </section>

      {top.tokens.length > 0 && (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Top tokens</h2>
            <Link
              href={href(params, { sort: "volume", page: undefined })}
              className="text-sm text-twenty-blue-soft"
            >
              View all
            </Link>
          </div>
          <TopTokenStrip tokens={top.tokens} />
        </section>
      )}

      <section>
        <h2 className="mb-4 text-xl font-semibold">All launches</h2>
        <DiscoveryDisplay
          tokens={result.tokens}
          initialView={view}
          pair={pair || "All"}
          sort={sort || "new"}
        />
        {pages > 1 && (
          <nav
            className="mt-8 flex items-center justify-center gap-2"
            aria-label="Token pages"
          >
            <Link
              aria-disabled={page <= 1}
              href={href(params, {
                page: page > 2 ? String(page - 1) : undefined,
              })}
              className={`btn-secondary px-4 ${page <= 1 ? "pointer-events-none opacity-40" : ""}`}
            >
              Previous
            </Link>
            <span className="px-3 text-sm text-twenty-muted">
              Page {page} of {pages}
            </span>
            <Link
              aria-disabled={page >= pages}
              href={href(params, { page: String(page + 1) })}
              className={`btn-secondary px-4 ${page >= pages ? "pointer-events-none opacity-40" : ""}`}
            >
              Next
            </Link>
          </nav>
        )}
      </section>
    </div>
  );
}
