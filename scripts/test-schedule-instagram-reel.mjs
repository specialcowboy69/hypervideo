import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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
          render: "https://media.example.com/test-video.mp4"
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

  console.log("schedule-instagram-reel tests passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
