import fs from "node:fs/promises";

const workflowPath = "n8n/hyperframes-render-workflow.json";
const workflow = JSON.parse(await fs.readFile(workflowPath, "utf8"));

function node(name) {
  const found = workflow.nodes.find((item) => item.name === name);
  if (!found) throw new Error(`Missing node: ${name}`);
  return found;
}

function upsertNode(next) {
  const index = workflow.nodes.findIndex((item) => item.name === next.name);
  if (index >= 0) workflow.nodes[index] = { ...workflow.nodes[index], ...next };
  else workflow.nodes.push(next);
}

function connect(from, to) {
  workflow.connections[from] = {
    main: [
      [
        {
          node: to,
          type: "main",
          index: 0
        }
      ]
    ]
  };
}

node("Prepare HyperFrames Render").parameters.jsCode = `const item = $input.first();
const input = item.json?.body || item.json?.query || item.json || {};
const binaryEntries = Object.entries(item.binary || {});
if (binaryEntries.length) {
  throw new Error('Direct ZIP upload is not enabled in this n8n container. Upload the ZIP to /opt/n8n/hyperframes_uploads first, or pass an https zipUrl.');
}

const publicBaseUrl = 'https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev';
const rawMode = String(input.mode || input.quality || 'draft').trim().toLowerCase();
const mode = rawMode === 'final' || rawMode === 'standard' ? 'final' : rawMode;
if (!['draft', 'final'].includes(mode)) throw new Error('Invalid mode. Use draft or final.');

const rawSlug = String(input.slug || input.project || '').trim();
const rawZipName = String(input.zipName || input.zip || input.fileName || (rawSlug ? rawSlug + '.zip' : '')).trim();
if (!rawZipName) throw new Error('Missing zipName. Example: animaciones-ux-funcionales.zip');
if (!/^[A-Za-z0-9._-]+\\.zip$/.test(rawZipName) || rawZipName.includes('..') || rawZipName.includes('/') || rawZipName.includes('\\\\')) {
  throw new Error('Invalid zipName. Use only letters, numbers, dot, dash and underscore, ending in .zip.');
}

const slug = rawSlug || rawZipName.replace(/\\.zip$/i, '');
if (!/^[A-Za-z0-9._-]{1,80}$/.test(slug) || slug.includes('..')) {
  throw new Error('Invalid slug. Use only letters, numbers, dot, dash and underscore.');
}

const zipName = rawZipName;
const rawZipUrl = String(input.zipUrl || input.url || '').trim();
if (rawZipUrl && !/^https:\\/\\/[^\\s"'<>]+$/i.test(rawZipUrl)) throw new Error('Invalid zipUrl. Use an https URL.');

function sh(value) {
  return "'" + String(value).replace(/'/g, "'\\\\''") + "'";
}

const outputPrefix = mode === 'final' ? 'hyperframes/finals' : 'hyperframes/drafts';
const jobId = String(input.jobId || 'hf_' + $execution.id + '_' + Date.now());
if (!/^[A-Za-z0-9._-]{1,120}$/.test(jobId) || jobId.includes('..')) {
  throw new Error('Invalid jobId. Use only letters, numbers, dot, dash and underscore.');
}

const uploadPath = '/opt/n8n/hyperframes_uploads/' + zipName;
const containerZipPath = '/work/uploads/' + zipName;
const fetchCommand = rawZipUrl ? 'mkdir -p /opt/n8n/hyperframes_uploads && curl -fsSL ' + sh(rawZipUrl) + ' -o ' + sh(uploadPath) + ' && ' : '';
const wrapperCommand = '/work/scripts/render-with-status.sh ' + sh(containerZipPath) + ' ' + sh(mode) + ' ' + sh(slug) + ' ' + sh(jobId);
const sshCommand = 'cd /opt/n8n && ' + fetchCommand + 'nohup docker compose exec -T hyperframes-renderer bash -lc ' + sh(wrapperCommand) + ' >/tmp/' + jobId + '.launcher.log 2>&1 &';

const expectedDownloadUrl = publicBaseUrl + '/' + outputPrefix + '/' + slug + '.mp4';
const job = {
  jobId,
  status: 'processing',
  stage: rawZipUrl ? 'fetching_zip' : 'accepted',
  progress: 0,
  step: 'accepted',
  mode,
  slug,
  zipName,
  zipUrl: rawZipUrl || undefined,
  expectedDownloadUrl,
  uploadPath,
  containerZipPath,
  sshCommand,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const staticData = $getWorkflowStaticData('global');
staticData.hyperframesJobs = staticData.hyperframesJobs || {};
staticData.hyperframesJobs[jobId] = job;
return [{ json: job }];`;

node("Respond HyperFrames Accepted").parameters.responseBody =
  "={{ { jobId: $json.jobId, status: 'processing', stage: $json.stage, step: $json.step, progress: $json.progress, slug: $json.slug, mode: $json.mode, statusWebhook: '/webhook/hyperframes-render-status' } }}";

node("Store HyperFrames Result").parameters.jsCode = `const source = $('Prepare HyperFrames Render').first().json;
const jobId = source.jobId;
const staticData = $getWorkflowStaticData('global');
staticData.hyperframesJobs = staticData.hyperframesJobs || {};

const text = [
  $json.stdout,
  $json.stderr,
  $json.data,
  $json.output,
  $json.message,
  typeof $json.error === 'string' ? $json.error : $json.error?.message
].filter((value) => typeof value === 'string' && value.trim()).join('\\n');

const now = new Date().toISOString();
const previous = staticData.hyperframesJobs[jobId] || {};
if ($json.error || /permission denied|not found|invalid|failed/i.test(text)) {
  staticData.hyperframesJobs[jobId] = {
    ...previous,
    ...source,
    status: 'failed',
    stage: 'launcher_failed',
    step: 'launcher',
    progress: 100,
    error: typeof $json.error === 'string' ? $json.error : $json.error?.message || text.slice(0, 4000) || 'HyperFrames launcher failed.',
    rawOutput: text.slice(0, 12000),
    updatedAt: now,
    finishedAt: now
  };
  return [{ json: staticData.hyperframesJobs[jobId] }];
}

staticData.hyperframesJobs[jobId] = {
  ...previous,
  ...source,
  status: 'processing',
  stage: 'launched',
  step: 'queued',
  progress: 5,
  rawOutput: text.slice(0, 12000),
  updatedAt: now
};
return [{ json: staticData.hyperframesJobs[jobId] }];`;

node("HyperFrames Status Lookup").parameters.jsCode = `const input = $json.body || $json.query || $json;
const jobId = String(input.jobId || input.id || '').trim();
if (!jobId) return [{ json: { status: 'failed', error: 'Missing jobId' } }];
if (!/^[A-Za-z0-9._-]{1,120}$/.test(jobId) || jobId.includes('..')) {
  return [{ json: { jobId, status: 'failed', error: 'Invalid jobId' } }];
}

function sh(value) {
  return "'" + String(value).replace(/'/g, "'\\\\''") + "'";
}

const staticData = $getWorkflowStaticData('global');
staticData.hyperframesJobs = staticData.hyperframesJobs || {};
const job = staticData.hyperframesJobs[jobId] || { jobId, status: 'processing', stage: 'queued' };
const statusPath = '/work/jobs/' + jobId + '/status.json';
const inner = 'if [ -f ' + sh(statusPath) + ' ]; then cat ' + sh(statusPath) + '; else printf ' + sh(JSON.stringify({
  jobId,
  status: 'processing',
  step: 'queued',
  progress: 0,
  message: 'Status file not created yet'
}) + '\\n') + '; fi';

return [{
  json: {
    ...job,
    jobId,
    sshStatusCommand: 'cd /opt/n8n && docker compose exec -T hyperframes-renderer bash -lc ' + sh(inner)
  }
}];`;

upsertNode({
  id: "e8b7f456-f0f6-4a1f-a0bc-25f4964b3dfd",
  name: "SSH Read HyperFrames Status",
  type: "n8n-nodes-base.ssh",
  typeVersion: 1,
  position: [-520, 80],
  parameters: {
    command: "={{ $json.sshStatusCommand }}"
  },
  credentials: {
    sshPassword: {
      id: "mWkSfxsxrg38m28T",
      name: "SSH Password account"
    }
  },
  continueOnFail: true
});

upsertNode({
  id: "6eeb00d2-3771-43d4-b9de-d4dfd8281849",
  name: "Format HyperFrames Status",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-280, 80],
  parameters: {
    jsCode: `const source = $('HyperFrames Status Lookup').first().json;
const jobId = source.jobId;
const staticData = $getWorkflowStaticData('global');
staticData.hyperframesJobs = staticData.hyperframesJobs || {};

const text = [
  $json.stdout,
  $json.stderr,
  $json.data,
  $json.output,
  $json.message,
  typeof $json.error === 'string' ? $json.error : $json.error?.message
].filter((value) => typeof value === 'string' && value.trim()).join('\\n');

let remote = {};
try {
  const match = text.match(/\\{[\\s\\S]*\\}/);
  remote = match ? JSON.parse(match[0]) : {};
} catch (error) {
  remote = {
    status: 'processing',
    step: 'status_parse',
    progress: source.progress || 0,
    message: 'No se pudo parsear status.json',
    error: error.message,
    rawStatusOutput: text.slice(0, 4000)
  };
}

if ($json.error && !remote.error) {
  remote.error = typeof $json.error === 'string' ? $json.error : $json.error?.message || 'SSH status lookup failed';
}

const mp4Url = [remote.downloadUrl, remote.lastLog, text]
  .filter((value) => typeof value === 'string')
  .join('\\n')
  .match(/https?:\\/\\/[^\\s"'<>]+\\.mp4(?:\\?[^\\s"'<>]+)?/i)?.[0];

const now = new Date().toISOString();
const previous = staticData.hyperframesJobs[jobId] || {};
const merged = {
  ...previous,
  ...source,
  ...remote,
  jobId,
  status: remote.status || previous.status || source.status || 'processing',
  stage: remote.step || previous.stage || source.stage,
  step: remote.step || source.step,
  progress: Number.isFinite(Number(remote.progress)) ? Number(remote.progress) : source.progress,
  message: remote.message,
  lastLog: remote.lastLog,
  logFile: remote.logFile,
  downloadUrl: mp4Url || previous.downloadUrl || source.downloadUrl,
  updatedAt: remote.updatedAt || now
};

if (merged.status === 'completed' || merged.status === 'failed') {
  merged.finishedAt = merged.finishedAt || now;
}

delete merged.sshCommand;
delete merged.sshStatusCommand;
staticData.hyperframesJobs[jobId] = merged;

return [{
  json: {
    jobId,
    status: merged.status,
    stage: merged.stage,
    step: merged.step,
    progress: merged.progress,
    message: merged.message,
    mode: merged.mode,
    slug: merged.slug,
    zipName: merged.zipName,
    downloadUrl: merged.downloadUrl,
    outputPath: merged.outputPath,
    expectedDownloadUrl: merged.expectedDownloadUrl,
    lastLog: merged.lastLog,
    logFile: merged.logFile,
    error: merged.error,
    updatedAt: merged.updatedAt,
    finishedAt: merged.finishedAt
  }
}];`
  }
});

node("Respond HyperFrames Status").position = [-40, 80];

connect("HyperFrames Status Lookup", "SSH Read HyperFrames Status");
connect("SSH Read HyperFrames Status", "Format HyperFrames Status");
connect("Format HyperFrames Status", "Respond HyperFrames Status");

await fs.writeFile(workflowPath, JSON.stringify(workflow, null, 2) + "\n");
console.log(`Patched ${workflowPath}`);
