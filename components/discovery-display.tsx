"use client";

import { useEffect, useState } from "react";
import { Filter, Grid2X2, List, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { Token } from "@/lib/types";
import { TokenCardGrid } from "./token-card-grid";
import { TokenList } from "./token-list";

type View = "cards" | "list";
const pairs = ["All", "ETH", "USDC"];
const sorts = [
  ["Trending", "trending"],
  ["New", "new"],
  ["FDV", "fdv"],
  ["Volume", "volume"],
  ["Trades", "trades"],
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
            ? "btn-primary h-10 min-h-10 px-3"
            : "btn-secondary h-10 min-h-10 px-3"
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
            ? "btn-primary h-10 min-h-10 px-3"
            : "btn-secondary h-10 min-h-10 px-3"
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
      <div className="mb-5 flex items-center gap-2">
        <button
          className="btn-secondary h-10 min-h-10 px-3 md:hidden"
          onClick={() => setFiltersOpen(true)}
          aria-label="Open token filters"
        >
          <Filter size={17} />
          <span className="text-xs">Filter</span>
        </button>
        <div className="hidden flex-wrap items-center gap-2 md:flex">
          {pairs.map((item) => (
            <button
              key={item}
              onClick={() => update("pair", item === "All" ? undefined : item)}
              className={
                pair === item
                  ? "pill border-twenty-blue bg-twenty-blue/10 text-white"
                  : "pill"
              }
            >
              {item}
            </button>
          ))}
          <span className="mx-1 h-5 w-px bg-twenty-line" />
          {sorts.map(([title, value]) => (
            <button
              key={value}
              onClick={() => update("sort", value)}
              className={
                sort === value
                  ? "pill border-twenty-blue bg-twenty-blue/10 text-white"
                  : "pill"
              }
            >
              {title}
            </button>
          ))}
        </div>
      <div className="ml-auto flex items-center gap-1">{viewButtons}</div>
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
            className="absolute inset-x-4 bottom-4 rounded-2xl border border-twenty-line bg-twenty-navy-2 p-5 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="font-semibold">Filter launches</h3>
              <button
                className="grid h-9 w-9 place-items-center rounded-lg border border-twenty-line"
                onClick={() => setFiltersOpen(false)}
                aria-label="Close filters"
              >
                <X size={17} />
              </button>
            </div>
            <p className="mb-2 text-xs uppercase tracking-wide text-twenty-muted">
              Pair
            </p>
            <div className="flex flex-wrap gap-2">
              {pairs.map((item) => (
                <button
                  key={item}
                  onClick={() =>
                    update("pair", item === "All" ? undefined : item)
                  }
                  className={
                    pair === item
                      ? "pill border-twenty-blue bg-twenty-blue/10 text-white"
                      : "pill"
                  }
                >
                  {item}
                </button>
              ))}
            </div>
            <p className="mb-2 mt-5 text-xs uppercase tracking-wide text-twenty-muted">
              Sort by
            </p>
            <div className="flex flex-wrap gap-2">
              {sorts.map(([title, value]) => (
                <button
                  key={value}
                  onClick={() => update("sort", value)}
                  className={
                    sort === value
                      ? "pill border-twenty-blue bg-twenty-blue/10 text-white"
                      : "pill"
                  }
                >
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
