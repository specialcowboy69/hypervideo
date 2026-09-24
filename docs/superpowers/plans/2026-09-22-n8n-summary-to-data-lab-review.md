# N8N Summary To Data Lab Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a V1 n8n workflow where the user pastes only a free-form summary, AI turns it into a valid `data-lab` video package, the VPS generates a review MP4, and simple approval/rejection webhooks control publication.

**Architecture:** n8n orchestrates; versioned scripts in `C:\Users\USUARIO\Downloads\hyperframes` own validation, file generation, voiceover, remote render, and queue updates. The user provides only one field: `summary`; the AI derives title, slug, scenes, CTA, caption, platforms, and visual stages, with validation before any expensive or publishing step. Publishing remains approval-gated through separate webhook URLs.

**Tech Stack:** n8n manual workflow and webhooks, AI node or HTTP AI call, Node.js `.mjs` scripts, HyperFrames, ElevenLabs, VPS renderer, Cloudflare R2, existing Reels workflow `x8etUYlUWqCCONxW`.

**Spec:** User request in chat: “yo solo quiero pegar el resumen del resto se encarga la ia y vamos con la opcion simple de los webhooks para publicar el video”.

## Global Constraints

- User input in n8n must be only `summary`; no required CTA, offer, template, platform, or caption fields. :codex-annotation{index="1"}
- Default template is `data-lab`.
- Default persona is `assets/character/personas/social-retention-teacher.md`.
- Default status after render is `needs_review`, not published.
- Publishing must happen only through explicit approve webhook.
- Rejection webhook must not delete media; it should mark state and preserve artifacts.
- Do not print or store tokens in repo docs, logs, or generated files.
- Do not publish content of example/test runs.
- Use absolute publish dates in payloads; avoid relative dates inside files or n8n payloads.
- Do not merge carousel publication into the Reels workflow.

## Review Focus

- AI returns malformed JSON: validation must fail before files, audio, render, or publish.
- AI invents unsafe claims or missing CTA: normalizer must produce conservative default CTA/caption and avoid guaranteed SEO promises.
- Duplicate slug: script must create a unique slug or fail cleanly before overwriting existing pending work.
- Render succeeds but approval URL is clicked twice: approve webhook must be idempotent and avoid duplicate Reels jobs.
- Facebook publication fails with `403`: approval flow must report partial publication state without retrying blindly or hiding Instagram success.

---

## File Structure

- Create `scripts/ai-video-intake-schema.mjs`: owns the canonical JSON schema, default values, validation, slug creation, and transformation from AI output to queue row and `voiceover.scenes.json`.
- Create `scripts/create-video-from-summary.mjs`: CLI used by n8n after the AI node. It validates AI JSON, writes `content/video-queue/video-queue.csv`, `video-queue.xlsx`, `queue.json`, and `pending/<slug>/` files.
- Create `scripts/run-data-lab-video-pipeline.mjs`: single VPS-side or local orchestrator for `create-video-from-summary`, ElevenLabs scene audio, `trigger-n8n-build-render.mjs`, and review metadata.
- Create `scripts/review-video-job.mjs`: approve/reject handler used by n8n webhooks; approve calls `schedule-instagram-reel.mjs`, reject marks `blocked` or `needs_revision`.
- Create `scripts/test-ai-video-intake.mjs`: tests schema/defaults/slug/manifest generation.
- Create `scripts/test-review-video-job.mjs`: tests approve/reject idempotency and queue updates.
- Create `n8n/hyperframes-summary-intake-workflow.json`: exported workflow after implementation, sanitized if it contains any sensitive config.
- Modify `content/SOCIAL-PUBLISHING.md`: document review webhook URLs and approval flow.
- Modify `content/video-queue/README.md`: document automated summary intake flow.
- Modify `AGENTS.md`: add operating rules for V1 summary-to-review workflow.

## Task 1: Canonical AI Intake Schema

**Files:**
- Create: `scripts/ai-video-intake-schema.mjs`
- Test: `scripts/test-ai-video-intake.mjs`

**Interfaces:**
- Consumes: raw AI JSON object.
- Produces:
  - `normalizeAiVideoIntake(raw: object): NormalizedVideoIntake`
  - `validateNormalizedIntake(intake: NormalizedVideoIntake): void`
  - `slugifyTitle(title: string): string`

- [ ] **Step 1: Write failing test for “summary-only defaults”**

```js
import assert from "node:assert/strict";
import {
  normalizeAiVideoIntake,
  validateNormalizedIntake
} from "./ai-video-intake-schema.mjs";

const input = {
  title: "Lanzamiento SEO 0 a 100",
  summary: "Construir en staging, publicar completo y escalar enlaces de forma proporcional.",
  scenes: [
    {
      id: "scene-01-hook",
      screen_text: "NO LANCES A MEDIAS",
      text: "Si publicas a trozos, Google ve migas sueltas.",
      stage: {
        type: "comparison",
        left: { label: "A TROZOS", value: "Ruido" },
        right: { label: "COMPLETO", value: "Sistema" }
      }
    }
  ]
};

const normalized = normalizeAiVideoIntake(input);
validateNormalizedIntake(normalized);

assert.equal(normalized.template, "data-lab");
assert.equal(normalized.persona, "assets/character/personas/social-retention-teacher.md");
assert.equal(normalized.duration_target_s, 50);
assert.deepEqual(normalized.platforms, ["instagram"]);
assert.equal(normalized.status, "pending");
assert.match(normalized.slug, /^lanzamiento-seo-0-a-100/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts\test-ai-video-intake.mjs`

Expected: FAIL with module/function missing.

- [ ] **Step 3: Implement minimal schema normalizer**

```js
export const DEFAULT_PERSONA = "assets/character/personas/social-retention-teacher.md";
export const DEFAULT_TEMPLATE = "data-lab";
export const DEFAULT_DURATION = 50;

const ALLOWED_STAGE_TYPES = new Set([
  "serp",
  "dashboard",
  "keyword-map",
  "funnel",
  "comparison",
  "checklist",
  "timeline",
  "cta"
]);

export function slugifyTitle(title) {
  const base = String(title || "video-data-lab")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
  return base || "video-data-lab";
}

export function normalizePlatforms(value) {
  const raw = Array.isArray(value) ? value : String(value || "instagram").split(/[,\s]+/);
  const mapped = raw.map((entry) => String(entry).toLowerCase().trim()).filter(Boolean).map((entry) => {
    if (["ig", "instagram", "instagram-reel"].includes(entry)) return "instagram";
    if (["fb", "facebook", "facebook-reel"].includes(entry)) return "facebook";
    throw new Error(`Unknown platform: ${entry}`);
  });
  return [...new Set(mapped.length ? mapped : ["instagram"])];
}

export function normalizeAiVideoIntake(raw) {
  const title = String(raw.title || raw.headline || "Video Data Lab").trim();
  const slug = slugifyTitle(raw.slug || title);
  const scenes = Array.isArray(raw.scenes) ? raw.scenes : [];
  return {
    slug,
    status: "pending",
    title,
    summary: String(raw.summary || raw.brief || "").trim(),
    template: DEFAULT_TEMPLATE,
    persona: DEFAULT_PERSONA,
    tone: "claro, directo, retencion, sin bromas",
    duration_target_s: Number(raw.duration_target_s || DEFAULT_DURATION),
    cta: String(raw.cta || "Comenta INFO").trim(),
    caption: String(raw.caption || raw.post_caption || "").trim(),
    platforms: normalizePlatforms(raw.platforms),
    scenes: scenes.map((scene, index) => ({
      id: String(scene.id || `scene-${String(index + 1).padStart(2, "0")}`).trim(),
      label: String(scene.label || `SCENE ${index + 1}`).trim(),
      animation: "talking",
      screen_text: String(scene.screen_text || scene.title || "").trim(),
      visual_note: String(scene.visual_note || "").trim(),
      text: String(scene.text || "").trim(),
      stage: scene.stage || { type: "checklist", items: ["Idea", "Prueba", "Accion"], checked: 2 }
    }))
  };
}

export function validateNormalizedIntake(intake) {
  if (!intake.summary) throw new Error("summary is required.");
  if (!intake.title) throw new Error("title is required.");
  if (!/^[a-z0-9._-]{1,80}$/.test(intake.slug)) throw new Error("invalid slug.");
  if (intake.template !== DEFAULT_TEMPLATE) throw new Error("V1 only supports data-lab.");
  if (intake.persona !== DEFAULT_PERSONA) throw new Error("data-lab persona mismatch.");
  if (!Array.isArray(intake.scenes) || intake.scenes.length < 4 || intake.scenes.length > 7) throw new Error("scenes must contain 4-7 items.");
  for (const scene of intake.scenes) {
    if (!scene.screen_text) throw new Error(`scene ${scene.id} missing screen_text.`);
    if (!scene.text) throw new Error(`scene ${scene.id} missing text.`);
    if (!scene.stage?.type || !ALLOWED_STAGE_TYPES.has(scene.stage.type)) throw new Error(`scene ${scene.id} has invalid stage type.`);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts\test-ai-video-intake.mjs`

Expected: PASS.

- [ ] **Step 5: Add validation tests for malformed AI JSON**

Add to `scripts/test-ai-video-intake.mjs`:

```js
assert.throws(
  () => validateNormalizedIntake(normalizeAiVideoIntake({ title: "Sin resumen", scenes: [] })),
  /summary is required/
);

assert.throws(
  () => validateNormalizedIntake(normalizeAiVideoIntake({
    title: "Malo",
    summary: "ok",
    scenes: [{ screen_text: "X", text: "Y", stage: { type: "pie-chart" } }]
  })),
  /scenes must contain 4-7 items|invalid stage type/
);
```

- [ ] **Step 6: Run validation tests**

Run: `node scripts\test-ai-video-intake.mjs`

Expected: PASS.

## Task 2: Create Pending Package From AI Output

**Files:**
- Create: `scripts/create-video-from-summary.mjs`
- Modify: `scripts/test-ai-video-intake.mjs`

**Interfaces:**
- Consumes: normalized intake from Task 1.
- Produces:
  - `writeVideoPackage({ root, intake }): Promise<{ slug, contentDir }>`
  - Files in `content/video-queue/pending/<slug>/`
  - Updates to `content/video-queue/queue.json` and `video-queue.csv`

- [ ] **Step 1: Write failing test for file generation**

Add to `scripts/test-ai-video-intake.mjs`:

```js
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { writeVideoPackage } from "./create-video-from-summary.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "hf-ai-intake-"));
try {
  const intake = normalizeAiVideoIntake({
    title: "Prueba Data Lab",
    summary: "Resumen de prueba",
    caption: "Caption de prueba",
    scenes: [
      { screen_text: "HOOK", text: "Texto uno", stage: { type: "comparison", left: { label: "A", value: "B" }, right: { label: "C", value: "D" } } },
      { screen_text: "SISTEMA", text: "Texto dos", stage: { type: "timeline", points: ["A", "B", "C", "D"], values: ["1", "2", "3", "4"] } },
      { screen_text: "DATO", text: "Texto tres", stage: { type: "dashboard", metrics: [{ label: "CTR", value: "6%" }] } },
      { screen_text: "ACCION", text: "Texto cuatro", stage: { type: "cta", word: "INFO", box: "Comenta INFO" } }
    ]
  });
  const result = await writeVideoPackage({ root, intake });
  const voiceover = JSON.parse(await readFile(path.join(result.contentDir, "voiceover.scenes.json"), "utf8"));
  const queue = JSON.parse(await readFile(path.join(root, "content", "video-queue", "queue.json"), "utf8"));
  const csv = await readFile(path.join(root, "content", "video-queue", "video-queue.csv"), "utf8");

  assert.equal(voiceover.project.visual_template, "data-lab");
  assert.equal(voiceover.project.persona, DEFAULT_PERSONA);
  assert.equal(queue.items[0].status, "pending");
  assert.match(csv, /prueba-data-lab/);
} finally {
  await rm(root, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts\test-ai-video-intake.mjs`

Expected: FAIL with `create-video-from-summary.mjs` missing.

- [ ] **Step 3: Implement writer and CLI**

Create `scripts/create-video-from-summary.mjs`:

```js
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

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
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
    avoid: "promesas garantizadas; bromas; palabrotas",
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
  const queuePath = path.join(root, "content", "video-queue", "queue.json");
  let queue = { version: 1, default_template: "videos/arquitectura-informacion", default_duration_s: 50, items: [] };
  try {
    queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
  } catch {
    await ensureDir(path.dirname(queuePath));
  }
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
  const contentDir = path.join(root, "content", "video-queue", "pending", intake.slug);
  await ensureDir(contentDir);
  await fs.writeFile(path.join(contentDir, "brief.md"), `# Brief\n\n${intake.summary}\n`, "utf8");
  await fs.writeFile(path.join(contentDir, "structure.md"), `# Structure\n\n${intake.scenes.map((scene) => `## ${scene.screen_text}\n\n${scene.text}`).join("\n\n")}\n`, "utf8");
  await fs.writeFile(path.join(contentDir, "visual-plan.md"), `# Visual Plan\n\nTemplate: data-lab\n\n${intake.scenes.map((scene) => `- ${scene.screen_text}: ${scene.stage.type}`).join("\n")}\n`, "utf8");
  await fs.writeFile(path.join(contentDir, "voiceover.scenes.json"), `${JSON.stringify(voiceoverManifest(intake), null, 2)}\n`, "utf8");
  await upsertCsv(root, intake);
  await upsertQueue(root, intake);
  return { slug: intake.slug, contentDir };
}

async function main() {
  const inputPath = process.argv[process.argv.indexOf("--input") + 1];
  if (!inputPath || inputPath === process.argv[0]) throw new Error("Usage: node scripts/create-video-from-summary.mjs --input ai-output.json");
  const raw = JSON.parse(await fs.readFile(inputPath, "utf8"));
  const intake = normalizeAiVideoIntake(raw);
  const result = await writeVideoPackage({ intake });
  console.log(JSON.stringify({ event: "video_package_created", ...result }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts\test-ai-video-intake.mjs`

Expected: PASS.

## Task 3: AI Prompt Contract For n8n

**Files:**
- Create: `content/video-queue/ai-intake-prompt.md`
- Modify: `content/video-queue/README.md`

**Interfaces:**
- Consumes: user pasted `summary`.
- Produces: strict JSON consumed by Task 1.

- [ ] **Step 1: Write the prompt file**

Create `content/video-queue/ai-intake-prompt.md`:

```markdown
# Data Lab AI Intake Prompt

You receive one Spanish summary from the user. Convert it into one JSON object for a vertical 40-60 second `data-lab` video.

Rules:
- Return JSON only.
- Do not wrap the JSON in markdown.
- Use Spanish.
- Use a clear retention-teacher voice.
- No jokes, no profanity, no wordplay.
- Do not include NotebookLM citation numbers.
- Do not guarantee SEO results.
- The user only gives `summary`; infer the rest conservatively.
- Default platforms must be `["instagram"]` unless the summary clearly asks for Facebook too.
- Use 5 scenes by default.
- Use only these stage types: `serp`, `dashboard`, `keyword-map`, `funnel`, `comparison`, `checklist`, `timeline`, `cta`.

Required JSON shape:
{
  "title": "short title",
  "summary": "clean summary",
  "cta": "Comenta PALABRA",
  "caption": "post caption under 2200 chars",
  "platforms": ["instagram"],
  "scenes": [
    {
      "id": "scene-01-hook",
      "label": "HOOK",
      "screen_text": "MAX 4 WORDS",
      "visual_note": "brief visual direction",
      "text": "voiceover sentence",
      "stage": {
        "type": "comparison",
        "left": { "label": "ANTES", "value": "problem" },
        "right": { "label": "DESPUES", "value": "better state" }
      }
    }
  ]
}
```

- [ ] **Step 2: Document n8n AI node configuration**

Add to `content/video-queue/README.md`:

```markdown
## AI Summary Intake

For n8n V1 summary intake, the user only fills a `summary` field. The AI node must use `content/video-queue/ai-intake-prompt.md` and return strict JSON. The JSON is validated by `scripts/ai-video-intake-schema.mjs` before voiceover, render, or publication.
```

- [ ] **Step 3: Review prompt against constraints**

Run: manually compare the prompt rules against Global Constraints.

Expected: The prompt asks for JSON only, defaults to `data-lab`, avoids jokes/profanity, and does not require CTA/platforms from the user.

## Task 4: Pipeline Runner For Summary-To-Review

**Files:**
- Create: `scripts/run-data-lab-video-pipeline.mjs`
- Test: Extend `scripts/test-ai-video-intake.mjs` with command composition tests.

**Interfaces:**
- Consumes: validated AI JSON file path.
- Produces:
  - generated pending package,
  - scene audio,
  - remote render job,
  - `queue.json` item with `needs_review`, `render_url`, and review webhook metadata.

- [ ] **Step 1: Write failing test for command plan**

Add a pure function test:

```js
import { pipelineCommandsFor } from "./run-data-lab-video-pipeline.mjs";

const commands = pipelineCommandsFor({ slug: "prueba-data-lab", input: "ai-output.json" });
assert.deepEqual(commands.map((cmd) => cmd.file), [
  "node",
  "node",
  "node"
]);
assert.match(commands[0].args.join(" "), /create-video-from-summary/);
assert.match(commands[1].args.join(" "), /elevenlabs-generate-scenes/);
assert.match(commands[2].args.join(" "), /trigger-n8n-build-render/);
assert.match(commands[2].args.join(" "), /--template data-lab/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts\test-ai-video-intake.mjs`

Expected: FAIL because `run-data-lab-video-pipeline.mjs` is missing.

- [ ] **Step 3: Implement pipeline runner**

Create `scripts/run-data-lab-video-pipeline.mjs`:

```js
import fs from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { normalizeAiVideoIntake } from "./ai-video-intake-schema.mjs";

export function pipelineCommandsFor({ slug, input }) {
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
      args: ["scripts/trigger-n8n-build-render.mjs", "--slug", slug, "--mode", "draft", "--template", "data-lab"]
    }
  ];
}

function run(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.file, command.args, { stdio: "inherit", shell: false });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command.file} exited with ${code}`)));
  });
}

async function main() {
  const input = process.argv[process.argv.indexOf("--input") + 1];
  if (!input || input === process.argv[0]) throw new Error("Usage: node scripts/run-data-lab-video-pipeline.mjs --input ai-output.json");
  const raw = JSON.parse(await fs.readFile(input, "utf8"));
  const intake = normalizeAiVideoIntake(raw);
  for (const command of pipelineCommandsFor({ slug: intake.slug, input })) {
    await run(command);
  }
  console.log(JSON.stringify({ event: "data_lab_review_ready", slug: intake.slug }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts\test-ai-video-intake.mjs`

Expected: PASS.

## Task 5: Simple Review Webhooks

**Files:**
- Create: `scripts/review-video-job.mjs`
- Test: `scripts/test-review-video-job.mjs`

**Interfaces:**
- Consumes:
  - `--slug <slug>`
  - `--action approve|reject`
  - optional `--caption`, `--publish-at`, `--platforms`
- Produces:
  - `approve`: calls `schedule-instagram-reel.mjs` exactly once per slug unless `--force` is passed.
  - `reject`: marks review status `rejected` / `needs_revision`.

- [ ] **Step 1: Write failing approve idempotency test**

Create `scripts/test-review-video-job.mjs`:

```js
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { markApproved, markRejected, shouldScheduleReel } from "./review-video-job.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "hf-review-"));
try {
  const queueDir = path.join(root, "content", "video-queue");
  await mkdir(queueDir, { recursive: true });
  await writeFile(path.join(queueDir, "queue.json"), JSON.stringify({
    items: [{
      slug: "review-test",
      status: "needs_review",
      outputs: {
        render: "https://media.example.com/review-test.mp4"
      },
      review: {
        status: "needs_review"
      }
    }]
  }, null, 2));

  assert.equal(await shouldScheduleReel({ root, slug: "review-test" }), true);
  await markApproved({ root, slug: "review-test", reelJobId: "reel-review-test-001" });
  assert.equal(await shouldScheduleReel({ root, slug: "review-test" }), false);

  await markRejected({ root, slug: "review-test", reason: "Cambiar CTA" });
  const queue = JSON.parse(await readFile(path.join(queueDir, "queue.json"), "utf8"));
  assert.equal(queue.items[0].review.status, "rejected");
  assert.equal(queue.items[0].review.reason, "Cambiar CTA");
} finally {
  await rm(root, { recursive: true, force: true });
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts\test-review-video-job.mjs`

Expected: FAIL because `review-video-job.mjs` is missing.

- [ ] **Step 3: Implement review helper**

Create `scripts/review-video-job.mjs`:

```js
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

async function readQueue(root) {
  const queuePath = path.join(root, "content", "video-queue", "queue.json");
  const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
  return { queuePath, queue };
}

export async function shouldScheduleReel({ root = process.cwd(), slug }) {
  const { queue } = await readQueue(root);
  const item = queue.items.find((entry) => entry.slug === slug);
  if (!item) throw new Error(`Unknown slug: ${slug}`);
  return !item.outputs?.reel_publish?.jobId && item.review?.status !== "approved";
}

export async function markApproved({ root = process.cwd(), slug, reelJobId }) {
  const { queuePath, queue } = await readQueue(root);
  const item = queue.items.find((entry) => entry.slug === slug);
  if (!item) throw new Error(`Unknown slug: ${slug}`);
  item.review = {
    ...(item.review || {}),
    status: "approved",
    approved_at: new Date().toISOString()
  };
  item.outputs = item.outputs || {};
  item.outputs.reel_publish = {
    ...(item.outputs.reel_publish || {}),
    jobId: reelJobId || item.outputs.reel_publish?.jobId || ""
  };
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

export async function markRejected({ root = process.cwd(), slug, reason = "" }) {
  const { queuePath, queue } = await readQueue(root);
  const item = queue.items.find((entry) => entry.slug === slug);
  if (!item) throw new Error(`Unknown slug: ${slug}`);
  item.status = "needs_revision";
  item.review = {
    ...(item.review || {}),
    status: "rejected",
    reason,
    rejected_at: new Date().toISOString()
  };
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: "inherit" });
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`${file} exited with ${code}`)));
  });
}

async function main() {
  const arg = (name, fallback = "") => {
    const index = process.argv.indexOf(name);
    return index >= 0 ? process.argv[index + 1] || fallback : fallback;
  };
  const slug = arg("--slug");
  const action = arg("--action");
  if (!slug || !["approve", "reject"].includes(action)) throw new Error("Usage: node scripts/review-video-job.mjs --slug <slug> --action approve|reject");
  if (action === "reject") {
    await markRejected({ slug, reason: arg("--reason", "Rejected from review webhook.") });
    console.log(JSON.stringify({ event: "video_rejected", slug }, null, 2));
    return;
  }
  if (!(await shouldScheduleReel({ slug })) && !process.argv.includes("--force")) {
    console.log(JSON.stringify({ event: "already_approved_or_scheduled", slug }, null, 2));
    return;
  }
  const caption = arg("--caption", "");
  const publishAt = arg("--publish-at", new Date().toISOString());
  const platforms = arg("--platforms", "instagram");
  await run("node", ["scripts/schedule-instagram-reel.mjs", "--slug", slug, "--caption", caption, "--publish-at", publishAt, "--platforms", platforms]);
  await markApproved({ slug });
  console.log(JSON.stringify({ event: "video_approved", slug }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Run review tests**

Run: `node scripts\test-review-video-job.mjs`

Expected: PASS.

## Task 6: n8n Workflow Design

**Files:**
- Create after manual build/export: `n8n/hyperframes-summary-intake-workflow.json`
- Modify after export: `content/SOCIAL-PUBLISHING.md`

**Interfaces:**
- Manual trigger input field: `summary`.
- AI output file transferred to runner as JSON.
- Approval URLs:
  - `POST /webhook/hyperframes-video-review-approve`
  - `POST /webhook/hyperframes-video-review-reject`

- [ ] **Step 1: Build n8n manual intake workflow**

Create workflow nodes in n8n:

```text
Manual Trigger
  -> Set Summary
  -> AI Generate Data Lab JSON
  -> Validate JSON Shape
  -> Write JSON To VPS Or Call Runner
  -> Execute Command: node scripts/run-data-lab-video-pipeline.mjs --input <ai-output.json>
  -> Respond/Notify Review Link
```

- [ ] **Step 2: Configure Manual Trigger input**

Manual input must expose only:

```json
{
  "summary": "paste full content summary here"
}
```

No required fields for CTA, offer, platform, or template.

- [ ] **Step 3: Configure AI node**

System prompt: content of `content/video-queue/ai-intake-prompt.md`.

User prompt:

```text
Resumen del usuario:
{{$json.summary}}
```

Temperature: `0.3` or lower.

Output parser: JSON object.

- [ ] **Step 4: Add validation Code node**

The validation node must reject non-JSON or missing fields before any shell command:

```js
const data = typeof $json.output === 'string' ? JSON.parse($json.output) : $json.output || $json;
if (!data.summary || !Array.isArray(data.scenes)) {
  throw new Error('AI output must include summary and scenes[].');
}
if (data.scenes.length < 4 || data.scenes.length > 7) {
  throw new Error('AI output must include 4-7 scenes.');
}
return [{ json: data }];
```

- [ ] **Step 5: Create review webhooks workflow**

Create separate n8n workflow:

```text
Webhook Approve
  -> Execute Command: node scripts/review-video-job.mjs --slug {{$json.slug}} --action approve --caption {{$json.caption}} --publish-at {{$json.publish_at || now}} --platforms {{$json.platforms || "instagram"}}
  -> Respond approved/scheduled

Webhook Reject
  -> Execute Command: node scripts/review-video-job.mjs --slug {{$json.slug}} --action reject --reason {{$json.reason || "Rejected"}}
  -> Respond rejected
```

- [ ] **Step 6: Include review links in final response**

The intake workflow should output:

```json
{
  "slug": "<slug>",
  "video_url": "<render-url>",
  "caption": "<caption>",
  "approve_url": "https://n8n.urltovideo.es/webhook/hyperframes-video-review-approve?slug=<slug>",
  "reject_url": "https://n8n.urltovideo.es/webhook/hyperframes-video-review-reject?slug=<slug>"
}
```

- [ ] **Step 7: Export sanitized workflow**

Export workflow JSON to `n8n/hyperframes-summary-intake-workflow.json`.

Remove tokens, credential IDs, and execution data before committing or sharing.

## Task 7: End-To-End Dry Run

**Files:**
- No production files besides generated test queue item.

**Interfaces:**
- Consumes: one test summary.
- Produces: review MP4 and approval/rejection URLs.

- [ ] **Step 1: Run local unit tests**

Run:

```powershell
node scripts\test-ai-video-intake.mjs
node scripts\test-review-video-job.mjs
node scripts\test-schedule-instagram-reel.mjs
node --check scripts\ai-video-intake-schema.mjs
node --check scripts\create-video-from-summary.mjs
node --check scripts\run-data-lab-video-pipeline.mjs
node --check scripts\review-video-job.mjs
```

Expected: all pass.

- [ ] **Step 2: Run n8n workflow with safe test summary**

Use summary:

```text
Explica por que una landing local debe tener una oferta clara, prueba visible y un formulario simple. Evita prometer resultados garantizados.
```

Expected: workflow returns a `video_url`, `approve_url`, and `reject_url`.

- [ ] **Step 3: Verify review video**

Open `video_url`.

Check:
- Hook readable.
- Mid-scene graphic readable.
- CTA inside safe lane.
- Audio present.
- No 3D character for `data-lab`.

- [ ] **Step 4: Test rejection webhook**

Call reject webhook on the test slug:

```powershell
Invoke-RestMethod -Method Post -Uri "<reject_url>" -Body (@{ reason = "Test rejection" } | ConvertTo-Json) -ContentType "application/json"
```

Expected: queue item status becomes `needs_revision`.

- [ ] **Step 5: Test approval with `--dry-run` mode first**

Before enabling real approve publication, temporarily route approve to:

```powershell
node scripts\schedule-instagram-reel.mjs --slug <slug> --caption "<caption>" --publish-at "<date>" --platforms instagram --dry-run
```

Expected: payload is correct and no Meta post is enqueued.

- [ ] **Step 6: Enable real approve only after dry run is reviewed**

Remove `--dry-run` from approve command.

Expected: approve webhook enqueues a real Reel job only once.

## Task 8: Documentation And Operational Rules

**Files:**
- Modify: `AGENTS.md`
- Modify: `content/CONTENT-WORKFLOW.md`
- Modify: `content/SOCIAL-PUBLISHING.md`
- Modify: `content/video-queue/README.md`

**Interfaces:**
- Documents commands, workflow IDs, and approval rules.

- [ ] **Step 1: Add V1 summary intake to `CONTENT-WORKFLOW.md`**

Add:

```markdown
## n8n Summary Intake V1

The user pastes only `summary` in n8n. AI derives the data-lab structure, scripts validate JSON, the VPS renders a draft, and the item stays `needs_review` until an approval webhook is called.
```

- [ ] **Step 2: Add review webhook rules to `SOCIAL-PUBLISHING.md`**

Add:

```markdown
Approval webhook schedules publication. Rejection webhook marks the item `needs_revision`. Approval must be idempotent and must not enqueue duplicate Reels for the same slug.
```

- [ ] **Step 3: Add AGENTS rule**

Add:

```markdown
Do not auto-publish summary-intake videos. The generated review MP4 must be approved through the review webhook before `schedule-instagram-reel.mjs` is called.
```

- [ ] **Step 4: Run doc sanity check**

Run:

```powershell
rg -n "Summary Intake|review webhook|schedule-instagram-reel|hyperframes-video-review" AGENTS.md content
```

Expected: all new operational docs are findable.

## Self-Review Notes

- Spec coverage: The plan covers summary-only intake, AI transformation, queue/pending package creation, voiceover/render path, simple approval/rejection webhooks, and publication through existing Reels workflow.
- Placeholder scan: No task relies on “TBD” or unspecified “add validation”; concrete code and commands are included for each implementation step.
- Type consistency: `NormalizedVideoIntake`, `normalizeAiVideoIntake`, `writeVideoPackage`, `pipelineCommandsFor`, `markApproved`, and `markRejected` are defined before use.
- Review Focus coverage: malformed JSON, unsafe defaults, duplicate slug, duplicate approvals, and Facebook partial failure are each handled by schema validation, defaults, idempotency, or status reporting tasks.
