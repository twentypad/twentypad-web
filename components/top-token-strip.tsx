import Image from "next/image";
import Link from "next/link";
import type { Token } from "@/lib/types";
import { age, label, money } from "@/lib/format";
import { quoteSymbol } from "@/lib/market/tick-price";
import { tokenImageUrl } from "./token-image";
import { launchUsdPrice } from "@/lib/market/usd";

export function TopTokenStrip({ tokens }: { tokens: Token[] }) {
  return (
    <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-3 sm:mx-0 sm:px-0">
      {tokens.map((token) => {
        const stats = token.token_stats;
        const pair = quoteSymbol(token.quote);
        const change = stats?.price_change_24h ?? 0;
        return (
          <Link
            href={`/token/${token.address}`}
            key={token.address}
            className="group flex w-[270px] min-w-[270px] snap-start overflow-hidden rounded-2xl border border-twenty-line bg-twenty-surface transition hover:border-twenty-blue-soft sm:w-[300px] sm:min-w-[300px]"
          >
            <div className="relative h-28 w-28 shrink-0 overflow-hidden bg-twenty-navy-2">
              <Image
                src={tokenImageUrl(token.image)}
                alt={label(token.name)}
                fill
                sizes="112px"
                className="object-cover transition group-hover:scale-105"
                unoptimized
              />
              <span className="absolute left-2 top-2 rounded-full bg-black/65 px-2 py-1 text-[10px] backdrop-blur">
                {age(token.launched_at)}
              </span>
            </div>
            <div className="min-w-0 flex-1 p-3">
              <div className="flex items-center gap-1">
                <h3 className="truncate text-sm font-semibold">
                  {label(token.name)}
                </h3>
                <span className="text-[10px] text-twenty-ca7">ca7</span>
              </div>
              <p className="truncate text-xs text-twenty-muted">
                ${label(token.symbol)} · {pair}
              </p>
              <p className="mt-3 text-[10px] uppercase tracking-wide text-twenty-muted">
                FDV
              </p>
              <div className="flex items-end justify-between gap-2">
                <span className="text-sm font-semibold">
                  {money(stats?.fdv_usd ?? (launchUsdPrice(token) != null ? launchUsdPrice(token)! * 1_000_000_000 : null))}
                </span>
                <span
                  className={
                    change >= 0
                      ? "text-xs text-twenty-success"
                      : "text-xs text-twenty-danger"
                  }
                >
                  {change >= 0 ? "+" : ""}
                  {change.toFixed(2)}%
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
