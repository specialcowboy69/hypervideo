import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildPayload,
  normalizePlatforms,
  resolveVideoUrl,
  updateVideoQueueAfterSchedule
} from "./schedule-instagram-reel.mjs";

const root = await mkdtemp(path.join(os.tmpdir(), "hf-reel-schedule-test-"));
const slug = "test-video";

try {
  await mkdir(path.join(root, "content", "video-queue"), { recursive: true });
  await writeFile(path.join(root, "content", "video-queue", "queue.json"), JSON.stringify({
    items: [
      {
        slug,
        title: "Test Video",
        status: "needs_review",
        outputs: {
          render: "https://media.example.com/test-video.mp4",
          cover: "https://media.example.com/test-video-cover.png"
        }
      }
    ]
  }, null, 2));
  await writeFile(
    path.join(root, "content", "video-queue", "video-queue.csv"),
    "slug,status,render_url,notes\n" +
      "test-video,needs_review,https://media.example.com/test-video.mp4,\n"
  );

  assert.deepEqual(normalizePlatforms("ig,facebook-reel"), ["instagram", "facebook"]);

  const videoUrl = await resolveVideoUrl({ root, slug });
  assert.equal(videoUrl, "https://media.example.com/test-video.mp4");

  const payload = buildPayload({
    slug,
    videoUrl,
    coverUrl: "https://media.example.com/test-video-cover.png",
    caption: "Caption lista",
    publishAt: "2026-09-22T10:00:00+02:00",
    platforms: ["instagram", "facebook"],
    jobId: "reel-test-video-001",
    title: "Test Video"
  });

  assert.deepEqual(payload, {
    jobId: "reel-test-video-001",
    slug,
    video_url: "https://media.example.com/test-video.mp4",
    cover_url: "https://media.example.com/test-video-cover.png",
    caption: "Caption lista",
    publish_at: "2026-09-22T10:00:00+02:00",
    platforms: ["instagram", "facebook"],
    facebook_title: "Test Video",
    facebook_description: "Caption lista",
    source: "hyperframes"
  });

  await updateVideoQueueAfterSchedule({
    root,
    slug,
    payload,
    response: {
      ok: true,
      jobs: [{ jobId: "reel-test-video-001", status: "pending" }]
    }
  });

  const queue = JSON.parse(await readFile(path.join(root, "content", "video-queue", "queue.json"), "utf8"));
  const item = queue.items.find((entry) => entry.slug === slug);
  assert.equal(item.status, "scheduled");
  assert.equal(item.outputs.reel_publish.jobId, "reel-test-video-001");
  assert.deepEqual(item.outputs.reel_publish.platforms, ["instagram", "facebook"]);

  const csv = await readFile(path.join(root, "content", "video-queue", "video-queue.csv"), "utf8");
  assert.match(csv, /scheduled/);
  assert.match(csv, /reel-test-video-001/);

  // The GitHub action supplies Cloudflare and n8n credentials as environment
  // variables. This local server verifies the real CLI sends one authorized
  // payload without requiring an env file or mutating the queue on --no-update.
  const requests = [];
  const server = createServer(async (req, res) => {
    let body = "";
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, data: JSON.parse(body) });
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ jobs: [{ jobId: "reel-test-video-002", status: "queued" }] }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const child = spawn(process.execPath, [
      fileURLToPath(new URL("./schedule-instagram-reel.mjs", import.meta.url)),
      "--slug", slug, "--caption", "Texto aprobado", "--publish-at", "2026-10-20T15:00:00+02:00",
      "--platforms", "instagram,facebook", "--job-id", "reel-test-video-002", "--no-update",
      "--cover-url", "https://media.example.com/test-video-cover.png",
      "--env", path.join(root, "missing.env")
    ], {
      cwd: root,
      env: { ...process.env, N8N_BASE_URL: `http://127.0.0.1:${server.address().port}` }
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    const [code] = await new Promise((resolve) => child.on("close", (...args) => resolve(args)));
    assert.equal(code, 0, stderr);
    assert.equal(requests.length, 1);
    assert.equal(requests[0].path, "/webhook/instagram-reel-schedule");
    assert.deepEqual(requests[0].data.platforms, ["instagram", "facebook"]);
    assert.equal(requests[0].data.cover_url, "https://media.example.com/test-video-cover.png");
    assert.equal(JSON.parse(await readFile(path.join(root, "content/video-queue/queue.json"))).items[0].outputs.reel_publish.jobId, "reel-test-video-001");
  } finally {
    server.close();
  }

  console.log("schedule-instagram-reel tests passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
