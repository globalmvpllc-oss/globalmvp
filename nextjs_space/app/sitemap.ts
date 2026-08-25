import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

/** Public marketing and legal routes only. No authenticated application route. */
const PUBLIC_ROUTES: Array<{ path: string; priority: number; changeFrequency: 'monthly' | 'yearly' }> = [
  { path: '/', priority: 1, changeFrequency: 'monthly' },
  { path: '/pricing', priority: 0.8, changeFrequency: 'monthly' },
  { path: '/contact', priority: 0.5, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/terms', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/kvkk', priority: 0.3, changeFrequency: 'yearly' },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getBaseUrl();
  // Fixed to the current marketing release. A per-request timestamp would tell
  // crawlers these pages change constantly, which is not true.
  const lastModified = new Date('2026-08-25');

  return PUBLIC_ROUTES.map((route) => ({
    url: `${baseUrl}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));
}
