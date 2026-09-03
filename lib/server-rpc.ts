import "server-only";

export const SERVER_RPC_URL =
  process.env.BASE_RPC_URL || "https://mainnet.base.org";

export function requireServerRpcUrl() {
  if (!process.env.BASE_RPC_URL) {
    console.warn(
      "BASE_RPC_URL is not configured; server RPC calls are using the public Base endpoint.",
    );
  }
  return SERVER_RPC_URL;
}
