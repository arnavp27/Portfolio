import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const projects = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/projects' }),
  schema: z.object({
    title: z.string(),
    category: z.string(),
    summary: z.string(),
    order: z.number(),
    year: z.string(),
    status: z.string().optional(),
    role: z.string(),
    tags: z.array(z.string()),
    links: z.array(z.object({ label: z.string(), url: z.url() })).default([]),
    image: z.string().optional(),
    imageAlt: z.string().optional(),
    scene: z.enum(['kazam', 'pixel', 'onco', 'solar']).optional(),
    zone: z.enum(['work', 'projects', 'extracurricular']).default('projects'),
    draft: z.boolean().default(false),
  }),
});
const articles = defineCollection({
  loader: glob({ pattern: '**/*.md', base: './src/content/articles' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.coerce.date(),
    draft: z.boolean().default(false),
  }),
});
export const collections = { projects, articles };
