import { useQuery } from "@tanstack/react-query";
import { format, parseISO, subDays, subMonths, subYears } from "date-fns";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { getStockHistory, MARKET_REFRESH_MS } from "@/lib/market";
import { money } from "@/lib/finance";

export function StockHistoryChart({
  symbol,
  period,
}: {
  symbol: string;
  period: string;
}) {
  const intraday = period === "1D";
  const interval = intraday ? "5min" : "1day";
  const cacheTime = intraday ? MARKET_REFRESH_MS : 24 * MARKET_REFRESH_MS;
  const history = useQuery({
    queryKey: ["stock-history", symbol, interval],
    queryFn: ({ signal }) => getStockHistory(symbol, interval, signal),
    staleTime: cacheTime,
    gcTime: 24 * MARKET_REFRESH_MS,
    refetchInterval: cacheTime,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const values = history.data?.values ?? [];
  const latest = values[values.length - 1]?.datetime;
  // Use calendar ranges ending at the latest available trading date.
  const end = parseISO(latest?.slice(0, 10) ?? "1970-01-01");
  const start =
    period === "1W"
      ? subDays(end, 7)
      : period === "1M"
        ? subMonths(end, 1)
        : period === "3M"
          ? subMonths(end, 3)
          : subYears(end, 1);
  const startDate = format(start, "yyyy-MM-dd");
  const data = values
    .filter((point) => intraday || point.datetime >= startDate)
    .map((point) => ({ date: point.datetime, value: point.close }));

  if (history.isPending) {
    return (
      <p role="status" className="market-data-notice">
        Loading price history…
      </p>
    );
  }
  if (!data.length) {
    return (
      <p role="status" className="market-data-notice">
        {history.error?.message ??
          "No price history is available for this range."}
      </p>
    );
  }
  return (
    <section aria-label={`${symbol} ${period} historical price chart`}>
      <p className="text-xs text-muted-foreground mb-2">
        {intraday
          ? `5-minute prices • Latest available session: ${latest?.slice(0, 10)} • New York time`
          : `Daily prices • Through ${latest?.slice(0, 10)} • Current session may be incomplete`}
      </p>
      {history.isError && (
        <p role="status" className="market-data-notice">
          History update unavailable. Showing previously loaded history.
        </p>
      )}
      <div className="stock-chart">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ left: 0, right: 10, top: 10, bottom: 0 }}
          >
            <CartesianGrid
              vertical={false}
              stroke="var(--border)"
              strokeDasharray="3 3"
            />
            <XAxis
              dataKey="date"
              tickFormatter={(value: string) =>
                intraday
                  ? value.slice(11, 16)
                  : format(parseISO(value), "MMM d")
              }
              tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
              minTickGap={30}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              hide
              domain={[
                (min: number) => min * 0.99,
                (max: number) => max * 1.01,
              ]}
            />
            <Tooltip
              formatter={(value: number) => [money(value), "Price"]}
              labelFormatter={(label) =>
                `${label}${intraday ? " (New York)" : ""}`
              }
              contentStyle={{
                background: "var(--card)",
                border: "1px solid var(--border)",
                borderRadius: 5,
                fontSize: 11,
              }}
            />
            <Area
              type="linear"
              dataKey="value"
              stroke="var(--primary)"
              fill="var(--secondary)"
              strokeWidth={2.5}
              dot={data.length === 1}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground mb-2">
        {intraday
          ? "History refreshes hourly."
          : "History refreshes every 24 hours."}{" "}
        Loaded {new Date(history.data!.updated_at).toLocaleString()}.
      </p>
    </section>
  );
}
