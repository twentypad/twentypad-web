"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  Filter,
  Flame,
  Grid2X2,
  List,
  ListFilter,
  Sparkles,
  TrendingUp,
  X,
} from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Token } from "@/lib/types";
import { TokenCardGrid } from "./token-card-grid";
import { TokenList } from "./token-list";
import { QUOTE_ASSETS } from "@/lib/quotes";

type View = "cards" | "list";
const desktopPairs = ["All", "Crypto", "Stock"];
const sorts = [
  { title: "Trending", value: "trending", icon: Flame },
  { title: "New", value: "new", icon: Sparkles },
  { title: "FDV", value: "fdv", icon: BarChart3 },
  { title: "Volume", value: "volume", icon: TrendingUp },
  { title: "Trades", value: "trades", icon: ListFilter },
];

export function DiscoveryDisplay({
  tokens,
  initialView,
  pair,
  sort,
}: {
  tokens: Token[];
  initialView: View;
  pair: string;
  sort: string;
}) {
  const [view, setView] = useState<View>(initialView);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const coreAssets = QUOTE_ASSETS.filter((asset) => asset.category === "core");
  const stockAssets = QUOTE_ASSETS.filter(
    (asset) => asset.category === "stock",
  );
  const coreSymbols: string[] = coreAssets.map((asset) => asset.symbol);
  const activeCategory =
    pair === "All"
      ? "All"
      : pair === "Crypto" || coreSymbols.includes(pair)
        ? "Crypto"
        : "Stock";
  const visibleMobileAssets =
    activeCategory === "Crypto"
      ? coreAssets
      : activeCategory === "Stock"
        ? stockAssets
        : [];

  function desktopPairIsActive(item: string) {
    if (item === "All") return pair === "All";
    if (item === "Crypto")
      return pair === "Crypto" || coreSymbols.includes(pair);
    return pair === "Stock" || (!coreSymbols.includes(pair) && pair !== "All");
  }

  useEffect(() => {
    if (params.has("view")) return;
    const saved = localStorage.getItem("twentypad-discovery-view");
    if (saved === "cards" || saved === "list") setView(saved);
  }, [params]);

  function update(key: string, value?: string) {
    const next = new URLSearchParams(params.toString());
    value ? next.set(key, value) : next.delete(key);
    next.delete("page");
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, {
      scroll: false,
    });
  }

  function choose(nextView: View) {
    setView(nextView);
    localStorage.setItem("twentypad-discovery-view", nextView);
    const next = new URLSearchParams(params.toString());
    next.set("view", nextView);
    router.replace(`${pathname}?${next}`, { scroll: false });
  }

  const viewButtons = (
    <>
      <button
        className={
          view === "cards"
            ? "btn-primary h-12 min-h-12 w-12 px-0"
            : "btn-secondary h-12 min-h-12 w-12 px-0"
        }
        onClick={() => choose("cards")}
        aria-label="Card view"
        aria-pressed={view === "cards"}
      >
        <Grid2X2 size={17} />
      </button>
      <button
        className={
          view === "list"
            ? "btn-primary h-12 min-h-12 w-12 px-0"
            : "btn-secondary h-12 min-h-12 w-12 px-0"
        }
        onClick={() => choose("list")}
        aria-label="List view"
        aria-pressed={view === "list"}
      >
        <List size={18} />
      </button>
    </>
  );

  return (
    <>
      <div className="mb-5 flex h-12 items-center gap-2">
        <button
          className="btn-secondary h-12 min-h-12 px-4 md:hidden"
          onClick={() => setFiltersOpen(true)}
          aria-label="Open token filters"
        >
          <Filter size={17} />
          <span className="text-xs">Filter</span>
        </button>
        <div className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
          <div className="flex h-12 shrink-0 items-center gap-1 rounded-xl border border-twenty-line bg-twenty-surface/50 p-1">
            {desktopPairs.map((item) => (
              <button
                key={item}
                onClick={() =>
                  update("pair", item === "All" ? undefined : item)
                }
                className={
                  desktopPairIsActive(item)
                    ? "inline-flex h-10 items-center rounded-lg bg-twenty-blue px-5 text-sm font-semibold text-white"
                    : "inline-flex h-10 items-center rounded-lg px-5 text-sm font-medium text-twenty-muted transition hover:text-white"
                }
              >
                {item}
              </button>
            ))}
          </div>
          <span className="mx-1 h-7 w-px shrink-0 bg-twenty-line" />
          <div className="flex h-12 min-w-0 items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {sorts.map(({ title, value, icon: Icon }) => (
              <button
                key={value}
                onClick={() => update("sort", value)}
                className={
                  sort === value
                    ? "inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-twenty-blue bg-twenty-blue/10 px-4 text-sm font-semibold text-white"
                    : "inline-flex h-12 shrink-0 items-center gap-2 rounded-xl border border-twenty-line px-4 text-sm font-medium text-twenty-muted transition hover:border-twenty-blue/60 hover:text-white"
                }
              >
                <Icon size={17} aria-hidden="true" />
                {title}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex h-12 items-center gap-2">{viewButtons}</div>
      </div>

      {view === "cards" ? (
        <TokenCardGrid tokens={tokens} />
      ) : (
        <TokenList tokens={tokens} />
      )}

      {filtersOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/70 p-4 md:hidden"
          onClick={() => setFiltersOpen(false)}
        >
          <div
            className="absolute inset-x-4 bottom-4 max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-twenty-line bg-twenty-navy-2 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="filter-launches-title"
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 id="filter-launches-title" className="font-semibold">
                Filter launches
              </h3>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg border border-twenty-line"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
              >
                <X size={17} />
              </button>
            </div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-twenty-muted">
              Market
            </p>
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-twenty-line bg-twenty-surface/40 p-1.5">
              {desktopPairs.map((item) => (
                <button
                  key={item}
                  onClick={() =>
                    update("pair", item === "All" ? undefined : item)
                  }
                  className={
                    activeCategory === item
                      ? "h-11 rounded-lg bg-twenty-blue px-2 text-sm font-semibold text-white"
                      : "h-11 rounded-lg px-2 text-sm font-medium text-twenty-muted"
                  }
                >
                  {item}
                </button>
              ))}
            </div>
            {visibleMobileAssets.length > 0 && (
              <>
                <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-twenty-muted">
                  {activeCategory === "Crypto" ? "Crypto pair" : "Stock pair"}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {visibleMobileAssets.map((asset) => (
                    <button
                      key={asset.symbol}
                      onClick={() => update("pair", asset.symbol)}
                      className={
                        pair === asset.symbol
                          ? "h-11 rounded-xl border border-twenty-blue bg-twenty-blue/10 px-3 text-sm font-semibold text-white"
                          : "h-11 rounded-xl border border-twenty-line px-3 text-sm font-medium text-twenty-muted"
                      }
                    >
                      {asset.symbol}
                    </button>
                  ))}
                </div>
              </>
            )}
            <p className="mb-3 mt-5 text-xs font-semibold uppercase tracking-wide text-twenty-muted">
              Sort by
            </p>
            <div className="grid grid-cols-2 gap-2">
              {sorts.map(({ title, value, icon: Icon }) => (
                <button
                  key={value}
                  onClick={() => update("sort", value)}
                  className={
                    sort === value
                      ? "flex h-11 items-center justify-center gap-2 rounded-xl border border-twenty-blue bg-twenty-blue/10 px-3 text-sm font-semibold text-white"
                      : "flex h-11 items-center justify-center gap-2 rounded-xl border border-twenty-line px-3 text-sm font-medium text-twenty-muted"
                  }
                >
                  <Icon size={17} aria-hidden="true" />
                  {title}
                </button>
              ))}
            </div>
            <button
              className="btn-primary mt-6 w-full"
              onClick={() => setFiltersOpen(false)}
            >
              Show results
            </button>
          </div>
        </div>
      )}
    </>
  );
}
