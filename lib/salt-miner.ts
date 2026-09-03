import { padHex, toHex, type Address, type Hex, type PublicClient } from "viem";
import { factoryAbi } from "./abi/factory";
export type SaltResult = { salt: Hex; address: Address; attempts: number };

const wait = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

async function withRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await wait(500 * 2 ** attempt);
    }
  }
  throw lastError;
}

export async function mineSalt(
  client: PublicClient,
  start: bigint,
  suffix: number,
  maxAttempts = 50_000,
  onProgress?: (n: number) => void,
): Promise<SaltResult> {
  const factory = (process.env.NEXT_PUBLIC_FACTORY_ADDRESS ||
    "0x15a3f3ABb733868d193b511dd5b91f82ebF888A3") as Address;
  const configuredBatch = Number(
    process.env.NEXT_PUBLIC_SALT_MINER_BATCH_SIZE || "50",
  );
  const batch = Math.min(100, Math.max(1, configuredBatch));
  const delayMs = Number(process.env.NEXT_PUBLIC_SALT_MINER_DELAY_MS || "250");

  for (let offset = 0; offset < maxAttempts; offset += batch) {
    const count = Math.min(batch, maxAttempts - offset);
    const salts = Array.from({ length: count }, (_, i) =>
      padHex(toHex(start + BigInt(offset + i)), { size: 32 }),
    );
    const results = await withRetry(() =>
      client.multicall({
        allowFailure: true,
        contracts: salts.map((salt) => ({
          address: factory,
          abi: factoryAbi,
          functionName: "predictToken" as const,
          args: [salt] as const,
        })),
      }),
    );

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.status !== "success") continue;
      const address = result.result as Address;
      if ((BigInt(address) & 0xfffn) === BigInt(suffix))
        return { salt: salts[i], address, attempts: offset + i + 1 };
    }
    onProgress?.(offset + count);
    if (delayMs > 0) await wait(delayMs);
  }
  throw new Error(
    `No matching salt found in ${maxAttempts.toLocaleString()} attempts. Retry from the next range.`,
  );
}
