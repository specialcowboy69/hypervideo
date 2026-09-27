import { spawn } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validatePackage } from './validate-chat-render-request.mjs';

export function draftCommands({ slug, template, jobId }) {
  return [
    { file: 'node', args: ['scripts/elevenlabs-generate-scenes.mjs', '--input', `content/video-queue/pending/${slug}/voiceover.scenes.json`, '--out', `assets/character/audio/generated/${slug}`, '--env', '.env local'] },
    { file: 'node', args: ['scripts/trigger-n8n-build-render.mjs', '--slug', slug, '--mode', 'draft', '--template', template, '--env', '.env.n8n', '--vps-local', ...(jobId ? ['--job-id', jobId] : [])] }
  ];
}

function jsonObjects(text) {
  const objects = [];
  let start = -1, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === '{') { if (depth++ === 0) start = i; }
    else if (char === '}' && --depth === 0 && start >= 0) {
      try { objects.push(JSON.parse(text.slice(start, i + 1))); } catch { /* Ignore log text. */ }
      start = -1;
    }
  }
  return objects;
}

export function parseCompletedRender(output) {
  const completed = jsonObjects(output).reverse().find(value => value.event === 'completed');
  if (!completed?.jobId) throw new Error('No completed render job in n8n output');
  if (!/^https:\/\/\S+\.mp4(?:\?\S*)?$/.test(completed.downloadUrl || '')) throw new Error('Completed render has no valid download URL');
  return { jobId: completed.jobId, downloadUrl: completed.downloadUrl };
}

async function run(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args, { shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '';
    child.stdout.on('data', chunk => { const text = chunk.toString(); stdout += text; process.stdout.write(text); });
    child.stderr.on('data', chunk => { const text = chunk.toString(); stderr += text; process.stderr.write(text); });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`${command.file} exited with ${code}: ${stderr.slice(-1000)}`)));
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const slug = process.argv[process.argv.indexOf('--slug') + 1];
    const jobId = process.argv[process.argv.indexOf('--job-id') + 1];
    const { template } = await validatePackage(process.cwd(), slug);
    if (!/^hfb-[a-z0-9-]+-[0-9]+$/.test(jobId || '')) throw new Error('Missing or invalid render job ID');
    const [voice, render] = draftCommands({ slug, template, jobId });
    await run(voice);
    const output = await run(render);
    const completed = parseCompletedRender(output);
    if (completed.jobId !== jobId) throw new Error('Completed job ID mismatch');
    console.log(JSON.stringify({ event: 'review_ready', slug, ...completed }));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
