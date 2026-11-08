import type { MetadataRoute } from "next";
import { productUrl } from "@/lib/product-metadata";
export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: productUrl }];
}
