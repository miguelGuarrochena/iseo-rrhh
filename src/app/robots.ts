import type { MetadataRoute } from 'next';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://iseo-rh.com';

const robots = (): MetadataRoute.Robots => ({
  rules: { userAgent: '*', allow: '/', disallow: '/api/' },
  sitemap: `${SITE_URL}/sitemap.xml`,
});

export default robots;
