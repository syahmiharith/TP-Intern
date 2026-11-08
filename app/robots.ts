import type { MetadataRoute } from "next";
import { productUrl } from "@/lib/product-metadata";
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/", disallow: "/api/" }, sitemap: `${productUrl}/sitemap.xml`, host: productUrl };
}
