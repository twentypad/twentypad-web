import { NextRequest, NextResponse } from "next/server";
import { isAddress, isHash } from "viem";
import { indexSwapReceipt } from "@/lib/indexer/sync";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    const body: unknown = await req.json();
    if (!body || typeof body !== "object") throw new Error("Invalid body");
    const b = body as Record<string, unknown>;
    if (
      typeof b.tx !== "string" ||
      !isHash(b.tx) ||
      typeof b.token !== "string" ||
      !isAddress(b.token)
    )
      throw new Error("Invalid transaction or token");
    await indexSwapReceipt(b.tx, b.token);
    return NextResponse.json({ indexed: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Queue failed" },
      { status: 400 },
    );
  }
}
