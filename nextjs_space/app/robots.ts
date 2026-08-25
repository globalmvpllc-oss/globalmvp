import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getBaseUrl();

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Application routes are behind authentication and must never be indexed.
        disallow: [
          '/api/',
          '/dashboard',
          '/invoices',
          '/customers',
          '/vendors',
          '/income',
          '/expenses',
          '/payments',
          '/reports',
          '/calendar',
          '/settings',
          '/onboarding',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
