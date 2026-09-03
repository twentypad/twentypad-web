import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { MobileNav } from "@/components/mobile-nav";
import { Disclaimer } from "@/components/disclaimer";
import { Toaster } from "sonner";
const description =
  "Instant B20 token launches on Base, with Uniswap v4 liquidity seeded in one transaction. Create, discover, and swap TwentyPad tokens.";
export const metadata: Metadata = {
  metadataBase: new URL("https://twentypad.com"),
  title: {
    default: "TwentyPad — Instant B20 launches on Base",
    template: "%s · TwentyPad",
  },
  description,
  applicationName: "TwentyPad",
  authors: [{ name: "TwentyPad" }],
  creator: "@twentypad",
  publisher: "TwentyPad",
  keywords: [
    "TwentyPad",
    "Twentypad",
    "B20",
    "Base",
    "Uniswap v4",
    "token launchpad",
    "$TWENTY",
  ],
  openGraph: {
    title: "TwentyPad — Instant B20 launches on Base",
    description,
    url: "https://twentypad.com",
    siteName: "TwentyPad",
    type: "website",
    locale: "en_US",
    images: [{ url: "/twentypad-og.png", width: 2048, height: 682 }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@twentypad",
    creator: "@twentypad",
    images: ["/twentypad-og.png"],
  },
  icons: { icon: "/twentypad-pfp.png", apple: "/twentypad-pfp.png" },
  robots: { index: true, follow: true },
};
export const viewport: Viewport = { themeColor: "#0052FF" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <Disclaimer />
          <Header />
          <main className="mx-auto min-h-[70vh] max-w-7xl px-4 py-8">
            {children}
          </main>
          <Footer />
          <MobileNav />
          <Toaster theme="dark" richColors />
        </Providers>
      </body>
    </html>
  );
}
