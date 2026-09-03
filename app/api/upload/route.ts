import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type PinataResponse = {
  IpfsHash?: string;
  error?: string;
};

export async function POST(request: NextRequest) {
  try {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) {
      return NextResponse.json(
        { error: "PINATA_JWT is not configured" },
        { status: 503 },
      );
    }

    const incoming = await request.formData();
    const file = incoming.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image file is required" }, { status: 400 });
    }
    if (!ACCEPTED.has(file.type)) {
      return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });
    }
    if (file.size === 0 || file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Image must be between 1 byte and 2MB" },
        { status: 413 },
      );
    }

    const body = new FormData();
    body.append("file", file, file.name.replace(/[^a-zA-Z0-9._-]/g, "-"));
    body.append(
      "pinataMetadata",
      JSON.stringify({ name: `twentypad-${Date.now()}-${file.name}` }),
    );
    body.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));

    const response = await fetch(
      "https://api.pinata.cloud/pinning/pinFileToIPFS",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${jwt}` },
        body,
        cache: "no-store",
      },
    );
    const result = (await response.json()) as PinataResponse;
    if (!response.ok || !result.IpfsHash) {
      return NextResponse.json(
        { error: result.error || `Pinata upload failed (${response.status})` },
        { status: response.status || 502 },
      );
    }

    return NextResponse.json({
      cid: result.IpfsHash,
      uri: `ipfs://${result.IpfsHash}`,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Upload failed" },
      { status: 500 },
    );
  }
}
