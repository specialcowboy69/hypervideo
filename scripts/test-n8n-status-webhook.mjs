import fs from "node:fs/promises";

const envPath = "C:/Users/USUARIO/Downloads/mcp-n8n/.env";
const jobIndex = process.argv.indexOf("--job");
const jobId = jobIndex >= 0 ? process.argv[jobIndex + 1] : "test-status-004";

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

const env = parseEnv(await fs.readFile(envPath, "utf8"));
const headers = { "content-type": "application/json" };
if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
  headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
  headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
}

const url = env.N8N_BASE_URL.replace(/\/$/, "") + "/webhook/hyperframes-render-status";
const response = await fetch(url, {
  method: "POST",
  headers,
  body: JSON.stringify({ jobId })
});
const text = await response.text();
console.log(JSON.stringify({
  status: response.status,
  ok: response.ok,
  body: text ? JSON.parse(text) : null
}, null, 2));
