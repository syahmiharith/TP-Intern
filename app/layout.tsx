import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { productUrl, productTitle, productDescription, productStructuredData } from "@/lib/product-metadata";

export const metadata: Metadata = {
  metadataBase: new URL(productUrl),
  alternates: { canonical: "/" },
  title: productTitle,
  description: productDescription,
  applicationName: "Receipt-to-Form",
  authors: [{ name: "Zulsyahmi Zulkefli", url: "https://portfolio-syahmiharith.vercel.app" }],
  creator: "Zulsyahmi Zulkefli",
  openGraph: {
    type: "website", siteName: "Receipt-to-Form", url: productUrl,
    title: productTitle, description: productDescription, locale: "en_US"
  },
  twitter: {
    card: "summary_large_image", title: productTitle,
    description: productDescription, images: ["/opengraph-image"]
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productStructuredData).replace(/</g, "\\u003c") }} />
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
