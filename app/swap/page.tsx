import { SwapInterface } from "@/components/swap-interface";
import { getTokens } from "@/lib/supabase/queries";

export const revalidate = 15;

export default async function SwapPage() {
  const tokens = await getTokens({ limit: 100 });
  return (
    <div className="py-4 sm:py-10">
      <SwapInterface tokens={tokens} />
    </div>
  );
}
