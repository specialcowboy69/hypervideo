import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { draftCommands, parseCompletedRender } from './run-chat-render-draft.mjs';
import { updateQueue } from './update-chat-render-queue.mjs';
import { resultComment } from './report-chat-render-result.mjs';
import { checkCurrent } from './check-chat-render-current.mjs';

const commands = draftCommands({ slug: 'nuevo-video', template: 'data-lab' });
assert.equal(commands.length, 2);
assert.equal(commands[0].args.includes('scripts/elevenlabs-generate-scenes.mjs'), true);
assert.equal(commands[1].args.includes('--vps-local'), true);
assert.equal(commands[1].args.includes('schedule-instagram-reel.mjs'), false);
assert.deepEqual(draftCommands({ slug: 'nuevo-video', template: 'data-lab', jobId: 'hfb-nuevo-video-12' })[1].args.slice(-2), ['--job-id', 'hfb-nuevo-video-12']);
assert.deepEqual(parseCompletedRender('{"event":"completed","jobId":"hfb-1","downloadUrl":"https://example.com/video.mp4"}'), { jobId: 'hfb-1', downloadUrl: 'https://example.com/video.mp4' });
assert.throws(() => parseCompletedRender('{"event":"failed"}'), /completed render/);
assert.throws(() => parseCompletedRender('{"event":"completed","jobId":"hfb-1"}'), /download URL/);
assert.match(resultComment({ slug: 'nuevo-video', status: 'needs_review', downloadUrl: 'https://example.com/new.mp4' }, 'a'.repeat(40)), /needs_review.*https:\/\/example.com\/new.mp4/s);
assert.doesNotMatch(resultComment({ slug: 'nuevo-video', status: 'blocked' }, 'a'.repeat(40)), /hyperframes-render-completed/);
assert.match(resultComment({ slug: 'nuevo-video', status: 'in_progress', jobId: 'hfb-nuevo-video-1', runUrl: 'https://github.com/example/run/1' }, 'a'.repeat(40)), /hfb-nuevo-video-1.*https:\/\/github.com\/example\/run\/1/s);

const root = await mkdtemp(path.join(os.tmpdir(), 'chat-render-queue-test-'));
try {
  await mkdir(path.join(root, 'content/video-queue'), { recursive: true });
  const queue = { items: [{ slug: 'otro', status: 'done', outputs: { render: 'https://example.com/old.mp4' } }, { slug: 'nuevo-video', status: 'pending', outputs: {} }] };
  assert.equal(checkCurrent(queue.items[1]).proceed, true); // Two requests can validate before serialization.
  assert.equal(checkCurrent(queue.items[1]).proceed, true);
  await writeFile(path.join(root, 'content/video-queue/queue.json'), JSON.stringify(queue));
  const csv = 'slug,status,render_url,job_id,notes\notro,done,https://example.com/old.mp4,old,"texto, con coma"\nnuevo-video,pending,,,pendiente\n';
  await writeFile(path.join(root, 'content/video-queue/video-queue.csv'), csv);
  await assert.rejects(updateQueue(root, { slug: 'nuevo-video', status: 'needs_review', jobId: 'hfb-nuevo-video-1', downloadUrl: '' }), /URL/);
  await updateQueue(root, { slug: 'nuevo-video', status: 'in_progress', jobId: 'hfb-nuevo-video-1', sourceSha: 'a'.repeat(40), runUrl: 'https://github.com/example/run/1' });
  const running = JSON.parse(await readFile(path.join(root, 'content/video-queue/queue.json'), 'utf8'));
  assert.equal(running.items[1].status, 'in_progress');
  assert.equal(running.items[1].outputs.render_job_id, 'hfb-nuevo-video-1');
  await updateQueue(root, { slug: 'nuevo-video', status: 'in_progress', jobId: 'hfb-nuevo-video-1', sourceSha: 'a'.repeat(40), runUrl: 'https://github.com/example/run/1', error: 'Connection lost; verify n8n status' });
  const uncertain = JSON.parse(await readFile(path.join(root, 'content/video-queue/queue.json'), 'utf8'));
  assert.match(uncertain.items[1].render_attempt.error, /Connection lost/);
  await updateQueue(root, { slug: 'nuevo-video', status: 'needs_review', jobId: 'hfb-nuevo-video-1', downloadUrl: 'https://example.com/new.mp4' });
  const after = JSON.parse(await readFile(path.join(root, 'content/video-queue/queue.json'), 'utf8'));
  assert.deepEqual(after.items[0], queue.items[0]);
  assert.equal(after.items[1].status, 'needs_review');
  assert.equal(after.items[1].outputs.render, 'https://example.com/new.mp4');
  assert.equal(after.items[1].render_attempt.error, undefined, 'a successful render clears an earlier connection error');
  assert.equal(checkCurrent(after.items[1]).proceed, false); // Queued request must skip paid work.
  const afterCsv = await readFile(path.join(root, 'content/video-queue/video-queue.csv'), 'utf8');
  assert.ok(afterCsv.includes('otro,done,https://example.com/old.mp4,old,"texto, con coma"'));
  assert.ok(afterCsv.includes('nuevo-video,needs_review,https://example.com/new.mp4,hfb-nuevo-video-1'));
  await assert.rejects(updateQueue(root, { slug: 'nuevo-video', status: 'blocked', jobId: 'hfb-nuevo-video-2' }), /Stale/);
  await assert.rejects(updateQueue(root, { slug: 'nuevo-video', status: 'blocked', jobId: 'hfb-nuevo-video-1' }), /Stale/);
  await writeFile(path.join(root, 'content/video-queue/queue.json'), JSON.stringify({ items: [queue.items[0], { slug: 'nuevo-video', status: 'blocked', outputs: {} }] }));
  await updateQueue(root, { slug: 'nuevo-video', status: 'in_progress', jobId: 'hfb-nuevo-video-2', sourceSha: 'b'.repeat(40), runUrl: 'https://github.com/example/run/2' });
  await updateQueue(root, { slug: 'nuevo-video', status: 'blocked', jobId: 'hfb-nuevo-video-2' });
  const failed = JSON.parse(await readFile(path.join(root, 'content/video-queue/queue.json'), 'utf8'));
  assert.equal(failed.items[1].status, 'blocked');
  await writeFile(path.join(root, 'content/video-queue/queue.json'), JSON.stringify({ items: [queue.items[0], { slug: 'nuevo-video', status: 'pending', outputs: {} }] }));
  execFileSync(process.execPath, [new URL('./update-chat-render-queue.mjs', import.meta.url).pathname,
    '--slug', 'nuevo-video', '--status', 'in_progress', '--job-id', 'hfb-nuevo-video-3',
    '--source-sha', 'c'.repeat(40), '--run-url', 'https://github.com/example/run/3',
    '--output', path.join(root, 'result.json')], { cwd: root });
  const started = JSON.parse(await readFile(path.join(root, 'content/video-queue/queue.json'), 'utf8'));
  assert.equal(started.items[1].render_attempt.error, undefined, 'omitting --error must not record the Node executable as an error');
} finally {
  await rm(root, { recursive: true, force: true });
}
console.log('chat-render-bridge tests passed');
