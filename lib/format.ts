export const shortAddress = (v: string) => `${v.slice(0, 6)}…${v.slice(-4)}`;
export const money = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        notation: v >= 1e6 ? "compact" : "standard",
        maximumFractionDigits: v < 1 ? 6 : 2,
      }).format(v);
export const number = (v: number | null | undefined) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(v);
export const age = (v: string) => {
  const seconds = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (!Number.isFinite(seconds)) return "-";
  if (seconds < 60) return `${Math.max(0, seconds)}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};
export { label } from "./types";
