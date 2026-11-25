import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    updatedDate: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
  }),
});

// Defined now so adding a digital garden later is a content decision, not a
// refactor. Stays invisible in the nav until the directory has notes in it.
const garden = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/garden' }),
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    updated: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    status: z.enum(['seedling', 'budding', 'evergreen']).default('seedling'),
  }),
});

export const collections = { posts, garden };
