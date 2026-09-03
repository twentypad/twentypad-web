import Link from "next/link";
import { TokenImage } from "./token-image";
import type { Token } from "@/lib/types";
import { age, label, money, number } from "@/lib/format";
import { quoteSymbol } from "@/lib/market/tick-price";
export function TokenList({ tokens }: { tokens: Token[] }) {
  if (!tokens.length)
    return (
      <div className="card py-16 text-center">
        <p className="text-lg font-semibold">No launches yet</p>
        <p className="mt-2 text-sm text-twenty-muted">
          The indexer has no TwentyPad factory launches for this view.
        </p>
        <Link href="/create" className="btn-primary mt-5">
          Create the first one
        </Link>
      </div>
    );
  return (
    <div className="overflow-x-auto card">
      <table className="w-full min-w-[800px] text-left text-sm">
        <thead className="border-b border-twenty-line text-xs uppercase text-twenty-muted">
          <tr>
            {[
              "Token",
              "Pair",
              "Age",
              "Price",
              "FDV",
              "Vol 24h",
              "Trades",
              "",
            ].map((x) => (
              <th className="px-4 py-3 font-medium" key={x}>
                {x}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tokens.map((t) => {
            const s = t.token_stats;
            const pair = quoteSymbol(t.quote);
            return (
              <tr
                className="border-b border-twenty-line/70 last:border-0 hover:bg-twenty-navy-2"
                key={t.address}
              >
                <td className="px-4 py-4">
                  <div className="flex items-center gap-3">
                    <TokenImage src={t.image} alt={label(t.name)} />
                    <div>
                      <div className="font-semibold">
                        {label(t.name)}{" "}
                        <span className="ml-1 text-xs text-twenty-ca7">
                          ca7
                        </span>
                      </div>
                      <div className="text-xs text-twenty-muted">
                        ${label(t.symbol)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4">
                  <span className="pill">{pair}</span>
                </td>
                <td className="px-4 text-twenty-muted">{age(t.launched_at)}</td>
                <td className="px-4">
                  {s?.price_usd != null
                    ? money(s.price_usd)
                    : s?.price_quote != null
                      ? `${number(s.price_quote)} ${pair}`
                      : "—"}
                </td>
                <td className="px-4">
                  {s?.fdv_usd != null
                    ? money(s.fdv_usd)
                    : s?.fdv_quote != null
                      ? `${number(s.fdv_quote)} ${pair}`
                      : "—"}
                </td>
                <td className="px-4">
                  {s?.volume_24h != null
                    ? `${number(s.volume_24h)} ${pair}`
                    : "—"}
                </td>
                <td className="px-4">{number(s?.trades_24h)}</td>
                <td className="px-4">
                  <Link href={`/token/${t.address}`} className="btn-secondary">
                    Trade
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
