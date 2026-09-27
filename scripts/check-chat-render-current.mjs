import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function checkCurrent(item) {
  if (!item) throw new Error('Missing queue item');
  if (['pending', 'blocked', 'needs_revision'].includes(item.status)) {
    return { proceed: true, reason: item.status === 'pending' ? 'ready' : 'retry' };
  }
  if (item.status === 'in_progress') return { proceed: false, reason: `active:${item.outputs?.render_job_id || 'unknown'}` };
  return { proceed: false, reason: 'already_rendered' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const slug = process.argv[process.argv.indexOf('--slug') + 1];
  const queue = JSON.parse(await fs.readFile(path.join(process.cwd(), 'content/video-queue/queue.json'), 'utf8'));
  const matching = queue.items?.filter(item => item.slug === slug) || [];
  if (matching.length !== 1) throw new Error('Expected one queue item for slug');
  console.log(JSON.stringify(checkCurrent(matching[0])));
}
