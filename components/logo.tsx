import Image from "next/image";
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Image
        src="/twentypad-pfp.png"
        alt="TwentyPad"
        width={34}
        height={34}
        className="rounded-lg"
      />
      {!compact && (
        <span className="font-bold tracking-tight">
          Twenty
          <span className="hidden sm:inline">
            {" "}
            <span className="font-medium text-twenty-muted">Launchpad</span>
          </span>
        </span>
      )}
    </span>
  );
}
