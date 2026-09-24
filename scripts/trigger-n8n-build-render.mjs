import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { pathToFileURL } from "node:url";

const DEFAULT_ENV_PATH = process.env.HYPERFRAMES_N8N_ENV
  || (process.platform === "win32" ? "C:/Users/USUARIO/Downloads/mcp-n8n/.env" : ".env.n8n");
const DEFAULT_SSH_HOST = "72.61.161.99";
const DEFAULT_SSH_USER = "codex_tmp";
const DEFAULT_SSH_KEY = path.join(os.homedir(), ".ssh", "codex_hyperframes_tmp_rsa");
const REMOTE_UPLOAD_DIR = "/opt/n8n/hyperframes_uploads";

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

export function tarExecutable(platform = process.platform) {
  return platform === "win32" ? "tar.exe" : "tar";
}

export function archiveCommandForPlatform(platform, zipPath, root, entries) {
  if (platform === "win32") {
    return { file: tarExecutable(platform), args: ["-a", "-cf", zipPath, "-C", root, ...entries] };
  }
  return { file: "zip", args: ["-qr", zipPath, ...entries], options: { cwd: root } };
}

export function uploadModeFromArgs(argv = process.argv.slice(2), env = process.env) {
  return argv.includes("--vps-local") || env.HYPERFRAMES_VPS_LOCAL === "1" ? "local" : "ssh";
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

async function assertExists(root, relativePath) {
  const fullPath = path.join(root, ...relativePath.split("/"));
  try {
    await fs.access(fullPath);
  } catch {
    throw new Error(`Missing required file: ${relativePath}`);
  }
}

function validateSlug(slug) {
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(slug) || slug.includes("..")) {
    throw new Error("Invalid slug. Use only letters, numbers, dot, dash and underscore.");
  }
}

function requiresCharacterAssets(template) {
  const raw = String(template || "").trim().toLowerCase();
  return !["data-lab", "datalab", "data_lab", "lab", "marketing-lab"].includes(raw);
}

function sourceEntriesFor({ slug, template }) {
  const entries = [
    "scripts/build-social-narrator-video.mjs",
    `content/video-queue/pending/${slug}`,
    `assets/character/audio/generated/${slug}`
  ];
  if (requiresCharacterAssets(template)) {
    entries.splice(2, 0,
      "assets/character/Breathing-Idle.glb",
      "assets/character/Talking.glb",
      "assets/character/Happy-Hand-Gesture.glb",
      "assets/character/Yelling.glb"
    );
  }
  return entries;
}

async function createSourceZip({ root, slug, zipPath, template }) {
  const entries = sourceEntriesFor({ slug, template });
  await fs.rm(zipPath, { force: true });
  const command = archiveCommandForPlatform(process.platform, zipPath, root, entries);
  await run(command.file, command.args, command.options || {});
}

async function uploadSourceZip({ zipPath, sourceZipName, sshKey, sshUser, sshHost, mode }) {
  if (mode === "local") {
    await fs.mkdir(REMOTE_UPLOAD_DIR, { recursive: true });
    await fs.copyFile(zipPath, path.join(REMOTE_UPLOAD_DIR, sourceZipName));
    return;
  }

  const target = `${sshUser}@${sshHost}:/tmp/${sourceZipName}`;
  await run("scp", ["-i", sshKey, zipPath, target]);
  await run("ssh", [
    "-i",
    sshKey,
    `${sshUser}@${sshHost}`,
    `sudo install -m 644 /tmp/${sourceZipName} ${REMOTE_UPLOAD_DIR}/${sourceZipName} && rm -f /tmp/${sourceZipName}`
  ]);
}

async function main() {
  const slug = readArg("--slug");
  const mode = readArg("--mode", "draft");
  const template = readArg("--template", "");
  const envPath = readArg("--env", DEFAULT_ENV_PATH);
  const pollMs = Number(readArg("--poll-ms", "15000"));
  const timeoutMs = Number(readArg("--timeout-ms", String(60 * 60 * 1000)));
  const sshHost = readArg("--host", DEFAULT_SSH_HOST);
  const sshUser = readArg("--ssh-user", DEFAULT_SSH_USER);
  const sshKey = readArg("--key", DEFAULT_SSH_KEY);
  const keepZip = hasFlag("--keep-zip");
  const uploadMode = uploadModeFromArgs();
  const root = process.cwd();

  if (!slug) {
    console.error("Usage: node scripts/trigger-n8n-build-render.mjs --slug <slug> [--mode draft|standard|final] [--template dark-tech|light-workshop|data-lab]");
    process.exit(1);
  }

  validateSlug(slug);
  if (!["draft", "standard", "final"].includes(mode)) {
    throw new Error("Invalid mode. Use draft, standard or final.");
  }

  const required = [
    "scripts/build-social-narrator-video.mjs",
    `content/video-queue/pending/${slug}/voiceover.scenes.json`,
    `assets/character/audio/generated/${slug}/voiceover-master.mp3`,
    `assets/character/audio/generated/${slug}/voiceover-timing.json`
  ];
  if (requiresCharacterAssets(template)) {
    required.push(
      "assets/character/Breathing-Idle.glb",
      "assets/character/Talking.glb",
      "assets/character/Happy-Hand-Gesture.glb",
      "assets/character/Yelling.glb"
    );
  }

  for (const file of required) {
    await assertExists(root, file);
  }

  const env = parseEnv(await fs.readFile(envPath, "utf8"));
  const baseUrl = env.N8N_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error(`Missing N8N_BASE_URL in ${envPath}`);

  const headers = {};
  if (env.CF_ACCESS_CLIENT_ID && env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = env.CF_ACCESS_CLIENT_SECRET;
  }

  const jobId = `hfb-${slug}-${Date.now()}`;
  const sourceZipName = `${jobId}-source.zip`;
  const zipPath = path.join(os.tmpdir(), sourceZipName);
  const buildRenderUrl = `${baseUrl}/webhook/hyperframes-build-render`;
  const statusUrl = `${baseUrl}/webhook/hyperframes-render-status`;

  let finished = false;
  let exitCode = 0;

  try {
    console.log(JSON.stringify({ event: "bundle", slug, sourceZipName }, null, 2));
    await createSourceZip({ root, slug, zipPath, template });

    const stat = await fs.stat(zipPath);
    console.log(JSON.stringify({ event: "upload", sourceZipName, bytes: stat.size, mode: uploadMode, sshHost, sshUser }, null, 2));
    await uploadSourceZip({ zipPath, sourceZipName, sshKey, sshUser, sshHost, mode: uploadMode });

    const payload = { slug, sourceZipName, mode, jobId };
    if (template) payload.template = template;

    const accepted = await postJson(buildRenderUrl, headers, payload);
    console.log(JSON.stringify({ event: "accepted", ...accepted }, null, 2));

    const startedAt = Date.now();
    let lastProgress = -1;
    let lastStep = "";
    let lastStatus = "";

    while (Date.now() - startedAt < timeoutMs) {
      await sleep(pollMs);
      const status = await postJson(statusUrl, headers, { jobId });
      const progress = Number(status.progress ?? 0);
      const step = String(status.step || status.stage || "");
      const currentStatus = String(status.status || "");
      if (progress !== lastProgress || step !== lastStep || currentStatus !== lastStatus || ["completed", "failed"].includes(currentStatus)) {
        console.log(JSON.stringify({
          event: "status",
          jobId,
          status: currentStatus,
          step,
          progress,
          message: status.message,
          lastLog: status.lastLog,
          snapshotsDir: status.snapshotsDir,
          downloadUrl: status.downloadUrl
        }, null, 2));
        lastProgress = progress;
        lastStep = step;
        lastStatus = currentStatus;
      }

      if (currentStatus === "completed") {
        console.log(JSON.stringify({ event: "completed", ...status }, null, 2));
        finished = true;
        exitCode = 0;
        break;
      }

      if (currentStatus === "failed") {
        console.error(JSON.stringify({ event: "failed", ...status }, null, 2));
        finished = true;
        exitCode = 2;
        break;
      }
    }

    if (!finished) {
      console.error(JSON.stringify({ event: "timeout", jobId, timeoutMs }, null, 2));
      exitCode = 3;
    }
  } finally {
    if (!keepZip) {
      await fs.rm(zipPath, { force: true });
    }
  }

  process.exit(exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
