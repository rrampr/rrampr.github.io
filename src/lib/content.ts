import { getCollection, type CollectionEntry } from 'astro:content';

/**
 * Posts, newest first. Drafts stay visible under `astro dev` so they can be
 * previewed, and are dropped from production builds so they never publish.
 */
export async function getPublishedPosts(): Promise<CollectionEntry<'posts'>[]> {
  const posts = await getCollection('posts', ({ data }) =>
    import.meta.env.PROD ? !data.draft : true,
  );

  return posts.sort(
    (a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
  );
}

/** Garden notes, most recently tended first. */
export async function getGardenNotes(): Promise<CollectionEntry<'garden'>[]> {
  const notes = await getCollection('garden');

  return notes.sort(
    (a, b) => b.data.updated.valueOf() - a.data.updated.valueOf(),
  );
}

export function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}
