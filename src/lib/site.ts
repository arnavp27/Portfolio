// The public origin is a build-time decision. Never derive sharing or crawl URLs
// from the preview server's request hostname.
export function publicSite(value: string | undefined): URL | undefined {
  if (!value?.trim()) return undefined;
  let site: URL;
  try {
    site = new URL(value.trim());
  } catch {
    throw new Error('PUBLIC_SITE_URL must be an absolute HTTPS URL, e.g. https://your-domain.com/');
  }
  if (
    site.protocol !== 'https:' ||
    site.username ||
    site.password ||
    site.pathname !== '/' ||
    site.search ||
    site.hash
  ) {
    throw new Error(
      'PUBLIC_SITE_URL must be an HTTPS origin without a subpath, credentials, query, or fragment.',
    );
  }
  return site;
}

export const socialImagePath = '/assets/social/garage.jpg';

export function robotsText(site: URL | undefined): string {
  if (!site) return 'User-agent: *\nDisallow: /\n';
  return `User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap.xml', site).href}\n`;
}

const escapeXml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[character]!,
  );

export function sitemapXml(site: URL | undefined, paths: readonly string[]): string {
  const entries = site
    ? [...new Set(paths)]
        .sort()
        .map((path) => `  <url><loc>${escapeXml(new URL(path, site).href)}</loc></url>`)
        .join('\n')
    : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries}\n</urlset>\n`;
}
