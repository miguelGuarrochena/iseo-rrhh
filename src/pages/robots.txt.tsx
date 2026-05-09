import { GetServerSideProps } from 'next';

/**
 * robots.txt dinámico — referencia el sitemap absoluto correcto sin
 * importar dónde se despliegue el sitio.
 */

const Robots = () => null;
export default Robots;

export const getServerSideProps: GetServerSideProps = async ({ req, res }) => {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  const host = req.headers.host;
  const protocol =
    (req.headers['x-forwarded-proto'] as string | undefined) ||
    (host && host.startsWith('localhost') ? 'http' : 'https');
  const baseUrl = (envUrl || `${protocol}://${host}`).replace(/\/$/, '');

  const body = `User-agent: *
Allow: /
Disallow: /api/

Sitemap: ${baseUrl}/sitemap.xml
`;

  res.setHeader('Content-Type', 'text/plain');
  res.setHeader(
    'Cache-Control',
    'public, s-maxage=86400, stale-while-revalidate=43200'
  );
  res.write(body);
  res.end();

  return { props: {} };
};
