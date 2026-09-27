import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  normalizeAiVideoIntake,
  validateNormalizedIntake
} from "./ai-video-intake-schema.mjs";

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

async function readQueue(root) {
  const queuePath = path.join(root, "content", "video-queue", "queue.json");
  try {
    const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
    queue.items = Array.isArray(queue.items) ? queue.items : [];
    return { queuePath, queue };
  } catch {
    return {
      queuePath,
      queue: {
        version: 1,
        default_template: "videos/arquitectura-informacion",
        default_duration_s: 50,
        items: []
      }
    };
  }
}

async function csvHasSlug(root, slug) {
  const csvPath = path.join(root, "content", "video-queue", "video-queue.csv");
  try {
    const csv = await fs.readFile(csvPath, "utf8");
    return new RegExp(`(^|\\n)${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")},`).test(csv);
  } catch {
    return false;
  }
}

async function makeUniqueSlug(root, requestedSlug) {
  const { queue } = await readQueue(root);
  const used = new Set(queue.items.map((item) => item.slug).filter(Boolean));
  let candidate = requestedSlug;
  let counter = 2;
  while (
    used.has(candidate) ||
    await exists(path.join(root, "content", "video-queue", "pending", candidate)) ||
    await csvHasSlug(root, candidate)
  ) {
    const suffix = `-${counter}`;
    candidate = `${requestedSlug.slice(0, 80 - suffix.length)}${suffix}`;
    counter += 1;
  }
  return candidate;
}

async function upsertCsv(root, intake) {
  const csvPath = path.join(root, "content", "video-queue", "video-queue.csv");
  const headers = [
    "slug", "status", "priority", "title", "topic", "audience", "goal", "brief", "structure",
    "offer", "cta", "template", "tone", "script_persona", "duration_target_s", "must_include",
    "avoid", "source_urls", "voiceover_status", "render_mode", "render_url", "job_id", "notes",
    "content_folder", "audio_folder", "remote_command", "last_updated"
  ];
  let rows = [];
  try {
    const existing = await fs.readFile(csvPath, "utf8");
    rows = existing.trim() ? existing.trim().split(/\r?\n/).slice(1) : [];
  } catch {
    await ensureDir(path.dirname(csvPath));
  }
  const row = {
    slug: intake.slug,
    status: "pending",
    priority: "media",
    title: intake.title,
    topic: intake.summary,
    audience: "SEO, SEM y marketing",
    goal: "Generar un Reel data-lab desde resumen pegado en n8n.",
    brief: intake.summary,
    structure: intake.scenes.map((scene) => `${scene.screen_text}: ${scene.text}`).join("; "),
    offer: intake.cta,
    cta: intake.cta,
    template: "data-lab",
    tone: intake.tone,
    script_persona: intake.persona,
    duration_target_s: intake.duration_target_s,
    must_include: "",
    avoid: "promesas garantizadas; datos u ofertas inventados; relleno; palabrotas por defecto",
    source_urls: "",
    voiceover_status: "not_started",
    render_mode: "draft",
    render_url: "",
    job_id: "",
    notes: "Created by n8n summary intake.",
    content_folder: `content/video-queue/pending/${intake.slug}`,
    audio_folder: `assets/character/audio/generated/${intake.slug}`,
    remote_command: `node scripts\\trigger-n8n-build-render.mjs --slug ${intake.slug} --mode draft --template data-lab`,
    last_updated: new Date().toISOString().slice(0, 10)
  };
  const withoutSlug = rows.filter((line) => !line.startsWith(`${intake.slug},`));
  withoutSlug.push(headers.map((header) => csvCell(row[header])).join(","));
  await fs.writeFile(csvPath, `${headers.join(",")}\n${withoutSlug.join("\n")}\n`, "utf8");
}

async function upsertQueue(root, intake) {
  const { queuePath, queue } = await readQueue(root);
  await ensureDir(path.dirname(queuePath));
  queue.items = Array.isArray(queue.items) ? queue.items : [];
  const item = {
    slug: intake.slug,
    title: intake.title,
    status: "pending",
    folder: `pending/${intake.slug}`,
    created_at: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString().slice(0, 10),
    template: "data-lab",
    duration_target_s: intake.duration_target_s,
    persona: intake.persona,
    caption: intake.caption,
    cta: intake.cta,
    platforms: intake.platforms,
    outputs: {
      content_folder: `content/video-queue/pending/${intake.slug}`,
      project_folder: `videos/${intake.slug}`,
      audio_folder: `assets/character/audio/generated/${intake.slug}`,
      zip: "",
      render: "",
      preview: ""
    },
    review: {
      status: "not_ready",
      approve_url: "",
      reject_url: ""
    },
    notes: "Created by n8n summary intake."
  };
  const index = queue.items.findIndex((entry) => entry.slug === intake.slug);
  if (index >= 0) queue.items[index] = { ...queue.items[index], ...item };
  else queue.items.unshift(item);
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

function voiceoverManifest(intake) {
  return {
    project: {
      slug: intake.slug,
      language: "es",
      persona: intake.persona,
      target_duration_s: intake.duration_target_s,
      visual_template: "data-lab",
      title: intake.title,
      ghost: ["DATA", "MARKETING"]
    },
    elevenlabs: {
      model_id: "eleven_multilingual_v2",
      output_format: "mp3_44100_128",
      use_timestamps: true,
      pause_after_scene_ms: 180,
      voice_settings: {
        stability: 0.42,
        similarity_boost: 0.78,
        style: 0.28,
        use_speaker_boost: true
      }
    },
    scenes: intake.scenes
  };
}

export async function writeVideoPackage({ root = process.cwd(), intake }) {
  validateNormalizedIntake(intake);
  const finalIntake = {
    ...intake,
    slug: await makeUniqueSlug(root, intake.slug)
  };
  validateNormalizedIntake(finalIntake);
  const contentDir = path.join(root, "content", "video-queue", "pending", finalIntake.slug);
  await ensureDir(contentDir);
  await fs.writeFile(path.join(contentDir, "brief.md"), `# Brief\n\n${finalIntake.summary}\n`, "utf8");
  await fs.writeFile(
    path.join(contentDir, "structure.md"),
    `# Structure\n\n${finalIntake.scenes.map((scene) => `## ${scene.screen_text}\n\n${scene.text}`).join("\n\n")}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(contentDir, "visual-plan.md"),
    `# Visual Plan\n\nTemplate: data-lab\n\n${finalIntake.scenes.map((scene) => `- ${scene.screen_text}: ${scene.stage.type}`).join("\n")}\n`,
    "utf8"
  );
  await fs.writeFile(
    path.join(contentDir, "voiceover.scenes.json"),
    `${JSON.stringify(voiceoverManifest(finalIntake), null, 2)}\n`,
    "utf8"
  );
  await upsertCsv(root, finalIntake);
  await upsertQueue(root, finalIntake);
  return { slug: finalIntake.slug, contentDir };
}

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const inputPath = readArg("--input");
  const root = readArg("--root", process.cwd());
  if (!inputPath) throw new Error("Usage: node scripts/create-video-from-summary.mjs --input ai-output.json [--root <workspace>]");
  const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const intake = normalizeAiVideoIntake(raw);
  const result = await writeVideoPackage({ root, intake });
  console.log(JSON.stringify({ event: "video_package_created", ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
