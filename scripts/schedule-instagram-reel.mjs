import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULT_ENV_PATH = process.env.HYPERFRAMES_N8N_ENV
  || (process.platform === "win32" ? "C:/Users/USUARIO/Downloads/mcp-n8n/.env" : ".env.n8n");
const DEFAULT_WEBHOOK_PATH = "/webhook/instagram-reel-schedule";

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function readAnyArg(names, fallback = "") {
  for (const name of names) {
    const value = readArg(name);
    if (value) return value;
  }
  return fallback;
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

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertHttpsUrl(value, label = "video_url") {
  const url = String(value || "").trim();
  if (!/^https:\/\/[^\s"'<>]+$/i.test(url)) {
    throw new Error(`${label} must be a public HTTPS URL.`);
  }
  return url;
}

export function normalizePlatforms(raw = "") {
  const input = Array.isArray(raw) ? raw : String(raw || "").split(/[,\s]+/);
  const mapped = [];
  for (const item of input.flatMap((entry) => Array.isArray(entry) ? entry : String(entry || "").split(/[,\s]+/))) {
    const value = String(item || "").trim().toLowerCase();
    if (!value) continue;
    if (["ig", "instagram", "instagram_reel", "instagram-reel", "reels"].includes(value)) {
      mapped.push("instagram");
    } else if (["fb", "facebook", "facebook_reel", "facebook-reel", "page", "facebook_page"].includes(value)) {
      mapped.push("facebook");
    } else {
      throw new Error(`Unknown platform: ${value}. Use instagram and/or facebook.`);
    }
  }
  return [...new Set(mapped.length ? mapped : ["instagram"])];
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];
    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function stringifyCsv(rows) {
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`;
}

async function readQueue(root) {
  const queuePath = path.join(root, "content", "video-queue", "queue.json");
  if (!(await exists(queuePath))) return { queuePath, queue: { items: [] } };
  return { queuePath, queue: JSON.parse(await fs.readFile(queuePath, "utf8")) };
}

async function resolveFromCsv(root, slug) {
  const csvPath = path.join(root, "content", "video-queue", "video-queue.csv");
  if (!(await exists(csvPath))) return "";
  const rows = parseCsv(await fs.readFile(csvPath, "utf8"));
  if (rows.length < 2) return "";
  const headers = rows[0];
  const slugIndex = headers.indexOf("slug");
  const renderIndex = headers.indexOf("render_url");
  if (slugIndex < 0 || renderIndex < 0) return "";
  const row = rows.slice(1).find((entry) => entry[slugIndex] === slug);
  return row?.[renderIndex] || "";
}

export async function resolveVideoUrl({ root = process.cwd(), slug, videoUrl = "" }) {
  if (videoUrl) return assertHttpsUrl(videoUrl);
  validateSlug(slug);

  const { queue } = await readQueue(root);
  const item = Array.isArray(queue.items) ? queue.items.find((entry) => entry.slug === slug) : null;
  const fromQueue = item?.outputs?.render || item?.render_url || item?.renderUrl || "";
  if (fromQueue) return assertHttpsUrl(fromQueue);

  const fromCsv = await resolveFromCsv(root, slug);
  if (fromCsv) return assertHttpsUrl(fromCsv);

  throw new Error(`No render URL found for ${slug}. Pass --video-url or render the video first.`);
}

async function readTitleFromQueue(root, slug) {
  const { queue } = await readQueue(root);
  const item = Array.isArray(queue.items) ? queue.items.find((entry) => entry.slug === slug) : null;
  return item?.title || slug;
}

async function readCaption({ root, caption, captionFile, allowEmptyCaption }) {
  if (captionFile) {
    const filePath = path.isAbsolute(captionFile) ? captionFile : path.join(root, captionFile);
    return (await fs.readFile(filePath, "utf8")).trim();
  }
  const text = String(caption || "").trim();
  if (!text && !allowEmptyCaption) {
    throw new Error("Missing caption. Pass --caption, --caption-file, or --allow-empty-caption.");
  }
  return text;
}

export function buildPayload({
  slug,
  videoUrl,
  caption,
  publishAt,
  platforms,
  jobId,
  title = "",
  source = "hyperframes",
  shareToFeed = true
}) {
  validateSlug(slug);
  const normalizedPlatforms = normalizePlatforms(platforms);
  const cleanCaption = String(caption || "").trim();
  const cleanPublishAt = String(publishAt || "").trim();
  if (!cleanPublishAt) {
    throw new Error('Missing publish time. Pass --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" or use --now.');
  }
  const payload = {
    jobId: jobId || `reel-${slug}-${Date.now()}`,
    slug,
    video_url: assertHttpsUrl(videoUrl),
    caption: cleanCaption,
    publish_at: cleanPublishAt,
    platforms: normalizedPlatforms,
    source
  };
  if (shareToFeed === false) payload.share_to_feed = false;
  if (normalizedPlatforms.includes("facebook")) {
    payload.facebook_title = String(title || slug).slice(0, 255);
    payload.facebook_description = cleanCaption.slice(0, 5000);
  }
  return payload;
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

async function updateCsvAfterSchedule({ root, slug, payload, response }) {
  const csvPath = path.join(root, "content", "video-queue", "video-queue.csv");
  if (!(await exists(csvPath))) return;
  const rows = parseCsv(await fs.readFile(csvPath, "utf8"));
  if (!rows.length) return;
  const headers = rows[0];
  for (const header of ["status", "reel_job_id", "reel_publish_at", "reel_platforms", "reel_status", "notes"]) {
    if (!headers.includes(header)) headers.push(header);
  }
  const indexes = Object.fromEntries(headers.map((header, index) => [header, index]));
  let row = rows.slice(1).find((entry) => entry[indexes.slug] === slug);
  if (!row) {
    row = [];
    row[indexes.slug] = slug;
    rows.push(row);
  }
  while (row.length < headers.length) row.push("");
  row[indexes.status] = "scheduled";
  row[indexes.reel_job_id] = payload.jobId;
  row[indexes.reel_publish_at] = payload.publish_at;
  row[indexes.reel_platforms] = payload.platforms.join(",");
  row[indexes.reel_status] = response?.jobs?.[0]?.status || response?.status || "queued";
  const note = `Reel scheduled through n8n for ${payload.publish_at} (${payload.platforms.join(", ")}).`;
  row[indexes.notes] = row[indexes.notes] ? `${row[indexes.notes]} ${note}` : note;
  rows[0] = headers;
  await fs.writeFile(csvPath, stringifyCsv(rows), "utf8");
}

export async function updateVideoQueueAfterSchedule({ root = process.cwd(), slug, payload, response }) {
  const { queuePath, queue } = await readQueue(root);
  queue.items = Array.isArray(queue.items) ? queue.items : [];
  const index = queue.items.findIndex((entry) => entry.slug === slug);
  const existing = index >= 0 ? queue.items[index] : {};
  const item = {
    ...existing,
    slug,
    title: existing.title || payload.facebook_title || slug,
    status: "scheduled",
    updated_at: new Date().toISOString().slice(0, 10),
    outputs: {
      ...(existing.outputs || {}),
      render: existing.outputs?.render || payload.video_url,
      reel_publish: {
        jobId: payload.jobId,
        publish_at: payload.publish_at,
        platforms: payload.platforms,
        video_url: payload.video_url,
        response: response || null,
        scheduled_at: new Date().toISOString()
      }
    },
    notes: existing.notes
      ? `${existing.notes} Reel scheduled through n8n for ${payload.publish_at} (${payload.platforms.join(", ")}).`
      : `Reel scheduled through n8n for ${payload.publish_at} (${payload.platforms.join(", ")}).`
  };
  if (index >= 0) queue.items[index] = item;
  else queue.items.push(item);
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  await updateCsvAfterSchedule({ root, slug, payload, response });
}

async function main() {
  const root = process.cwd();
  const slug = readArg("--slug");
  const explicitVideoUrl = readAnyArg(["--video-url", "--render-url", "--url"]);
  const envPath = readArg("--env", DEFAULT_ENV_PATH);
  const captionArg = readArg("--caption");
  const captionFile = readArg("--caption-file");
  const publishAt = readAnyArg(["--publish-at", "--start-at"], hasFlag("--now") ? new Date().toISOString() : "");
  const jobId = readArg("--job-id");
  const titleArg = readArg("--title");
  const dryRun = hasFlag("--dry-run");
  const noUpdate = hasFlag("--no-update");
  const allowEmptyCaption = hasFlag("--allow-empty-caption");
  const shareToFeed = !hasFlag("--no-share-to-feed");

  const platformInputs = [];
  const platformsArg = readAnyArg(["--platforms", "--platform", "--publish-to"]);
  if (platformsArg) platformInputs.push(platformsArg);
  if (hasFlag("--instagram")) platformInputs.push("instagram");
  if (hasFlag("--facebook")) platformInputs.push("facebook");
  const platforms = normalizePlatforms(platformInputs.length ? platformInputs : "instagram");

  if (!slug) {
    console.error('Usage: node scripts/schedule-instagram-reel.mjs --slug <slug> --caption "..." --publish-at "YYYY-MM-DDTHH:MM:SS+02:00" [--platforms instagram,facebook]');
    process.exit(1);
  }

  validateSlug(slug);
  const videoUrl = await resolveVideoUrl({ root, slug, videoUrl: explicitVideoUrl });
  const caption = await readCaption({ root, caption: captionArg, captionFile, allowEmptyCaption });
  const title = titleArg || await readTitleFromQueue(root, slug);
  const payload = buildPayload({
    slug,
    videoUrl,
    caption,
    publishAt,
    platforms,
    jobId,
    title,
    shareToFeed
  });

  if (dryRun) {
    console.log(JSON.stringify({ event: "dry_run", payload }, null, 2));
    return;
  }

  let envFromFile = {};
  try {
    envFromFile = parseEnv(await fs.readFile(envPath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const env = { ...envFromFile, ...process.env };
  const baseUrl = env.N8N_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error(`Missing N8N_BASE_URL in ${envPath}`);
  const headers = {};
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }

  const response = await postJson(`${baseUrl}${DEFAULT_WEBHOOK_PATH}`, headers, payload);
  if (!noUpdate) {
    await updateVideoQueueAfterSchedule({ root, slug, payload, response });
  }

  console.log(JSON.stringify({
    event: "reel_scheduled",
    slug,
    jobId: payload.jobId,
    publish_at: payload.publish_at,
    platforms: payload.platforms,
    response
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
