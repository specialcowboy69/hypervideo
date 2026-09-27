import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCsv } from './update-chat-render-queue.mjs';

const SLUG = /^[a-z0-9]+(?:[a-z0-9-]*[a-z0-9])?$/;
const TEMPLATES = new Set(['dark-tech', 'light-workshop', 'data-lab']);
const CHARACTER = ['Breathing-Idle.glb', 'Talking.glb', 'Happy-Hand-Gesture.glb', 'Yelling.glb'];

function assertSlug(slug) {
  if (typeof slug !== 'string' || slug.length > 80 || !SLUG.test(slug)) throw new Error('Invalid slug');
}

export function parseRequest(body) {
  const lines = String(body).trim().split(/\r?\n/);
  if (lines.length !== 2) throw new Error('Invalid render request');
  const slug = /^slug: ([a-z0-9-]+)$/.exec(lines[0])?.[1];
  const sha = /^sha: ([a-f0-9]{40})$/.exec(lines[1])?.[1];
  assertSlug(slug);
  if (!sha) throw new Error('Invalid commit SHA');
  return { slug, sha };
}

function normalizeTemplate(raw) {
  const template = String(raw || '').replace(/^videos\//, '').replace('arquitectura-informacion', 'dark-tech');
  if (!TEMPLATES.has(template)) throw new Error(`Unsupported video template: ${raw}`);
  return template;
}

async function requiredText(file) {
  const text = await fs.readFile(file, 'utf8').catch(() => { throw new Error(`Missing required file: ${path.basename(file)}`); });
  if (!text.trim()) throw new Error(`Empty required file: ${path.basename(file)}`);
  return text;
}

export async function validatePackage(root, slug) {
  assertSlug(slug);
  const folder = path.join(root, 'content', 'video-queue', 'pending', slug);
  for (const name of ['brief.md', 'structure.md', 'visual-plan.md']) await requiredText(path.join(folder, name));
  let manifest;
  try { manifest = JSON.parse(await requiredText(path.join(folder, 'voiceover.scenes.json'))); }
  catch (error) { throw new Error(`Invalid voiceover.scenes.json: ${error.message}`); }
  if (manifest?.project?.slug !== slug) throw new Error('Manifest slug does not match request');
  if (!Array.isArray(manifest.scenes) || manifest.scenes.length === 0 ||
    manifest.scenes.some(scene => !scene || typeof scene.text !== 'string' || !scene.text.trim())) {
    throw new Error('Missing scene text');
  }
  const ids = manifest.scenes.map((scene, index) => String(scene.id || `scene-${String(index + 1).padStart(2, '0')}`).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, ''));
  if (ids.some(id => !id) || new Set(ids).size !== ids.length) throw new Error('Duplicate scene ID or empty ID');
  const template = normalizeTemplate(manifest.project.visual_template);
  const queue = JSON.parse(await requiredText(path.join(root, 'content/video-queue/queue.json')));
  const matchingItems = queue.items?.filter(entry => entry.slug === slug) || [];
  if (!matchingItems.length) throw new Error('Missing queue item');
  if (matchingItems.length !== 1) throw new Error('Duplicate queue item');
  const item = matchingItems[0];
  if (normalizeTemplate(item.template) !== template) throw new Error('Queue template differs from manifest');
  if (!['pending', 'blocked', 'needs_revision'].includes(item.status)) throw new Error(`Queue item cannot be rendered from ${item.status}`);
  const csv = parseCsv(await requiredText(path.join(root, 'content/video-queue/video-queue.csv')));
  for (const column of ['slug', 'status', 'render_url', 'job_id']) {
    if (!csv[0]?.includes(column)) throw new Error(`Missing CSV column: ${column}`);
  }
  const matchingRows = csv.slice(1).filter(row => row[csv[0].indexOf('slug')] === slug);
  if (!matchingRows.length) throw new Error('Missing CSV row');
  if (matchingRows.length !== 1) throw new Error('Duplicate CSV row');
  if (template !== 'data-lab') {
    for (const name of CHARACTER) {
      await fs.access(path.join(root, 'assets', 'character', name)).catch(() => { throw new Error(`Missing character asset: ${name}`); });
    }
  }
  return { slug, template };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const slug = process.argv[process.argv.indexOf('--slug') + 1];
  validatePackage(process.cwd(), slug).then(result => console.log(JSON.stringify(result))).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
