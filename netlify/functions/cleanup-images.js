import { getStore } from '@netlify/blobs';
import { connectDatabase } from '../../server/database.js';
import { ResumeItem } from '../../server/models.js';

export default async () => {
  const counts = { checked: 0, skipped: 0, deleted: 0 };
  try {
    await connectDatabase();
    const images = await ResumeItem.distinct('image', { image: { $type: 'string', $ne: '' } });
    const referenced = new Set(images);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const store = getStore('resume-images');
    const { blobs } = await store.list();

    for (const { key } of blobs) {
      counts.checked++;
      if (referenced.has(key)) {
        counts.skipped++;
        continue;
      }
      const entry = await store.getMetadata(key);
      const createdAt = entry?.metadata?.createdAt;
      if (!Number.isFinite(createdAt) || createdAt <= 0 || createdAt >= cutoff) {
        counts.skipped++;
        continue;
      }
      // Recheck MongoDB in case an experience was saved during this run.
      if (await ResumeItem.exists({ image: key })) {
        counts.skipped++;
        continue;
      }
      await store.delete(key);
      counts.deleted++;
    }
    console.log('Image cleanup complete:', counts);
  } catch (error) {
    console.error('Image cleanup stopped:', error.name, counts);
    throw error;
  }
};

export const config = { schedule: '@daily' };
