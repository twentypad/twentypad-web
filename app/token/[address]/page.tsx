import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getToken } from "@/lib/supabase/queries";
import { TokenImage } from "@/components/token-image";
import { SwapTicket } from "@/components/swap-ticket";
import { quoteSymbol } from "@/lib/market/tick-price";
import { age, label, money, number, shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
import { GeckoTerminalChart } from "@/components/geckoterminal-chart";
import { launchUsdPrice, quoteAmountUsd } from "@/lib/market/usd";
export const revalidate = 15;
type P = { params: Promise<{ address: string }> };
export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { address } = await params;
  const t = await getToken(address);
  return t
    ? {
        title: `${label(t.name)} ($${label(t.symbol)})`,
        description: t.description || `Trade ${t.symbol} on TwentyPad.`,
      }
    : {};
}
export default async function TokenPage({ params }: P) {
  const { address } = await params;
  const t = await getToken(address);
  if (!t) notFound();
  const s = t.token_stats;
  const pair = quoteSymbol(t.quote);
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <TokenImage src={t.image} alt={label(t.name)} size={76} />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-3xl font-bold">{label(t.name)}</h1>
              <span className="pill text-twenty-ca7">ca7</span>
              <span className="pill">{pair} pair</span>
            </div>
            <p className="mt-1 text-twenty-muted">
              ${label(t.symbol)} · launched {age(t.launched_at)}
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <CopyButton value={t.address} />
              <a
                href={`https://basescan.org/token/${t.address}`}
                target="_blank"
              >
                Basescan
              </a>
              {t.website && (
                <a href={t.website} target="_blank">
                  Website
                </a>
              )}
              {t.twitter && (
                <a href={t.twitter} target="_blank">
                  X
                </a>
              )}
              {t.telegram && (
                <a href={t.telegram} target="_blank">
                  Telegram
                </a>
              )}
            </div>
          </div>
          <a
            className="btn-secondary sm:ml-auto"
            href={`https://x.com/intent/post?text=${encodeURIComponent(`${t.name} ($${t.symbol}) on TwentyPad\n${t.address}\nhttps://twentypad.com/token/${t.address}`)}`}
            target="_blank"
          >
            Share on X
          </a>
        </div>
        {t.description && (
          <p className="mt-5 max-w-3xl text-sm text-twenty-muted">
            {t.description}
          </p>
        )}
      </section>
      <div className="flex flex-wrap gap-2">
        {[
          "LP permanently locked",
          "1B fixed supply",
          "Mint/admin renounced",
          "ca7 suffix",
          "Unaudited",
        ].map((x) => (
          <span className="pill" key={x}>
            {x}
          </span>
        ))}
      </div>
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Price", money(launchUsdPrice(t))],
          ["FDV", money(s?.fdv_usd ?? (launchUsdPrice(t) != null ? launchUsdPrice(t)! * 1_000_000_000 : null))],
          ["Liquidity", s?.liquidity_quote != null ? money(quoteAmountUsd(t, s.liquidity_quote)) : "—"],
          ["Volume 24h", s?.volume_24h != null ? money(quoteAmountUsd(t, s.volume_24h)) : "—"],
          ["Trades 24h", number(s?.trades_24h)],
        ].map(([k, v]) => (
          <div className="card p-4" key={k}>
            <p className="text-xs text-twenty-muted">{k}</p>
            <p className="mt-2 text-xl font-semibold">{v}</p>
          </div>
        ))}
      </section>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-xl font-semibold">{label(t.symbol)} chart</h2>
              <p className="mt-1 text-sm text-twenty-muted">
                Live market data from GeckoTerminal
              </p>
            </div>
            <a
              className="text-sm text-twenty-blue-soft hover:underline"
              href={`https://www.geckoterminal.com/base/pools/${t.pool_id}`}
              target="_blank"
              rel="noreferrer"
            >
              Open in GeckoTerminal ↗
            </a>
          </div>
          <GeckoTerminalChart
            poolId={t.pool_id}
            symbol={label(t.symbol)}
          />
        </section>
        <aside className="self-start lg:sticky lg:top-20">
          <SwapTicket token={t} />
          <div className="card mt-4 p-4 text-sm">
            <span className="text-twenty-muted">Creator</span>
            <div className="mt-2 flex items-center justify-between">
              <a href={`/creators/${t.creator}`}>{shortAddress(t.creator)}</a>
              <a
                className="text-twenty-blue-soft"
                href={`/creators/${t.creator}`}
              >
                Fees →
              </a>
            </div>
          </div>
        </aside>
      </div>
      <section className="border-t border-white/10 pt-8" aria-labelledby="disclosures-title">
        <div className="max-w-3xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-twenty-blue-soft">
            Read before trading
          </p>
          <h2 id="disclosures-title" className="mt-2 text-2xl font-semibold">
            Disclosures
          </h2>
          <p className="mt-2 text-sm leading-6 text-twenty-muted">
            Onchain markets carry risk. Review the token contract, pool, quote
            asset, and expected output before confirming a transaction.
          </p>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {[
            [
              "Locked liquidity and limited control",
              "The launch liquidity position is permanently locked in the TwentyPad hook. The creator cannot withdraw the seeded position, mint additional supply, pause trading, or freeze transfers.",
            ],
            [
              "Fixed supply",
              "TwentyPad B20 tokens have a fixed supply of 1 billion tokens. The supply cannot be increased after launch.",
            ],
            [
              "Creator and platform fees",
              `The normal trading fee is 1%. It is split 70% to the creator and 30% to the platform. Fees are collected in the pool's paired asset (${pair}).`,
            ],
            [
              "Quote asset and settlement",
              `This token is paired with ${pair}. Direct sales settle in ${pair}; receiving ETH or USDC instead may require an additional routed swap and sufficient external liquidity.`,
            ],
            [
              "Tokenized stock risk",
              "A tokenized stock is not the underlying share itself. Availability, pricing, redemption, issuer terms, reference-market hours, and liquidity may differ from traditional equity markets.",
            ],
            [
              "Third-party market data",
              "The chart is provided by GeckoTerminal and may be delayed, unavailable, or differ from the executable quote. The amount shown by the swap form and wallet confirmation is what applies to your transaction.",
            ],
          ].map(([title, copy]) => (
            <article className="card p-5" key={title}>
              <h3 className="font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-twenty-muted">{copy}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
