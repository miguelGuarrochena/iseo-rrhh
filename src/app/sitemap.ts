import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iseo-rh.com';

const sitemap = (): MetadataRoute.Sitemap => [
  {
    url: `${SITE_URL}/`,
    lastModified: new Date(),
    changeFrequency: 'monthly',
    priority: 1,
  },
];

export default sitemap;
