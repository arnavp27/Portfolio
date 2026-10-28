import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { sitemapXml } from '../lib/site';

export const prerender = true;
export const GET: APIRoute = async ({ site }) => {
  const [projects, articles] = await Promise.all([
    getCollection('projects', ({ data }) => !data.draft),
    getCollection('articles', ({ data }) => !data.draft),
  ]);
  const paths = [
    '/',
    '/work/',
    '/resume/',
    ...projects.map(({ id }) => `/work/${id}/`),
    ...(articles.length ? ['/notes/', ...articles.map(({ id }) => `/notes/${id}/`)] : []),
  ];
  return new Response(sitemapXml(site, paths), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
