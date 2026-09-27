import fs from "node:fs/promises";
import path from "node:path";
import { buildSummaryPromptCode, patchSummaryPrompt } from "./sync-summary-intake-prompt.mjs";

const WORKFLOW_ID = "eXLSEY7Fzg0kGBit";
const N8N_ENV_PATH = "C:/Users/USUARIO/Downloads/mcp-n8n/.env";

async function loadEnvFile(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    const key = trimmed.slice(0, index);
    const value = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function codeForPreparePipeline() {
  return String.raw`function collectStrings(value, output = []) {
  if (typeof value === 'string') output.push(value);
  else if (Array.isArray(value)) for (const item of value) collectStrings(item, output);
  else if (value && typeof value === 'object') for (const item of Object.values(value)) collectStrings(item, output);
  return output;
}
function extractJson(text) {
  const fence = String.fromCharCode(96, 96, 96);
  const raw = String(text || '').trim()
    .replace(new RegExp('^' + fence + '(?:json)?', 'i'), '')
    .replace(new RegExp(fence + '$', 'i'), '')
    .trim();
  try { return JSON.parse(raw); } catch {}
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(raw.slice(start, end + 1));
  throw new Error('AI output was not valid JSON.');
}
function sh(value) {
  return "'" + String(value).replace(/'/g, "'\\''") + "'";
}
function dockerRun(args, extraMounts = []) {
  const command = [
    'sudo', '-n', 'docker', 'run', '--rm', '--network', 'host',
    '-v', '/opt/n8n/hyperframes:/work',
    ...extraMounts,
    '-w', '/work',
    'n8n-hyperframes-renderer',
    ...args
  ];
  return command.map(sh).join(' ');
}
const direct = ($json && typeof $json === 'object' && $json.title && Array.isArray($json.scenes)) ? $json : null;
const strings = collectStrings($json);
const data = direct || extractJson(strings.find((entry) => entry.includes('{') && entry.includes('scenes')) || strings[0] || '');
if (!data.summary || !Array.isArray(data.scenes)) throw new Error('AI output must include summary and scenes[].');
if (data.scenes.length < 4 || data.scenes.length > 7) throw new Error('AI output must include 4-7 scenes.');
const allowed = new Set(['serp','dashboard','keyword-map','funnel','comparison','checklist','timeline','cta']);
for (const [index, scene] of data.scenes.entries()) {
  if (!scene.screen_text) throw new Error('Scene ' + (index + 1) + ' is missing screen_text.');
  if (!scene.text) throw new Error('Scene ' + (index + 1) + ' is missing text.');
  if (!scene.stage || !allowed.has(scene.stage.type)) throw new Error('Scene ' + (index + 1) + ' has invalid stage type.');
}
const json = JSON.stringify(data);
const b64 = Buffer.from(json, 'utf8').toString('base64');
const fileName = 'summary-intake-' + Date.now() + '-' + Math.random().toString(36).slice(2) + '.json';
const hostInputPath = '/opt/n8n/hyperframes/tmp/summary-intake/' + fileName;
const containerInputPath = 'tmp/summary-intake/' + fileName;
const dockerCommand = dockerRun(
  ['node', 'scripts/run-data-lab-video-pipeline.mjs', '--input', containerInputPath, '--env', '.env.n8n', '--vps-local'],
  ['-v', '/opt/n8n/hyperframes_uploads:/opt/n8n/hyperframes_uploads']
);
const sshCommand = '(mkdir -p /opt/n8n/hyperframes/tmp/summary-intake && printf %s ' + sh(b64) + ' | base64 -d > ' + sh(hostInputPath) + ' && cd /opt/n8n && ' + dockerCommand + '); status=$?; sudo -n chown -R codex_tmp:codex_tmp /opt/n8n/hyperframes || true; exit $status';
return [{ json: { summary: data.summary, title: data.title, caption: data.caption, platforms: data.platforms || ['instagram'], aiData: data, inputPath: hostInputPath, sshCommand } }];`;
}

function codeForPrepareReview(action) {
  return String.raw`function sh(value) { return "'" + String(value).replace(/'/g, "'\\''") + "'"; }
function dockerRun(args) {
  const command = [
    'sudo', '-n', 'docker', 'run', '--rm', '--network', 'host',
    '-v', '/opt/n8n/hyperframes:/work',
    '-w', '/work',
    'n8n-hyperframes-renderer',
    ...args
  ];
  return command.map(sh).join(' ');
}
const input = $json.body || $json.query || $json;
const slug = String(input.slug || '').trim();
if (!/^[A-Za-z0-9._-]{1,80}$/.test(slug) || slug.includes('..')) throw new Error('Invalid or missing slug.');
const action = "__ACTION__";
let args = ['node', 'scripts/review-video-job.mjs', '--slug', slug, '--action', action, '--env', '.env.n8n'];
if (action === 'approve') {
  const caption = String(input.caption || '').trim();
  const publishAt = String(input.publish_at || input.publishAt || new Date().toISOString()).trim();
  const platforms = Array.isArray(input.platforms) ? input.platforms.join(',') : String(input.platforms || 'instagram').trim();
  args.push('--caption', caption, '--publish-at', publishAt, '--platforms', platforms);
  if (input.video_url || input.videoUrl) args.push('--video-url', String(input.video_url || input.videoUrl).trim());
  if (input.dry_run === true || input.dryRun === true || String(input.dry_run || input.dryRun || '').toLowerCase() === 'true') args.push('--dry-run');
} else {
  args.push('--reason', String(input.reason || 'Rejected').trim());
}
const dockerCommand = dockerRun(args);
const sshCommand = '(cd /opt/n8n && ' + dockerCommand + '); status=$?; sudo -n chown -R codex_tmp:codex_tmp /opt/n8n/hyperframes || true; exit $status';
return [{ json: { slug, action, sshCommand } }];`.replace("__ACTION__", action);
}

function codeForFormatReview(sourceNodeName) {
  return String.raw`function extractJsonObjects(text) {
  const objects = [];
  let start = -1, depth = 0, inString = false, escaped = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') { if (depth === 0) start = i; depth++; }
    else if (char === '}') { depth--; if (depth === 0 && start >= 0) { try { objects.push(JSON.parse(text.slice(start, i + 1))); } catch {} start = -1; } }
  }
  return objects;
}
const source = $('__SOURCE__').first().json;
const text = [$json.stdout, $json.stderr, $json.data, $json.output, $json.message, typeof $json.error === 'string' ? $json.error : $json.error?.message]
  .filter((value) => typeof value === 'string' && value.trim()).join('\n');
const objects = extractJsonObjects(text);
const parsed = [...objects].reverse().find((entry) => entry.event) || {};
return [{ json: { ok: !$json.error, slug: source.slug, action: source.action, event: parsed.event, error: $json.error?.message || (typeof $json.error === 'string' ? $json.error : undefined), rawOutput: text.slice(-4000) } }];`.replace("__SOURCE__", sourceNodeName);
}

function stripSensitiveForExport(workflow) {
  return {
    ...workflow,
    nodes: workflow.nodes.map((node) => {
      const { credentials, ...rest } = node;
      return rest;
    }),
    pinData: {},
    staticData: undefined
  };
}

function syntaxCheck(name, source) {
  new Function(source);
  console.log(`syntax ok: ${name}`);
}

await loadEnvFile(N8N_ENV_PATH);
const { getWorkflow, updateWorkflow } = await import("file:///C:/Users/USUARIO/Downloads/mcp-n8n/build/n8n-api.js");

let workflow = await getWorkflow(WORKFLOW_ID);
const backupDir = path.resolve("n8n", "backups");
await fs.mkdir(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const backupPath = path.join(backupDir, `${WORKFLOW_ID}-${stamp}-before-vps-runtime.json`);
await fs.writeFile(backupPath, JSON.stringify(workflow, null, 2), "utf8");

const promptCode = await buildSummaryPromptCode();
syntaxCheck("Set Summary And Prompt", promptCode);
workflow = patchSummaryPrompt(workflow, promptCode);

const updates = new Map([
  ["Validate AI JSON And Prepare Pipeline", codeForPreparePipeline()],
  ["Prepare Review Command", codeForPrepareReview("approve")],
  ["Prepare Reject Command", codeForPrepareReview("reject")],
  ["Format Review Approve Result", codeForFormatReview("Prepare Review Command")],
  ["Format Review Reject Result", codeForFormatReview("Prepare Reject Command")]
]);

for (const [name, code] of updates) syntaxCheck(name, code);

for (const node of workflow.nodes) {
  if (updates.has(node.name)) node.parameters.jsCode = updates.get(node.name);
  if (node.type === "n8n-nodes-base.ssh") node.continueOnFail = true;
}

const updated = await updateWorkflow(WORKFLOW_ID, workflow);
const exportPath = path.resolve("n8n", "hyperframes-summary-intake-workflow.json");
await fs.writeFile(exportPath, JSON.stringify(stripSensitiveForExport(updated), null, 2), "utf8");

console.log(JSON.stringify({
  workflowId: WORKFLOW_ID,
  name: updated.name,
  active: updated.active,
  nodeCount: updated.nodes.length,
  backupPath,
  exportPath
}, null, 2));
