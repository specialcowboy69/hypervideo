import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export function parseCsv(input) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (c === '\n' && !quoted) { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (quoted) throw new Error('Malformed CSV');
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export async function updateQueue(root, { slug, status, jobId = '', downloadUrl = '', sourceSha = '', runUrl = '', error = '' }) {
  if (!['in_progress', 'needs_review', 'blocked'].includes(status)) throw new Error('Invalid render result status');
  if (!/^hfb-[a-z0-9-]+-[0-9]+$/.test(jobId)) throw new Error('Invalid render job ID');
  if (status === 'needs_review' && !/^https:\/\/\S+\.mp4(?:\?\S*)?$/.test(downloadUrl)) throw new Error('Invalid render URL');
  const dir = path.join(root, 'content', 'video-queue');
  const jsonPath = path.join(dir, 'queue.json');
  const csvPath = path.join(dir, 'video-queue.csv');
  const queue = JSON.parse(await fs.readFile(jsonPath, 'utf8'));
  const item = queue.items?.find(entry => entry.slug === slug);
  if (!item) throw new Error(`Missing queue item: ${slug}`);
  if (status === 'in_progress') {
    if (item.status === 'in_progress') {
      if (!error || item.render_attempt?.jobId !== jobId) throw new Error('Stale render attempt; another job is active');
    } else if (!['pending', 'blocked', 'needs_revision'].includes(item.status)) throw new Error(`Cannot start render from ${item.status}`);
    if (!/^[a-f0-9]{40}$/.test(sourceSha) || !/^https:\/\/github\.com\//.test(runUrl)) throw new Error('Invalid render attempt identity');
  } else if (item.status !== 'in_progress' || item.render_attempt?.jobId !== jobId) {
    throw new Error('Stale render result; queue was updated by another attempt');
  }
  const rows = parseCsv(await fs.readFile(csvPath, 'utf8'));
  const header = rows[0];
  const row = rows.slice(1).find(entry => entry[0] === slug);
  if (!row) throw new Error(`Missing CSV row: ${slug}`);
  for (const column of ['status', 'render_url', 'job_id']) {
    if (!header.includes(column)) throw new Error(`Missing CSV column: ${column}`);
  }
  item.status = status;
  item.updated_at = new Date().toISOString().slice(0, 10);
  item.outputs ||= {};
  if (status === 'in_progress') {
    item.render_attempt = { jobId, sourceSha, runUrl, ...(error ? { error: String(error).slice(0, 300) } : {}) };
    item.outputs.render_job_id = jobId;
  }
  if (status === 'needs_review') {
    item.outputs.render = downloadUrl;
    item.outputs.render_job_id = jobId;
    item.review = { ...(item.review || {}), status: 'needs_review' };
    delete item.render_attempt.error;
  }
  if (status === 'blocked') item.render_attempt.error = String(error || 'Remote draft failed; inspect the Actions job').slice(0, 300);
  row[header.indexOf('status')] = status;
  if (status === 'in_progress') row[header.indexOf('job_id')] = jobId;
  if (status === 'needs_review') {
    row[header.indexOf('render_url')] = downloadUrl;
    row[header.indexOf('job_id')] = jobId;
  }
  if (header.includes('last_updated')) row[header.indexOf('last_updated')] = item.updated_at;
  const csv = `${rows.map(values => values.map(csvCell).join(',')).join('\n')}\n`;
  await fs.writeFile(jsonPath, `${JSON.stringify(queue, null, 2)}\n`);
  await fs.writeFile(csvPath, csv);
}

export function readRenderResult(text) {
  const event = text.split(/\r?\n/).reverse().find(line => line.startsWith('{"event":"review_ready"'));
  if (!event) throw new Error('Missing review_ready event');
  return JSON.parse(event);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const arg = name => {
      const index = process.argv.indexOf(name);
      return index < 0 ? undefined : process.argv[index + 1];
    };
    const status = arg('--status');
    const result = status === 'needs_review' ? readRenderResult(await fs.readFile(arg('--result-file'), 'utf8')) : {};
    const slug = arg('--slug');
    if (result.slug && result.slug !== slug) throw new Error('Result slug mismatch');
    const jobId = result.jobId || arg('--job-id');
    await updateQueue(process.cwd(), { slug, status, jobId, downloadUrl: result.downloadUrl, sourceSha: arg('--source-sha'), runUrl: arg('--run-url'), error: arg('--error') });
    await fs.writeFile(arg('--output'), JSON.stringify({ slug, status, jobId, runUrl: arg('--run-url'), error: arg('--error'), ...result }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
