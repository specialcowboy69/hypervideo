import fs from "node:fs/promises";

const DEFAULT_ENV_PATH = "C:/Users/USUARIO/Downloads/mcp-n8n/.env";

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function parseEnv(raw) {
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index < 0) continue;
    env[trimmed.slice(0, index)] = trimmed.slice(index + 1).replace(/^['"]|['"]$/g, "");
  }
  return env;
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: { ...headers, "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${text.slice(0, 1000)}`);
  }
  return data;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const slug = readArg("--slug");
const zipName = readArg("--zip", `${slug}.zip`);
const mode = readArg("--mode", "draft");
const envPath = readArg("--env", DEFAULT_ENV_PATH);
const pollMs = Number(readArg("--poll-ms", "15000"));
const timeoutMs = Number(readArg("--timeout-ms", String(45 * 60 * 1000)));

if (!slug) {
  console.error("Usage: node scripts/trigger-n8n-render.mjs --slug <slug> [--zip <zip>] [--mode draft]");
  process.exit(1);
}

const env = parseEnv(await fs.readFile(envPath, "utf8"));
const baseUrl = env.N8N_BASE_URL?.replace(/\/$/, "");
if (!baseUrl) throw new Error(`Missing N8N_BASE_URL in ${envPath}`);

const headers = {};
if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
  headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
  headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
}

const jobId = `hf-${slug}-${Date.now()}`;
const renderUrl = `${baseUrl}/webhook/hyperframes-render`;
const statusUrl = `${baseUrl}/webhook/hyperframes-render-status`;

const accepted = await postJson(renderUrl, headers, { slug, zipName, mode, jobId });
console.log(JSON.stringify({ event: "accepted", ...accepted }, null, 2));

const startedAt = Date.now();
let lastProgress = -1;
let lastStep = "";

while (Date.now() - startedAt < timeoutMs) {
  await sleep(pollMs);
  const status = await postJson(statusUrl, headers, { jobId });
  const progress = Number(status.progress ?? 0);
  const step = String(status.step || status.stage || "");
  if (progress !== lastProgress || step !== lastStep || ["completed", "failed"].includes(status.status)) {
    console.log(JSON.stringify({
      event: "status",
      jobId,
      status: status.status,
      step,
      progress,
      message: status.message,
      lastLog: status.lastLog,
      downloadUrl: status.downloadUrl
    }, null, 2));
    lastProgress = progress;
    lastStep = step;
  }

  if (status.status === "completed") {
    console.log(JSON.stringify({ event: "completed", ...status }, null, 2));
    process.exit(0);
  }

  if (status.status === "failed") {
    console.error(JSON.stringify({ event: "failed", ...status }, null, 2));
    process.exit(2);
  }
}

console.error(JSON.stringify({ event: "timeout", jobId, timeoutMs }, null, 2));
process.exit(3);
