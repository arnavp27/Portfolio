import type { APIRoute } from 'astro';
import { robotsText } from '../lib/site';

export const prerender = true;
export const GET: APIRoute = ({ site }) =>
  new Response(robotsText(site), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
