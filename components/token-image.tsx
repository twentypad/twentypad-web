import Image from "next/image";

export function tokenImageUrl(src?: string | null) {
  const value = src?.trim();
  if (!value) return "/token-placeholder.svg";
  if (value.startsWith("ipfs://")) {
    const gateway = (
      process.env.NEXT_PUBLIC_PINATA_GATEWAY || "https://ipfs.io"
    ).replace(/\/$/, "");
    return `${gateway}/ipfs/${value.slice("ipfs://".length)}`;
  }
  return value;
}

export function TokenImage({
  src,
  alt,
  size = 44,
}: {
  src?: string | null;
  alt: string;
  size?: number;
}) {
  return (
    <Image
      className="shrink-0 rounded-full bg-twenty-blue object-cover"
      src={tokenImageUrl(src)}
      alt={alt || "Token"}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      unoptimized
    />
  );
}
