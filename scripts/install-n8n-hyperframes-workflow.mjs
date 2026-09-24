import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_ENV_PATH = 'C:/Users/USUARIO/Downloads/mcp-n8n/.env';
const DEFAULT_WORKFLOW_PATH = 'n8n/hyperframes-render-workflow.json';

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function readEnv(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([^=]+)=(.*)$/);
    if (!match) continue;
    env[match[1].trim()] = match[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return env;
}

function workflowPayload(workflow) {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: workflow.settings?.executionOrder
      ? { executionOrder: workflow.settings.executionOrder }
      : workflow.settings,
  };
}

async function request(url, options) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') || '';
  const text = await response.text();
  const data = contentType.includes('application/json') && text ? JSON.parse(text) : text;
  return { response, contentType, data, text };
}

const envPath = readArg('--env', DEFAULT_ENV_PATH);
const workflowPath = readArg('--workflow', DEFAULT_WORKFLOW_PATH);
const env = await readEnv(envPath);
const workflow = JSON.parse(await fs.readFile(workflowPath, 'utf8'));

if (!env.N8N_BASE_URL || !env.N8N_API_KEY) {
  throw new Error(`Missing N8N_BASE_URL or N8N_API_KEY in ${envPath}`);
}

const baseUrl = env.N8N_BASE_URL.replace(/\/$/, '');
const apiUrl = `${baseUrl}/api/v1/workflows/${workflow.id}`;
const headers = {
  'Content-Type': 'application/json',
  'X-N8N-API-KEY': env.N8N_API_KEY,
};

if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
  headers['CF-Access-Client-Id'] = env.CF_ACCESS_CLIENT_ID;
  headers['CF-Access-Client-Secret'] = env.CF_ACCESS_CLIENT_SECRET;
}

const current = await request(apiUrl, { headers });
if (!current.response.ok || !current.contentType.includes('application/json')) {
  const preview = typeof current.data === 'string' ? current.data.slice(0, 160) : JSON.stringify(current.data);
  throw new Error(`Cannot read workflow ${workflow.id}. HTTP ${current.response.status}, content-type ${current.contentType}. ${preview}`);
}

await fs.mkdir('n8n/backups', { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
await fs.writeFile(
  path.join('n8n/backups', `${workflow.id}-${stamp}-before-hyperframes-render.json`),
  JSON.stringify(current.data, null, 2),
);

const updated = await request(apiUrl, {
  method: 'PUT',
  headers,
  body: JSON.stringify(workflowPayload(workflow)),
});

if (!updated.response.ok || !updated.contentType.includes('application/json')) {
  const preview = typeof updated.data === 'string' ? updated.data.slice(0, 160) : JSON.stringify(updated.data);
  throw new Error(`Cannot update workflow ${workflow.id}. HTTP ${updated.response.status}, content-type ${updated.contentType}. ${preview}`);
}

console.log(JSON.stringify({
  id: updated.data.id,
  name: updated.data.name,
  active: updated.data.active,
  nodes: updated.data.nodes?.length,
  webhookPaths: updated.data.nodes
    ?.filter((node) => node.type === 'n8n-nodes-base.webhook')
    .map((node) => node.parameters?.path),
}, null, 2));
