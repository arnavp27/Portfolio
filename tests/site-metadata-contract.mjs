import assert from 'node:assert/strict';
import { publicSite, robotsText, sitemapXml } from '../src/lib/site.ts';

assert.equal(publicSite(undefined), undefined);
assert.equal(publicSite('  '), undefined);
const site = publicSite(' https://portfolio.example.test ');
assert.equal(site.href, 'https://portfolio.example.test/');
for (const value of [
  'portfolio.example.test',
  'http://portfolio.example.test',
  'https://portfolio.example.test/portfolio/',
  'https://user:secret@portfolio.example.test/',
  'https://portfolio.example.test/?preview=true',
  'https://portfolio.example.test/#work',
]) {
  assert.throws(() => publicSite(value), /PUBLIC_SITE_URL/);
}
assert.equal(robotsText(undefined), 'User-agent: *\nDisallow: /\n');
assert.equal(
  robotsText(site),
  'User-agent: *\nAllow: /\nSitemap: https://portfolio.example.test/sitemap.xml\n',
);
const unpublished = sitemapXml(undefined, ['/', '/work/']);
assert(!unpublished.includes('<loc>'), 'A build without a public origin invents no crawl URLs');
const xml = sitemapXml(site, ['/work/one&two/', '/', '/']);
assert.equal((xml.match(/<url>/g) ?? []).length, 2, 'Sitemap paths are unique');
assert(xml.includes('<loc>https://portfolio.example.test/</loc>'));
assert(xml.includes('<loc>https://portfolio.example.test/work/one&amp;two/</loc>'));
console.log(
  'PASS: public origin validation, preview indexing, absolute crawl URLs, and sitemap escaping.',
);
