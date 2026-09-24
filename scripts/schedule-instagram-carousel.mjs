import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

const DEFAULT_ENV_PATH = "C:/Users/USUARIO/Downloads/mcp-n8n/.env";
const DEFAULT_SSH_HOST = "72.61.161.99";
const DEFAULT_SSH_USER = "codex_tmp";
const DEFAULT_SSH_KEY = path.join(os.homedir(), ".ssh", "codex_hyperframes_tmp_rsa");
const REMOTE_UPLOAD_DIR = "/opt/n8n/hyperframes_uploads";
const DEFAULT_PUBLIC_BASE_URL = "https://pub-5d88690ab45b4187800a2f33589c6c13.r2.dev";

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
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

function validateSlug(slug) {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(slug) || slug.includes("..")) {
    throw new Error("Invalid slug. Use only letters, numbers, dot, dash and underscore.");
  }
}

function run(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { windowsHide: true, ...options }, (error, stdout, stderr) => {
      if (error) {
        error.stdout = stdout;
        error.stderr = stderr;
        reject(error);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function publicUrl(baseUrl, key) {
  const encodedKey = key
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
  return `${baseUrl.replace(/\/$/, "")}/${encodedKey}`;
}

async function postJson(url, headers, body) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      ...headers,
      "content-type": "application/json; charset=utf-8",
      "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0 Safari/537.36"
    },
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

async function createSlidesZip({ root, manifest, zipPath }) {
  const pngFiles = manifest.slides.map((slide) => slide.png);
  for (const png of pngFiles) {
    const fullPath = path.join(root, ...png.split("/"));
    if (!(await exists(fullPath))) throw new Error(`Missing PNG: ${png}`);
  }
  await fs.rm(zipPath, { force: true });
  await run("tar.exe", ["-a", "-cf", zipPath, "-C", path.join(root, "carousels", manifest.slug), ...pngFiles.map((png) => path.basename(png))]);
}

async function uploadZipToVps({ zipPath, zipName, sshKey, sshUser, sshHost }) {
  await run("scp", ["-i", sshKey, zipPath, `${sshUser}@${sshHost}:/tmp/${zipName}`]);
  await run("ssh", [
    "-i",
    sshKey,
    `${sshUser}@${sshHost}`,
    `sudo install -m 644 ${shellQuote(`/tmp/${zipName}`)} ${shellQuote(`${REMOTE_UPLOAD_DIR}/${zipName}`)} && rm -f ${shellQuote(`/tmp/${zipName}`)}`
  ]);
}

async function uploadSlidesToR2({ slug, manifest, sshKey, sshUser, sshHost }) {
  const jobId = `hfc-${slug}-${Date.now()}`;
  const zipName = `${jobId}-slides.zip`;
  const zipPath = path.join(os.tmpdir(), zipName);
  await createSlidesZip({ root: process.cwd(), manifest, zipPath });
  await uploadZipToVps({ zipPath, zipName, sshKey, sshUser, sshHost });

  const remoteZipPath = `/work/uploads/${zipName}`;
  const workDir = `/work/jobs/${jobId}/carousel-slides`;
  const r2Prefix = `carruseles instagram/${slug}`;
  const inner = [
    "set -euo pipefail",
    `R2_PREFIX=${shellQuote(r2Prefix)}`,
    `rm -rf ${shellQuote(workDir)}`,
    `mkdir -p ${shellQuote(workDir)}`,
    `unzip -q ${shellQuote(remoteZipPath)} -d ${shellQuote(workDir)}`,
    `aws s3 cp ${shellQuote(workDir)} "s3://\${R2_BUCKET}/\${R2_PREFIX}/" --recursive --exclude '*' --include '*.png' --endpoint-url "$R2_ENDPOINT" --content-type image/png >/dev/null`,
    'printf "%s" "${R2_PUBLIC_BASE_URL:-}"'
  ].join(" && ");

  const { stdout } = await run("ssh", [
    "-i",
    sshKey,
    `${sshUser}@${sshHost}`,
    `cd /opt/n8n && sudo docker compose exec -T hyperframes-renderer bash -lc ${shellQuote(inner)}`
  ]);

  await fs.rm(zipPath, { force: true });
  const baseUrl = stdout.trim() || DEFAULT_PUBLIC_BASE_URL;
  return {
    jobId,
    r2Prefix,
    publicBaseUrl: baseUrl,
    urls: manifest.slides.map((slide) => publicUrl(baseUrl, `${r2Prefix}/${slide.fileName || path.basename(slide.png)}`))
  };
}

async function updateManifest({ manifestPath, manifest, upload }) {
  manifest.r2_prefix = upload.r2Prefix;
  manifest.public_base_url = upload.publicBaseUrl;
  manifest.uploaded_at = new Date().toISOString();
  manifest.upload_job_id = upload.jobId;
  manifest.slides = manifest.slides.map((slide, index) => ({
    ...slide,
    image_url: upload.urls[index],
    url: upload.urls[index]
  }));
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

async function updateQueue({ root, slug, status, response, manifest }) {
  const queuePath = path.join(root, "content", "carousel-queue", "queue.json");
  if (!(await exists(queuePath))) return;
  const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
  queue.items = Array.isArray(queue.items) ? queue.items : [];
  const index = queue.items.findIndex((item) => item.slug === slug);
  const existing = index >= 0 ? queue.items[index] : {};
  const item = {
    slug,
    title: existing.title || manifest.title || slug,
    status,
    folder: existing.folder || `pending/${slug}`,
    created_at: existing.created_at || new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString().slice(0, 10),
    template: existing.template || manifest.theme || "editorial-moody-green",
    publish_at: manifest.publish_at || existing.publish_at || "",
    default_interval_minutes: manifest.default_interval_minutes || existing.default_interval_minutes || 240,
    outputs: {
      ...(existing.outputs || {}),
      carousel_folder: `carousels/${slug}`,
      manifest: `carousels/${slug}/manifest.json`,
      r2_prefix: manifest.r2_prefix || "",
      slide_urls: manifest.slides.map((slide) => slide.image_url || slide.url).filter(Boolean),
      n8n_response: response || null
    },
    notes: "Carousel uploaded to R2 and scheduled through n8n."
  };
  if (index >= 0) queue.items[index] = { ...existing, ...item };
  else queue.items.push(item);
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`);
}

const slug = readArg("--slug");
const envPath = readArg("--env", DEFAULT_ENV_PATH);
const manifestArg = readArg("--manifest");
const startAt = readArg("--start-at");
const intervalArg = readArg("--interval-minutes");
const sshHost = readArg("--host", DEFAULT_SSH_HOST);
const sshUser = readArg("--ssh-user", DEFAULT_SSH_USER);
const sshKey = readArg("--key", DEFAULT_SSH_KEY);
const dryRun = hasFlag("--dry-run");
const noUpload = hasFlag("--no-upload");
const root = process.cwd();

if (!slug) {
  console.error('Usage: node scripts/schedule-instagram-carousel.mjs --slug <slug> --start-at "YYYY-MM-DDTHH:MM:SS+02:00"');
  process.exit(1);
}

validateSlug(slug);

const manifestPath = manifestArg ? path.resolve(manifestArg) : path.join(root, "carousels", slug, "manifest.json");
const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
manifest.slug = manifest.slug || slug;
manifest.publish_at = startAt || manifest.publish_at || "";

let slideUrls = manifest.slides.map((slide) => slide.image_url || slide.url).filter(Boolean);
if (!slideUrls.length && !noUpload) {
  const upload = await uploadSlidesToR2({ slug, manifest, sshKey, sshUser, sshHost });
  await updateManifest({ manifestPath, manifest, upload });
  slideUrls = upload.urls;
}

if (!slideUrls.length && dryRun) {
  slideUrls = manifest.slides.map((slide) => publicUrl(DEFAULT_PUBLIC_BASE_URL, slide.r2Key || `carruseles instagram/${slug}/${slide.fileName}`));
}

if (!slideUrls.length) {
  throw new Error("No public slide URLs found. Run without --no-upload or add image_url values to manifest.json.");
}

const payload = {
  batch_id: `carousel-${slug}-${Date.now()}`,
  start_at: manifest.publish_at,
  default_interval_minutes: Number(intervalArg || manifest.default_interval_minutes || 240),
  carousels: [
    {
      caption: manifest.caption || "",
      slides: slideUrls.map((image_url) => ({ image_url }))
    }
  ]
};

if (dryRun) {
  console.log(JSON.stringify({ event: "dry_run", payload }, null, 2));
  process.exit(0);
}

if (!payload.start_at) {
  throw new Error('Missing publish time. Pass --start-at "YYYY-MM-DDTHH:MM:SS+02:00" or set publish_at in carousel.json.');
}

const env = parseEnv(await fs.readFile(envPath, "utf8"));
const baseUrl = env.N8N_BASE_URL?.replace(/\/$/, "");
if (!baseUrl) throw new Error(`Missing N8N_BASE_URL in ${envPath}`);

const headers = {};
if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
  headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
  headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
}

const response = await postJson(`${baseUrl}/webhook/instagram-carousel-schedule`, headers, payload);
const latestManifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
latestManifest.publish_at = payload.start_at;
latestManifest.default_interval_minutes = payload.default_interval_minutes;
latestManifest.scheduled_at = new Date().toISOString();
await fs.writeFile(manifestPath, `${JSON.stringify(latestManifest, null, 2)}\n`);
await updateQueue({ root, slug, status: "scheduled", response, manifest: latestManifest });

console.log(JSON.stringify({
  event: "carousel_scheduled",
  slug,
  slides: slideUrls.length,
  start_at: payload.start_at,
  response
}, null, 2));
