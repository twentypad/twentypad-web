import Image from "next/image";
export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <Image
        src="/twentypad-mark.png"
        alt="TwentyPad"
        width={44}
        height={44}
        className="h-11 w-11 object-contain"
        priority
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
