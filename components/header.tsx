"use client";
import Link from "next/link";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { Menu, X, Search } from "lucide-react";
import { useState } from "react";
import { Logo } from "./logo";
import { EXTERNAL } from "@/lib/chain";
const nav = [
  ["Discover", "/"],
  ["Create", "/create"],
  ["Swap", "/swap"],
  ["Guide", "/guide"],
  ["About", "/about"],
];
export function Header() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-twenty-line bg-twenty-navy/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-5 sm:px-4">
          <Link href="/" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden gap-1 lg:flex">
            {nav.map(([n, h]) => (
              <Link
                className="rounded-lg px-3 py-2 text-sm text-twenty-muted hover:bg-twenty-surface hover:text-white"
                href={h}
                key={h}
              >
                {n}
              </Link>
            ))}
          </nav>
          <form
            action="/"
            className="relative ml-auto hidden max-w-xs flex-1 md:block"
          >
            <Search
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-twenty-muted"
              size={18}
            />
            <input
              name="q"
              className="input pr-10"
              placeholder="Name, symbol, or 0x address"
            />
          </form>
          <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5 sm:gap-2">
            <span className="pill shrink-0 px-2 text-[10px] sm:px-2.5 sm:text-xs">
              Base · B20
            </span>
            <div className="shrink-0">
              <ConnectButton
                accountStatus="avatar"
                chainStatus="icon"
                showBalance={false}
              />
            </div>
            <button
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-twenty-line sm:h-11 sm:w-11 lg:hidden"
              onClick={() => setOpen(!open)}
              aria-label="Menu"
            >
              {open ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          onClick={() => setOpen(false)}
        >
          <aside
            className="ml-auto mt-16 h-[calc(100%-4rem)] w-72 border-l border-twenty-line bg-twenty-navy-2 p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {[...nav, ["Privacy", "/privacy"], ["Terms", "/terms"]].map(
              ([n, h]) => (
                <Link
                  onClick={() => setOpen(false)}
                  className="block rounded-xl px-4 py-3 hover:bg-twenty-surface"
                  href={h}
                  key={h}
                >
                  {n}
                </Link>
              ),
            )}
            {Object.entries(EXTERNAL)
              .filter(([k]) => ["x", "telegram", "github"].includes(k))
              .map(([n, h]) => (
                <a
                  className="block rounded-xl px-4 py-3 text-twenty-muted hover:bg-twenty-surface"
                  href={h}
                  key={n}
                  target="_blank"
                >
                  {n[0].toUpperCase() + n.slice(1)}
                </a>
              ))}
          </aside>
        </div>
      )}
    </>
  );
}
