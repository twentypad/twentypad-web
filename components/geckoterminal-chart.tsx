type GeckoTerminalChartProps = {
  poolId: string;
  symbol: string;
};

const poolIdPattern = /^0x[0-9a-fA-F]{64}$/;

export function GeckoTerminalChart({
  poolId,
  symbol,
}: GeckoTerminalChartProps) {
  if (!poolIdPattern.test(poolId)) {
    return (
      <div className="card grid min-h-[360px] place-items-center p-6 text-center text-sm text-twenty-muted sm:min-h-[440px]">
        Chart is not available for this pool yet.
      </div>
    );
  }

  const params = new URLSearchParams({
    embed: "1",
    info: "0",
    swaps: "0",
    light_chart: "0",
    chart_type: "price",
    resolution: "15m",
    bg_color: "071426",
  });
  const src = `https://www.geckoterminal.com/base/pools/${poolId}?${params.toString()}`;

  return (
    <div className="card overflow-hidden p-1">
      <iframe
        title={`${symbol} GeckoTerminal chart`}
        src={src}
        className="h-[420px] w-full rounded-[calc(0.75rem-1px)] border-0 sm:h-[520px]"
        loading="lazy"
        allow="clipboard-write"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );
}
