import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono, Newsreader } from "next/font/google";
import type { ReactNode } from "react";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
// Display headings: a plain editorial serif with an optical-size axis, so large titles stay crisp.
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-display", display: "swap", axes: ["opsz"] });
// Labels, status and figures.
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL("https://jmborrill.co.uk"),
  title: {
    default: "Joshua Borrill — Software and AI systems",
    template: "%s — Joshua Borrill",
  },
  description:
    "Joshua Borrill builds software and AI systems that make complex work easier, including AI Workflow Studio and a backtesting platform.",
};

export const viewport: Viewport = {
  themeColor: "#141b29",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB" className={`${inter.variable} ${newsreader.variable} ${mono.variable}`}>
      <body>
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
