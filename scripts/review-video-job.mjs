import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";

async function readQueue(root) {
  const queuePath = path.join(root, "content", "video-queue", "queue.json");
  const queue = JSON.parse(await fs.readFile(queuePath, "utf8"));
  queue.items = Array.isArray(queue.items) ? queue.items : [];
  return { queuePath, queue };
}

function findItem(queue, slug) {
  const item = queue.items.find((entry) => entry.slug === slug);
  if (!item) throw new Error(`Unknown slug: ${slug}`);
  return item;
}

function renderUrlForItem(item) {
  return String(item?.outputs?.render || item?.render_url || item?.renderUrl || item?.video_url || item?.videoUrl || "").trim();
}

function approvalBlockReason(item) {
  if (item.outputs?.reel_publish?.jobId || item.review?.status === "approved") {
    return "already_approved_or_scheduled";
  }
  if (item.status !== "needs_review") {
    return `Video is not ready for approval. Expected status needs_review, got ${item.status || "missing"}.`;
  }
  const reviewStatus = item.review?.status || "needs_review";
  if (reviewStatus !== "needs_review") {
    return `Video is not ready for approval. Expected review.status needs_review, got ${reviewStatus}.`;
  }
  if (!renderUrlForItem(item)) {
    return "Video has no render URL. Render the video before approval.";
  }
  return "";
}

export async function shouldScheduleReel({ root = process.cwd(), slug }) {
  const { queue } = await readQueue(root);
  const item = findItem(queue, slug);
  return approvalBlockReason(item) === "";
}

export async function approvalBlockReasonForSlug({ root = process.cwd(), slug }) {
  const { queue } = await readQueue(root);
  return approvalBlockReason(findItem(queue, slug));
}

export async function resolveApprovalVideoUrl({ root = process.cwd(), slug, videoUrl = "" }) {
  const { queue } = await readQueue(root);
  const item = findItem(queue, slug);
  const queueVideoUrl = renderUrlForItem(item);
  const explicitVideoUrl = String(videoUrl || "").trim();
  if (explicitVideoUrl && explicitVideoUrl !== queueVideoUrl) {
    throw new Error("Provided video URL does not match the reviewed render URL.");
  }
  return queueVideoUrl;
}

export async function markApproved({ root = process.cwd(), slug, reelJobId = "" }) {
  const { queuePath, queue } = await readQueue(root);
  const item = findItem(queue, slug);
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
  const item = findItem(queue, slug);
  item.status = "needs_revision";
  item.review = {
    ...(item.review || {}),
    status: "rejected",
    reason,
    rejected_at: new Date().toISOString()
  };
  await fs.writeFile(queuePath, `${JSON.stringify(queue, null, 2)}\n`, "utf8");
}

export function approvalCommandArgs({
  slug,
  caption = "",
  publishAt = new Date().toISOString(),
  platforms = "instagram",
  envPath = "",
  videoUrl = "",
  allowEmptyCaption = false,
  dryRun = false
}) {
  const args = [
    "scripts/schedule-instagram-reel.mjs",
    "--slug", slug,
    "--caption", caption,
    "--publish-at", publishAt,
    "--platforms", platforms
  ];
  if (envPath) args.push("--env", envPath);
  if (dryRun) args.push("--dry-run");
  if (videoUrl) args.push("--video-url", videoUrl);
  if (allowEmptyCaption || !caption) args.push("--allow-empty-caption");
  return args;
}

function run(file, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, { stdio: "inherit", shell: false });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${file} exited with ${code}`));
    });
  });
}

function readArg(name, fallback = "") {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const slug = readArg("--slug");
  const action = readArg("--action");
  const root = readArg("--root", process.cwd());
  if (!slug || !["approve", "reject"].includes(action)) {
    throw new Error("Usage: node scripts/review-video-job.mjs --slug <slug> --action approve|reject");
  }

  if (action === "reject") {
    await markRejected({ root, slug, reason: readArg("--reason", "Rejected from review webhook.") });
    console.log(JSON.stringify({ event: "video_rejected", slug }, null, 2));
    return;
  }

  const blockReason = await approvalBlockReasonForSlug({ root, slug });
  if (blockReason === "already_approved_or_scheduled" && !process.argv.includes("--force")) {
    console.log(JSON.stringify({ event: "already_approved_or_scheduled", slug }, null, 2));
    return;
  }
  if (blockReason && !process.argv.includes("--force")) {
    throw new Error(blockReason);
  }

  const args = approvalCommandArgs({
    slug,
    caption: readArg("--caption", ""),
    publishAt: readArg("--publish-at", new Date().toISOString()),
    platforms: readArg("--platforms", "instagram"),
    envPath: readArg("--env", process.env.HYPERFRAMES_N8N_ENV || (process.platform === "win32" ? "C:/Users/USUARIO/Downloads/mcp-n8n/.env" : ".env.n8n")),
    videoUrl: await resolveApprovalVideoUrl({ root, slug, videoUrl: readArg("--video-url") }),
    dryRun: process.argv.includes("--dry-run")
  });
  await run("node", args);
  await markApproved({ root, slug });
  console.log(JSON.stringify({ event: "video_approved", slug }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
