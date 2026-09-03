import Image from "next/image";
import Link from "next/link";
import type { Token } from "@/lib/types";
import { age, label, money, number } from "@/lib/format";
import { quoteSymbol } from "@/lib/market/tick-price";
import { tokenImageUrl } from "./token-image";

function signedPercent(value?: number | null) {
  const amount = value ?? 0;
  return `${amount >= 0 ? "+" : ""}${amount.toFixed(2)}%`;
}

function quoteValue(value: number | null | undefined, symbol: string) {
  return value == null ? "—" : `${number(value)} ${symbol}`;
}

export function TokenCardGrid({ tokens }: { tokens: Token[] }) {
  if (!tokens.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      {tokens.map((token) => {
        const stats = token.token_stats;
        const pair = quoteSymbol(token.quote);
        const change = stats?.price_change_24h ?? 0;
        return (
          <Link
            href={`/token/${token.address}`}
            key={token.address}
            className="group overflow-hidden rounded-2xl border border-twenty-line bg-twenty-surface transition hover:-translate-y-0.5 hover:border-twenty-blue-soft hover:shadow-glow"
          >
            <div className="relative aspect-square overflow-hidden bg-twenty-navy-2">
              <Image
                src={tokenImageUrl(token.image)}
                alt={label(token.name)}
                fill
                sizes="(max-width: 640px) 50vw, (max-width: 1280px) 25vw, 16vw"
                className="object-cover transition duration-300 group-hover:scale-[1.03]"
                unoptimized
              />
              <div className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-medium backdrop-blur">
                {age(token.launched_at)}
              </div>
              <div className="absolute right-2 top-2 rounded-full bg-twenty-blue/90 px-2 py-1 text-[10px] font-semibold">
                {pair}
              </div>
            </div>
            <div className="p-3">
              <div className="flex items-center gap-1.5">
                <h3 className="truncate text-sm font-semibold">
                  {label(token.name)}
                </h3>
                <span className="shrink-0 text-[10px] text-twenty-ca7">
                  ca7
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-twenty-muted">
                ${label(token.symbol)}
              </p>
              <div className="mt-3 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-twenty-muted">
                    FDV
                  </p>
                  <p className="text-sm font-semibold">
                    {stats?.fdv_usd != null
                      ? money(stats.fdv_usd)
                      : quoteValue(stats?.fdv_quote, pair)}
                  </p>
                </div>
                <span
                  className={`text-xs font-medium ${change >= 0 ? "text-twenty-success" : "text-twenty-danger"}`}
                >
                  {signedPercent(change)}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-twenty-line pt-2 text-[10px] text-twenty-muted">
                <span>Vol {quoteValue(stats?.volume_24h, pair)}</span>
                <span className="text-right">
                  {number(stats?.trades_24h)} trades
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
