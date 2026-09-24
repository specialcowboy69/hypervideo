import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeAiVideoIntake } from "./ai-video-intake-schema.mjs";

const DEFAULT_ENV_PATH = process.env.HYPERFRAMES_N8N_ENV
  || (process.platform === "win32" ? "C:/Users/USUARIO/Downloads/mcp-n8n/.env" : ".env.n8n");

export function pipelineCommandsFor({ slug, input, envPath = DEFAULT_ENV_PATH, vpsLocal = false }) {
  const triggerArgs = ["scripts/trigger-n8n-build-render.mjs", "--slug", slug, "--mode", "draft", "--template", "data-lab"];
  if (envPath) triggerArgs.push("--env", envPath);
  if (vpsLocal) triggerArgs.push("--vps-local");
  return [
    { file: "node", args: ["scripts/create-video-from-summary.mjs", "--input", input] },
    {
      file: "node",
      args: [
        "scripts/elevenlabs-generate-scenes.mjs",
        "--input", `content/video-queue/pending/${slug}/voiceover.scenes.json`,
        "--out", `assets/character/audio/generated/${slug}`,
        "--env", ".env local"
      ]
    },
    {
      file: "node",
      args: triggerArgs
    }
  ];
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

async function readBaseUrl(envPath = DEFAULT_ENV_PATH) {
  try {
    const env = parseEnv(await fs.readFile(envPath, "utf8"));
    return (env.N8N_BASE_URL || "https://n8n.urltovideo.es").replace(/\/$/, "");
  } catch {
    return "https://n8n.urltovideo.es";
  }
}

function extractJsonObjects(text) {
  const objects = [];
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") {
      if (depth === 0) start = i;
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0 && start >= 0) {
        const candidate = text.slice(start, i + 1);
        try {
          objects.push(JSON.parse(candidate));
        } catch {
          // Ignore non-JSON braces from child command output.
        }
        start = -1;
      }
    }
  }
  return objects;
}

function run(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args, { shell: false });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });
    child.on("exit", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command.file} exited with ${code}: ${stderr || stdout}`));
    });
  });
}

async function updateQueueForReview({ root, slug, renderUrl, caption, platforms, envPath }) {
  const queuePath = path.join(root, "content", "video-queue", "queue.json");
  const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
  const item = queue.items.find((entry) => entry.slug === slug);
  if (!item) throw new Error(`Queue item not found after render: ${slug}`);
  const baseUrl = await readBaseUrl(envPath);
  const approveUrl = `${baseUrl}/webhook/hyperframes-video-review-approve?slug=${encodeURIComponent(slug)}`;
  const rejectUrl = `${baseUrl}/webhook/hyperframes-video-review-reject?slug=${encodeURIComponent(slug)}`;

  item.status = "needs_review";
  item.updated_at = new Date().toISOString().slice(0, 10);
  item.caption = caption || item.caption || "";
  item.platforms = platforms || item.platforms || ["instagram"];
  item.outputs = {
    ...(item.outputs || {}),
    render: renderUrl || item.outputs?.render || ""
  };
  item.review = {
    ...(item.review || {}),
    status: "needs_review",
    approve_url: approveUrl,
    reject_url: rejectUrl,
    ready_at: new Date().toISOString()
  };
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
  return { approveUrl, rejectUrl, renderUrl: item.outputs.render };
}

async function main() {
  const arg = (name, fallback = "") => {
    const index = process.argv.indexOf(name);
    return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
  };
  const input = arg("--input");
  const envPath = arg("--env", DEFAULT_ENV_PATH);
  const vpsLocal = process.argv.includes("--vps-local") || process.env.HYPERFRAMES_VPS_LOCAL === "1";
  const root = process.cwd();
  if (!input) throw new Error("Usage: node scripts/run-data-lab-video-pipeline.mjs --input ai-output.json");

  const raw = JSON.parse(await fs.readFile(input, "utf8"));
  const intake = normalizeAiVideoIntake(raw);
  const commands = pipelineCommandsFor({ slug: intake.slug, input, envPath, vpsLocal });
  let renderOutput = "";

  for (const command of commands) {
    const result = await run(command);
    if (command.args.some((entry) => String(entry).includes("trigger-n8n-build-render"))) {
      renderOutput = result.stdout;
    }
  }

  const jsonObjects = extractJsonObjects(renderOutput);
  const completed = [...jsonObjects].reverse().find((entry) => entry.downloadUrl || entry.status === "completed") || {};
  const review = await updateQueueForReview({
    root,
    slug: intake.slug,
    renderUrl: completed.downloadUrl || "",
    caption: intake.caption,
    platforms: intake.platforms,
    envPath
  });

  console.log(JSON.stringify({
    event: "data_lab_review_ready",
    slug: intake.slug,
    video_url: review.renderUrl,
    caption: intake.caption,
    platforms: intake.platforms,
    approve_url: review.approveUrl,
    reject_url: review.rejectUrl
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
