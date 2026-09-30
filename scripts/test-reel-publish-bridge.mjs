import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./reel-publish-bridge.mjs", import.meta.url));
const root = await mkdtemp(path.join(os.tmpdir(), "hf-publish-bridge-"));
const queuePath = path.join(root, "content/video-queue/queue.json");
const csvPath = path.join(root, "content/video-queue/video-queue.csv");
const slug = "example-reel";
const jobId = "reel-example-reel-123";
const request = {
  REEL_SLUG: slug,
  REEL_CAPTION: "Texto aprobado",
  REEL_PUBLISH_AT: "2026-10-20T15:00:00+02:00",
  REEL_PLATFORMS: "instagram,facebook",
  REEL_CONFIRMATION: `PUBLICAR ${slug}`,
  REEL_JOB_ID: jobId,
  REEL_RUN_URL: "https://github.com/example/hypervideo/actions/runs/123"
};

function run(action, env = {}, args = []) {
  return spawnSync(process.execPath, [script, "--action", action, ...args], {
    cwd: root,
    env: { ...process.env, ...request, ...env },
    encoding: "utf8"
  });
}

function expectRejected(action, env, message) {
  const result = run(action, env);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, message);
}

try {
  await mkdir(path.dirname(queuePath), { recursive: true });
  await writeFile(queuePath, JSON.stringify({ items: [{
    slug,
    title: "Vídeo de ejemplo",
    status: "needs_review",
    review: { status: "needs_review" },
    outputs: {
      render: "https://media.example.com/example-reel.mp4",
      cover: "https://media.example.com/example-reel-cover.png"
    }
  }] }, null, 2));
  await writeFile(csvPath, "slug,status,render_url,notes\nexample-reel,needs_review,https://media.example.com/example-reel.mp4,\n");

  expectRejected("reserve", { REEL_CONFIRMATION: "" }, /confirm/i);
  expectRejected("reserve", { REEL_PUBLISH_AT: "tomorrow" }, /date|fecha|time/i);
  expectRejected("reserve", { REEL_PUBLISH_AT: "2026-09-31T12:00:00+02:00" }, /date|fecha|time/i);
  expectRejected("reserve", { REEL_PLATFORMS: "tiktok" }, /platform/i);
  assert.equal(JSON.parse(await readFile(queuePath)).items[0].status, "needs_review");

  const missingRender = JSON.parse(await readFile(queuePath));
  missingRender.items[0].outputs.render = "";
  await writeFile(queuePath, JSON.stringify(missingRender));
  expectRejected("reserve", {}, /mp4/i);
  missingRender.items[0].outputs.render = "https://media.example.com/example-reel.mp4";
  await writeFile(queuePath, JSON.stringify(missingRender));

  const reserve = run("reserve");
  assert.equal(reserve.status, 0, reserve.stderr);
  const reservation = JSON.parse(reserve.stdout);
  assert.equal(reservation.video_url, "https://media.example.com/example-reel.mp4");
  assert.equal(reservation.cover_url, "https://media.example.com/example-reel-cover.png");
  assert.equal(reservation.publish_at, "2026-10-20T15:00:00+02:00");
  assert.deepEqual(reservation.platforms, ["instagram", "facebook"]);
  assert.equal(JSON.parse(await readFile(queuePath)).items[0].publish_attempt.jobId, jobId);
  assert.equal(JSON.parse(await readFile(queuePath)).items[0].publish_attempt.cover_url, "https://media.example.com/example-reel-cover.png");
  assert.match(await readFile(csvPath, "utf8"), /publishing/);

  expectRejected("reserve", {}, /already|publishing|duplicate/i);
  const accepted = path.join(root, "accepted.json");
  await writeFile(accepted, JSON.stringify({
    event: "reel_scheduled", slug, jobId,
    response: { ok: true, created: 1, jobs: [{
      jobId: "reel-some-other-video-123", status: "pending",
      platforms: ["instagram", "facebook"],
      publish_at: "2026-10-20T15:00:00+02:00",
      video_url: "https://media.example.com/example-reel.mp4"
    }] }
  }));
  const mismatched = run("complete", {}, ["--response-file", accepted]);
  assert.notEqual(mismatched.status, 0);
  assert.match(mismatched.stderr, /response|accept/i);
  await writeFile(accepted, JSON.stringify({
    event: "reel_scheduled", slug, jobId,
    publish_at: "2026-10-20T15:00:00+02:00",
    platforms: ["instagram", "facebook"],
    response: { ok: false, jobs: [{ jobId, status: "failed" }] }
  }));
  const rejected = run("complete", {}, ["--response-file", accepted]);
  assert.notEqual(rejected.status, 0);
  assert.match(rejected.stderr, /response|accept/i);
  assert.equal(JSON.parse(await readFile(queuePath)).items[0].status, "publishing");
  await writeFile(accepted, JSON.stringify({
    event: "reel_scheduled", slug, jobId,
    publish_at: "2026-10-20T15:00:00+02:00",
    platforms: ["instagram", "facebook"],
    response: { ok: true, created: 1, jobs: [{
      jobId, status: "pending", platforms: ["instagram", "facebook"],
      publish_at: "2026-10-20T15:00:00+02:00",
      video_url: "https://media.example.com/example-reel.mp4"
    }] }
  }));
  const complete = run("complete", {}, ["--response-file", accepted]);
  assert.equal(complete.status, 0, complete.stderr);
  const item = JSON.parse(await readFile(queuePath)).items[0];
  assert.equal(item.status, "scheduled");
  assert.equal(item.review.status, "approved");
  assert.equal(item.outputs.reel_publish.jobId, jobId);
  assert.match(await readFile(csvPath, "utf8"), /scheduled/);
  expectRejected("reserve", {}, /already|scheduled|duplicate/i);

  console.log("reel-publish-bridge tests passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
