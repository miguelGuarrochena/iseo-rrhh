import { GetServerSideProps } from 'next';

/**
 * Sitemap dinámico — Next.js sirve este archivo en /sitemap.xml.
 *
 * El host se toma de NEXT_PUBLIC_SITE_URL (recomendado) o, como fallback,
 * de los headers de la request, así funciona tanto en preview como en
 * producción sin modificar el código.
 */

const buildSitemap = (baseUrl: string) => {
  const today = new Date().toISOString().split('T')[0];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>`;
};

const Sitemap = () => null;
export default Sitemap;

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const host = req.headers.host;
  const protocol =
    (req.headers['x-forwarded-proto'] as string | undefined) ||
    (host && host.startsWith('localhost') ? 'http' : 'https');
  const baseUrl = (envUrl || `${protocol}://${host}`).replace(/\/$/, '');

  const xml = buildSitemap(baseUrl);

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, stale-while-revalidate=43200'
  );
  res.write(xml);
  res.end();

  return { props: {} };
};
