import fs from "node:fs/promises";

const workflowPath = "n8n/hyperframes-render-workflow.json";
const workflow = JSON.parse(await fs.readFile(workflowPath, "utf8"));

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

upsertNode({
  id: "d53cd0ac-4dcc-46e9-a7f4-2d88f536a2a2",
  name: "Webhook HyperFrames Build Render",
  type: "n8n-nodes-base.webhook",
  typeVersion: 2.1,
  position: [-980, -520],
  parameters: {
    httpMethod: "POST",
    path: "hyperframes-build-render",
    responseMode: "responseNode",
    options: {}
  }
});

upsertNode({
  id: "f567faaa-2c40-4379-91df-7dbeb9857c20",
  name: "Prepare HyperFrames Build Render",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-760, -520],
  parameters: {
    jsCode: `const item = $input.first();
const input = item.json?.body || item.json?.query || item.json || {};
const binaryEntries = Object.entries(item.binary || {});
if (binaryEntries.length) {
  throw new Error('Direct source ZIP upload is not enabled. Upload to /opt/n8n/hyperframes_uploads first, or pass an https sourceZipUrl.');
}

const publicBaseUrl = 'https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev';
const rawMode = String(input.mode || input.quality || 'draft').trim().toLowerCase();
const mode = rawMode === 'final' || rawMode === 'standard' ? 'final' : rawMode;
if (!['draft', 'final'].includes(mode)) throw new Error('Invalid mode. Use draft, standard or final.');

const slug = String(input.slug || input.project || '').trim();
if (!/^[A-Za-z0-9._-]{1,80}$/.test(slug) || slug.includes('..')) {
  throw new Error('Invalid slug. Use only letters, numbers, dot, dash and underscore.');
}

const rawSourceZipName = String(input.sourceZipName || input.sourceZip || input.zipName || (slug ? slug + '-source.zip' : '')).trim();
if (!/^[A-Za-z0-9._-]+\\.zip$/.test(rawSourceZipName) || rawSourceZipName.includes('..') || rawSourceZipName.includes('/') || rawSourceZipName.includes('\\\\')) {
  throw new Error('Invalid sourceZipName. Use only letters, numbers, dot, dash and underscore, ending in .zip.');
}

const template = String(input.template || input.visualTemplate || '').trim();
if (template && !/^[A-Za-z0-9._/-]{1,120}$/.test(template)) {
  throw new Error('Invalid template.');
}

const rawSourceZipUrl = String(input.sourceZipUrl || input.zipUrl || input.url || '').trim();
if (rawSourceZipUrl && !/^https:\\/\\/[^\\s"'<>]+$/i.test(rawSourceZipUrl)) {
  throw new Error('Invalid sourceZipUrl. Use an https URL.');
}

const jobId = String(input.jobId || 'hfb_' + $execution.id + '_' + Date.now());
if (!/^[A-Za-z0-9._-]{1,120}$/.test(jobId) || jobId.includes('..')) {
  throw new Error('Invalid jobId. Use only letters, numbers, dot, dash and underscore.');
}

function sh(value) {
  return "'" + String(value).replace(/'/g, "'\\\\''") + "'";
}

const sourceZipName = rawSourceZipName;
const uploadPath = '/opt/n8n/hyperframes_uploads/' + sourceZipName;
const containerSourceZipPath = '/work/uploads/' + sourceZipName;
const fetchCommand = rawSourceZipUrl ? 'mkdir -p /opt/n8n/hyperframes_uploads && curl -fsSL ' + sh(rawSourceZipUrl) + ' -o ' + sh(uploadPath) + ' && ' : '';
const wrapperArgs = [
  '/work/scripts/build-check-render-with-status.sh',
  containerSourceZipPath,
  mode,
  slug,
  jobId
];
if (template) wrapperArgs.push(template);
const wrapperCommand = wrapperArgs.map(sh).join(' ');
const sshCommand = 'cd /opt/n8n && ' + fetchCommand + 'nohup docker compose exec -T hyperframes-renderer bash -lc ' + sh(wrapperCommand) + ' >/tmp/' + jobId + '.launcher.log 2>&1 &';

const outputPrefix = mode === 'final' ? 'hyperframes/finals' : 'hyperframes/drafts';
const expectedDownloadUrl = publicBaseUrl + '/' + outputPrefix + '/' + slug + '.mp4';
const job = {
  jobId,
  status: 'processing',
  stage: rawSourceZipUrl ? 'fetching_source_zip' : 'accepted',
  progress: 0,
  step: 'accepted',
  mode,
  slug,
  template: template || undefined,
  sourceZipName,
  sourceZipUrl: rawSourceZipUrl || undefined,
  zipName: sourceZipName,
  expectedDownloadUrl,
  uploadPath,
  containerSourceZipPath,
  sshCommand,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

const staticData = $getWorkflowStaticData('global');
staticData.hyperframesJobs = staticData.hyperframesJobs || {};
staticData.hyperframesJobs[jobId] = job;
return [{ json: job }];`
  }
});

upsertNode({
  id: "fa32e476-15b1-46cc-b615-6f12647dd043",
  name: "Respond HyperFrames Build Accepted",
  type: "n8n-nodes-base.respondToWebhook",
  typeVersion: 1.4,
  position: [-520, -520],
  parameters: {
    respondWith: "json",
    responseBody: "={{ { jobId: $json.jobId, status: 'processing', stage: $json.stage, step: $json.step, progress: $json.progress, slug: $json.slug, mode: $json.mode, sourceZipName: $json.sourceZipName, statusWebhook: '/webhook/hyperframes-render-status' } }}",
    options: {}
  }
});

upsertNode({
  id: "f6346f7c-5d0a-4e94-aef6-0d33043cefa5",
  name: "SSH Build Render HyperFrames",
  type: "n8n-nodes-base.ssh",
  typeVersion: 1,
  position: [-280, -520],
  parameters: {
    command: "={{ $json.sshCommand }}"
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
  id: "d7a0ebf8-5955-4f38-a063-10c7badf116e",
  name: "Store HyperFrames Build Result",
  type: "n8n-nodes-base.code",
  typeVersion: 2,
  position: [-40, -520],
  parameters: {
    jsCode: `const source = $('Prepare HyperFrames Build Render').first().json;
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
    error: typeof $json.error === 'string' ? $json.error : $json.error?.message || text.slice(0, 4000) || 'HyperFrames build/render launcher failed.',
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
return [{ json: staticData.hyperframesJobs[jobId] }];`
  }
});

connect("Webhook HyperFrames Build Render", "Prepare HyperFrames Build Render");
connect("Prepare HyperFrames Build Render", "Respond HyperFrames Build Accepted");
connect("Respond HyperFrames Build Accepted", "SSH Build Render HyperFrames");
connect("SSH Build Render HyperFrames", "Store HyperFrames Build Result");

await fs.writeFile(workflowPath, JSON.stringify(workflow, null, 2) + "\n");
console.log(`Patched ${workflowPath} with hyperframes-build-render`);
