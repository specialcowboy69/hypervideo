#!/usr/bin/env node
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const args = parseArgs(process.argv.slice(2));
const inputPath = resolve(args.input || "content/videos/dominar-seo-local/voiceover.scenes.json");
const outDir = resolve(args.out || "assets/character/audio/generated/dominar-seo-local");
const env = await loadEnv(resolve(args.env || ".env"));

const apiKey = process.env.ELEVENLABS_API_KEY || env.ELEVENLABS_API_KEY;
if (!apiKey) {
  fail("Missing ELEVENLABS_API_KEY. Copy .env.example to .env and fill it.");
}

const manifest = JSON.parse(await readFile(inputPath, "utf8"));
const eleven = manifest.elevenlabs || {};
const voiceId = args.voice || eleven.voice_id || process.env.ELEVENLABS_VOICE_ID || env.ELEVENLABS_VOICE_ID;
if (!voiceId) {
  fail("Missing voice id. Set elevenlabs.voice_id in the manifest or ELEVENLABS_VOICE_ID in .env.");
}

const modelId = args.model || eleven.model_id || process.env.ELEVENLABS_MODEL_ID || env.ELEVENLABS_MODEL_ID || "eleven_multilingual_v2";
const outputFormat = eleven.output_format || "mp3_44100_128";
const useTimestamps = eleven.use_timestamps !== false;
const pauseMs = Number(eleven.pause_after_scene_ms ?? 180);
const force = Boolean(args.force);

await mkdir(outDir, { recursive: true });

const statePath = resolve(outDir, "generation-state.json");
const previousState = existsSync(statePath) ? JSON.parse(await readFile(statePath, "utf8")) : {};
const state = { scenes: {}, generated_at: new Date().toISOString(), input: inputPath };
const timings = [];
const alignments = {};
let cursor = 0;

for (let i = 0; i < manifest.scenes.length; i += 1) {
  const scene = manifest.scenes[i];
  const id = safeId(scene.id || `scene-${String(i + 1).padStart(2, "0")}`);
  const text = String(scene.text || "").trim();
  if (!text) {
    fail(`Scene ${id} has empty text.`);
  }

  const hash = hashScene({ text, voiceId, modelId, outputFormat, voice_settings: eleven.voice_settings || {} });
  const audioPath = resolve(outDir, `${id}.mp3`);
  const alignmentPath = resolve(outDir, `${id}.alignment.json`);
  const cached = previousState.scenes?.[id]?.hash === hash && existsSync(audioPath);

  if (!cached || force) {
    const result = await generateScene({
      apiKey,
      voiceId,
      modelId,
      outputFormat,
      useTimestamps,
      text,
      voiceSettings: eleven.voice_settings || {},
      previousText: manifest.scenes[i - 1]?.text || "",
      nextText: manifest.scenes[i + 1]?.text || ""
    });

    if (useTimestamps) {
      const audioBuffer = Buffer.from(result.audio_base64, "base64");
      await writeFile(audioPath, audioBuffer);
      await writeFile(alignmentPath, JSON.stringify(result.alignment || result.normalized_alignment || {}, null, 2));
    } else {
      await writeFile(audioPath, Buffer.from(await result.arrayBuffer()));
    }
  }

  const duration = await getDurationSeconds(audioPath);
  timings.push({
    id,
    label: scene.label || id,
    animation: scene.animation || "talking",
    screen_text: scene.screen_text || "",
    visual_note: scene.visual_note || "",
    audio: audioPath,
    start: round(cursor),
    end: round(cursor + duration),
    duration: round(duration),
    pause_after_ms: i === manifest.scenes.length - 1 ? 0 : pauseMs
  });

  if (existsSync(alignmentPath)) {
    alignments[id] = JSON.parse(await readFile(alignmentPath, "utf8"));
  }

  state.scenes[id] = {
    hash,
    audio: audioPath,
    alignment: existsSync(alignmentPath) ? alignmentPath : null,
    duration_s: round(duration)
  };

  cursor += duration + (i === manifest.scenes.length - 1 ? 0 : pauseMs / 1000);
}

await writeFile(resolve(outDir, "voiceover-timing.json"), JSON.stringify({
  project: manifest.project || {},
  total_duration_s: round(cursor),
  scenes: timings
}, null, 2));

await writeFile(resolve(outDir, "alignment.json"), JSON.stringify(alignments, null, 2));
await writeFile(statePath, JSON.stringify(state, null, 2));

const masterPath = resolve(outDir, "voiceover-master.mp3");
await concatAudio(timings.map((t) => t.audio), masterPath, pauseMs);

console.log(`Generated ${timings.length} scenes`);
console.log(`Timing: ${resolve(outDir, "voiceover-timing.json")}`);
console.log(`Master: ${masterPath}`);

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2);
    if (key === "force") {
      out.force = true;
    } else {
      out[key] = argv[i + 1];
      i += 1;
    }
  }
  return out;
}

async function loadEnv(path) {
  if (!existsSync(path)) return {};
  const text = await readFile(path, "utf8");
  const values = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index === -1) continue;
    values[trimmed.slice(0, index)] = trimmed.slice(index + 1);
  }
  return values;
}

async function generateScene({ apiKey, voiceId, modelId, outputFormat, useTimestamps, text, voiceSettings, previousText, nextText }) {
  const endpoint = useTimestamps ? "with-timestamps" : "";
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/${endpoint}?output_format=${encodeURIComponent(outputFormat)}`.replace(/\/\?/, "?");
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: voiceSettings,
      previous_text: previousText,
      next_text: nextText
    })
  });

  if (!response.ok) {
    const body = await response.text();
    fail(`ElevenLabs request failed ${response.status}: ${body}`);
  }

  return useTimestamps ? response.json() : response;
}

async function getDurationSeconds(file) {
  const ffprobe = findBinary("ffprobe");
  if (!ffprobe) {
    fail("ffprobe not found. Install ffmpeg/ffprobe or run inside a HyperFrames project with ffprobe available.");
  }
  const result = spawnSync(ffprobe, [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    file
  ], { encoding: "utf8" });
  if (result.status !== 0) {
    fail(`ffprobe failed for ${file}: ${result.stderr}`);
  }
  return Number.parseFloat(result.stdout.trim());
}

async function concatAudio(files, output, pauseMs) {
  const ffmpeg = findBinary("ffmpeg");
  if (!ffmpeg) {
    console.warn("ffmpeg not found; scene files were generated but master audio was not concatenated.");
    return;
  }

  await mkdir(dirname(output), { recursive: true });

  if (files.length === 1) {
    await copyFile(files[0], output);
    return;
  }

  const listPath = resolve(dirname(output), "concat-list.txt");
  const pausePath = resolve(dirname(output), "scene-pause.mp3");

  if (pauseMs > 0) {
    await run(ffmpeg, [
      "-y",
      "-f", "lavfi",
      "-i", "anullsrc=r=44100:cl=mono",
      "-t", String(pauseMs / 1000),
      "-q:a", "9",
      "-acodec", "libmp3lame",
      pausePath
    ]);
  }

  const lines = [];
  files.forEach((file, index) => {
    lines.push(`file '${escapeConcatPath(file)}'`);
    if (pauseMs > 0 && index < files.length - 1) {
      lines.push(`file '${escapeConcatPath(pausePath)}'`);
    }
  });
  await writeFile(listPath, lines.join("\n"));

  await run(ffmpeg, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    output
  ]);
}

function findBinary(name) {
  const local = resolve("videos/dominar-seo-local/node_modules", name === "ffmpeg" ? "@ffmpeg-installer/win32-x64/ffmpeg.exe" : "@ffprobe-installer/win32-x64/ffprobe.exe");
  if (existsSync(local)) return local;
  return name;
}

function run(command, commandArgs) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, commandArgs, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolveRun();
      else reject(new Error(`${command} exited with ${code}`));
    });
  });
}

function hashScene(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function safeId(id) {
  return String(id).toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function escapeConcatPath(file) {
  return file.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

