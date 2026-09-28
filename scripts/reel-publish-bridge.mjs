import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import {
  buildPayload,
  normalizePlatforms,
  parseCsv,
  stringifyCsv,
  updateVideoQueueAfterSchedule
} from "./schedule-instagram-reel.mjs";

const queueRelative = "content/video-queue/queue.json";
const csvRelative = "content/video-queue/video-queue.csv";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? "" : process.argv[index + 1] || "";
}

async function readItem(root, slug) {
  const queue = JSON.parse(await fs.readFile(path.join(root, queueRelative), "utf8"));
  const matches = queue.items?.filter((entry) => entry.slug === slug) || [];
  if (matches.length !== 1) throw new Error("Exactly one video queue entry is required for this slug.");
  return { queue, item: matches[0] };
}

function validJobId(jobId, slug) {
  if (!/^[A-Za-z0-9._-]{1,110}$/.test(jobId) || !jobId.startsWith(`reel-${slug}-`)) {
    throw new Error("Invalid publication job ID.");
  }
}

function publishTime(input, now = new Date()) {
  if (input === "now") return now.toISOString();
  const match = /^(\d{4}-\d\d-\d\d)T(\d\d):(\d\d)(?::(\d\d))?(Z|([+-])(\d\d):(\d\d))$/.exec(input || "");
  const parsed = Date.parse(input || "");
  const offset = match?.[5] === "Z" ? 0
    : (match?.[6] === "-" ? -1 : 1) * (Number(match?.[7]) * 60 + Number(match?.[8])) * 60_000;
  const wallClock = match && Number.isFinite(parsed) && Number.isFinite(offset)
    ? new Date(parsed + offset).toISOString().slice(0, 19) : "";
  if (!match || !Number.isFinite(parsed) || parsed <= now.getTime()
    || wallClock !== `${match[1]}T${match[2]}:${match[3]}:${match[4] || "00"}`) {
    throw new Error("Invalid publish date: use a future ISO time with timezone, or now.");
  }
  return input;
}

async function setCsvStatus(root, slug, status) {
  const csvPath = path.join(root, csvRelative);
  const rows = parseCsv(await fs.readFile(csvPath, "utf8"));
  const slugColumn = rows[0]?.indexOf("slug") ?? -1;
  const statusColumn = rows[0]?.indexOf("status") ?? -1;
  if (slugColumn < 0 || statusColumn < 0) throw new Error("The video queue CSV must have slug and status columns.");
  const matches = rows.slice(1).filter((row) => row[slugColumn] === slug);
  if (matches.length !== 1) throw new Error("Exactly one video queue CSV entry is required for this slug.");
  matches[0][statusColumn] = status;
  await fs.writeFile(csvPath, stringifyCsv(rows));
}

export async function reserve(root, input) {
  const { queue, item } = await readItem(root, input.slug);
  if (input.confirmation !== `PUBLICAR ${input.slug}`) {
    throw new Error("Explicit confirmation required: PUBLICAR <slug>.");
  }
  validJobId(input.jobId, input.slug);
  if (!/^https:\/\/[^\s"'<>]+\.mp4(?:\?[^\s"'<>]*)?$/i.test(item.outputs?.render || "")) {
    throw new Error("The reviewed item must contain a public HTTPS MP4 render URL.");
  }
  if (item.status !== "needs_review" || (item.review?.status && item.review.status !== "needs_review")
    || item.outputs?.reel_publish || item.publish_attempt) {
    throw new Error("This item is already publishing, scheduled, or not awaiting review.");
  }
  if (!String(input.caption || "").trim()) throw new Error("A nonempty caption is required.");
  if (!/^https:\/\/github\.com\/[^\s]+\/actions\/runs\/\d+$/.test(input.runUrl || "")) {
    throw new Error("Invalid GitHub Actions run URL.");
  }
  const payload = buildPayload({
    slug: input.slug,
    videoUrl: item.outputs.render,
    caption: input.caption,
    publishAt: publishTime(input.publishAt),
    platforms: normalizePlatforms(input.platforms),
    jobId: input.jobId,
    title: item.title
  });

  // The reservation is pushed to main before calling n8n. An uncertain webhook
  // result must never allow a second dispatch without a manual reconciliation.
  item.publish_attempt = {
    jobId: payload.jobId,
    runUrl: input.runUrl,
    video_url: payload.video_url,
    caption: payload.caption,
    publish_at: payload.publish_at,
    platforms: payload.platforms,
    title: item.title,
    reserved_at: new Date().toISOString()
  };
  item.status = "publishing";
  await setCsvStatus(root, input.slug, "publishing");
  await fs.writeFile(path.join(root, queueRelative), `${JSON.stringify(queue, null, 2)}\n`);
  return payload;
}

export async function complete(root, { slug, jobId, responseFile }) {
  validJobId(jobId, slug);
  const { item } = await readItem(root, slug);
  if (item.status !== "publishing" || item.publish_attempt?.jobId !== jobId) {
    throw new Error("The publication reservation does not match this job.");
  }
  const accepted = JSON.parse(await fs.readFile(responseFile, "utf8"));
  const attempt = item.publish_attempt;
  const jobs = accepted.response?.jobs;
  const job = Array.isArray(jobs) && jobs.length === 1 ? jobs[0] : null;
  const samePlatforms = Array.isArray(job?.platforms)
    && [...job.platforms].sort().join(",") === [...attempt.platforms].sort().join(",");
  if (accepted.event !== "reel_scheduled" || accepted.jobId !== jobId || accepted.slug !== slug
    || accepted.response?.ok !== true || !job || job.jobId !== jobId
    || !["pending", "queued", "scheduled", "accepted"].includes(String(job.status || "").toLowerCase())
    || !samePlatforms || job.video_url !== attempt.video_url
    || !Number.isFinite(Date.parse(job.publish_at))
    || Date.parse(job.publish_at) !== Date.parse(attempt.publish_at)) {
    throw new Error("The n8n response did not confirm this Reel job.");
  }
  const payload = buildPayload({
    slug,
    videoUrl: attempt.video_url,
    caption: attempt.caption,
    publishAt: attempt.publish_at,
    platforms: attempt.platforms,
    jobId,
    title: attempt.title
  });
  await updateVideoQueueAfterSchedule({ root, slug, payload, response: accepted.response });
  const { queue, item: completed } = await readItem(root, slug);
  completed.review = { ...(completed.review || {}), status: "approved" };
  await fs.writeFile(path.join(root, queueRelative), `${JSON.stringify(queue, null, 2)}\n`);
  return { slug, jobId, status: "scheduled", publish_at: attempt.publish_at, platforms: attempt.platforms };
}

async function main() {
  const action = arg("--action");
  const root = process.cwd();
  const slug = process.env.REEL_SLUG || "";
  const jobId = process.env.REEL_JOB_ID || "";
  if (action === "reserve") {
    const result = await reserve(root, {
      slug, jobId,
      caption: process.env.REEL_CAPTION,
      publishAt: process.env.REEL_PUBLISH_AT,
      platforms: process.env.REEL_PLATFORMS,
      confirmation: process.env.REEL_CONFIRMATION,
      runUrl: process.env.REEL_RUN_URL
    });
    console.log(JSON.stringify(result));
  } else if (action === "complete") {
    console.log(JSON.stringify(await complete(root, { slug, jobId, responseFile: arg("--response-file") })));
  } else {
    throw new Error("Use --action reserve or --action complete.");
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
