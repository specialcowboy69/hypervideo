import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseRequest, validatePackage } from './validate-chat-render-request.mjs';

const sha = 'a'.repeat(40);
assert.deepEqual(parseRequest(`slug: nuevo-video\nsha: ${sha}`), { slug: 'nuevo-video', sha });
for (const body of [`slug: ../secreto\nsha: ${sha}`, `slug: malo;echo\nsha: ${sha}`, 'slug: ok\nsha: malo']) {
  assert.throws(() => parseRequest(body), /Invalid/);
}

const root = await mkdtemp(path.join(os.tmpdir(), 'chat-render-test-'));
const pending = path.join(root, 'content/video-queue/pending/nuevo-video');
try {
  await mkdir(pending, { recursive: true });
  await mkdir(path.join(root, 'assets/character'), { recursive: true });
  for (const name of ['brief.md', 'structure.md', 'visual-plan.md']) {
    await writeFile(path.join(pending, name), '# Contenido\n');
  }
  const manifest = { project: { slug: 'nuevo-video', visual_template: 'data-lab' }, scenes: [{ id: 'scene-01', text: 'Texto de voz.' }] };
  await writeFile(path.join(pending, 'voiceover.scenes.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'content/video-queue/queue.json'), JSON.stringify({ items: [{ slug: 'nuevo-video', status: 'pending', template: 'data-lab' }] }));
  await writeFile(path.join(root, 'content/video-queue/video-queue.csv'), 'slug,status,template,render_url,job_id\nnuevo-video,pending,data-lab,,\n');
  assert.deepEqual(await validatePackage(root, 'nuevo-video'), { slug: 'nuevo-video', template: 'data-lab' });

  await writeFile(path.join(pending, 'brief.md'), '');
  await assert.rejects(validatePackage(root, 'nuevo-video'), /brief.md/);
  await writeFile(path.join(pending, 'brief.md'), '# Contenido\n');
  await writeFile(path.join(pending, 'voiceover.scenes.json'), JSON.stringify({ ...manifest, scenes: [{ id: 'scene-01', text: '' }] }));
  await assert.rejects(validatePackage(root, 'nuevo-video'), /scene text/);
  await writeFile(path.join(pending, 'voiceover.scenes.json'), JSON.stringify(manifest));
  await writeFile(path.join(root, 'content/video-queue/video-queue.csv'), 'slug,status,template,render_url,job_id\n');
  await assert.rejects(validatePackage(root, 'nuevo-video'), /CSV row/);
  await writeFile(path.join(root, 'content/video-queue/video-queue.csv'), 'slug,status,template,render_url,job_id\nnuevo-video,pending,data-lab,,\n');
  await writeFile(path.join(root, 'content/video-queue/queue.json'), JSON.stringify({ items: [] }));
  await assert.rejects(validatePackage(root, 'nuevo-video'), /queue item/);
  await writeFile(path.join(root, 'content/video-queue/queue.json'), JSON.stringify({ items: [{ slug: 'nuevo-video', status: 'blocked', template: 'data-lab' }] }));
  assert.deepEqual(await validatePackage(root, 'nuevo-video'), { slug: 'nuevo-video', template: 'data-lab' });
  await writeFile(path.join(root, 'content/video-queue/queue.json'), JSON.stringify({ items: [{ slug: 'nuevo-video', status: 'pending', template: 'data-lab' }, { slug: 'nuevo-video', status: 'pending', template: 'data-lab' }] }));
  await assert.rejects(validatePackage(root, 'nuevo-video'), /Duplicate queue item/);
  await writeFile(path.join(root, 'content/video-queue/queue.json'), JSON.stringify({ items: [{ slug: 'nuevo-video', status: 'pending', template: 'data-lab' }] }));
  await writeFile(path.join(root, 'content/video-queue/video-queue.csv'), 'slug,status,render_url,job_id\nnuevo-video,pending,,\nnuevo-video,pending,,\n');
  await assert.rejects(validatePackage(root, 'nuevo-video'), /Duplicate CSV row/);
  await writeFile(path.join(root, 'content/video-queue/video-queue.csv'), 'slug,status\nnuevo-video,pending\n');
  await assert.rejects(validatePackage(root, 'nuevo-video'), /CSV column/);
  await writeFile(path.join(root, 'content/video-queue/video-queue.csv'), 'slug,status,render_url,job_id\nnuevo-video,pending,,\n');
  await writeFile(path.join(pending, 'voiceover.scenes.json'), JSON.stringify({ ...manifest, scenes: [{ id: 'SCENE_01', text: 'Uno' }, { id: 'scene-01', text: 'Dos' }] }));
  await assert.rejects(validatePackage(root, 'nuevo-video'), /Duplicate scene ID/);
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log('validate-chat-render-request tests passed');
