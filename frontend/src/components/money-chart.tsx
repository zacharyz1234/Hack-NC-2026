import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";
import { money } from "@/lib/finance";
export function MoneyChart({
  stock = false,
  period = "1M",
  price = 227.55,
}: {
  stock?: boolean;
  period?: string;
  price?: number;
}) {
  const factors =
    period === "1D"
      ? [0.97, 0.975, 0.97, 0.985, 0.98, 1, 0.99, 1.01, 1]
      : period === "1Y"
        ? [0.72, 0.79, 0.75, 0.85, 0.8, 0.9, 0.92, 0.88, 1]
        : [0.87, 0.89, 0.86, 0.91, 0.9, 0.95, 0.93, 0.97, 1];
  const data = factors.map((f, i) => ({
    day: stock
      ? ["1", "5", "9", "13", "17", "21", "25", "29", "Today"][i]
      : ["Jun", "Jul", "Aug", "Sep", "Oct", "", "", "", ""][i],
    value: stock
      ? Math.round(f * price * 100) / 100
      : [920, 1040, 980, 1220, 1160, 1250, 1390, 1470, 1520][i],
  }));
  return (
    <div className={stock ? "stock-chart" : "chart-wrap"}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 10, top: 10, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="day"
            tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis hide domain={["dataMin - 10", "dataMax + 10"]} />
          <Tooltip
            formatter={(v: number) => money(v)}
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 5,
              fontSize: 11,
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke="var(--primary)"
            fill="var(--secondary)"
            strokeWidth={2.5}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
