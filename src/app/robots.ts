import type { MetadataRoute } from "next";

// Private app: nothing here should be crawled. X-Robots-Tag (next.config.ts) covers the rest.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", disallow: "/" },
  };
}
