import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getToken, getTrades } from "@/lib/supabase/queries";
import { TokenImage } from "@/components/token-image";
import { SwapTicket } from "@/components/swap-ticket";
import { TradeList } from "@/components/trade-list";
import { quoteSymbol } from "@/lib/market/tick-price";
import { age, label, money, number, shortAddress } from "@/lib/format";
import { CopyButton } from "@/components/copy-button";
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
  const [t, trades] = await Promise.all([
    getToken(address),
    getTrades(address),
  ]);
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
          ["Price", s?.price_usd != null ? money(s.price_usd) : s?.price_quote != null ? `${number(s.price_quote)} ${pair}` : "—"],
          ["FDV", s?.fdv_usd != null ? money(s.fdv_usd) : s?.fdv_quote != null ? `${number(s.fdv_quote)} ${pair}` : "—"],
          ["Liquidity", s?.liquidity_quote != null ? `${number(s.liquidity_quote)} ${pair}` : "—"],
          ["Volume 24h", s?.volume_24h != null ? `${number(s.volume_24h)} ${pair}` : "—"],
          ["Trades 24h", number(s?.trades_24h)],
        ].map(([k, v]) => (
          <div className="card p-4" key={k}>
            <p className="text-xs text-twenty-muted">{k}</p>
            <p className="mt-2 text-xl font-semibold">{v}</p>
          </div>
        ))}
      </section>
      <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
        <section>
          <h2 className="mb-3 text-xl font-semibold">Recent trades</h2>
          <TradeList trades={trades} />
        </section>
        <aside>
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
    </div>
  );
}
