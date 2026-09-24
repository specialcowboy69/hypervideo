import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { approvalCommandArgs, markApproved, markRejected, resolveApprovalVideoUrl, shouldScheduleReel } from "./review-video-job.mjs";

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
    }, {
      slug: "pending-no-render",
      status: "pending",
      outputs: {
        render: ""
      },
      review: {
        status: "not_ready"
      }
    }, {
      slug: "needs-review-no-render",
      status: "needs_review",
      outputs: {},
      review: {
        status: "needs_review"
      }
    }]
  }, null, 2));

  assert.equal(await shouldScheduleReel({ root, slug: "review-test" }), true);
  assert.equal(await shouldScheduleReel({ root, slug: "pending-no-render" }), false);
  assert.equal(await shouldScheduleReel({ root, slug: "needs-review-no-render" }), false);
  assert.equal(await resolveApprovalVideoUrl({ root, slug: "review-test" }), "https://media.example.com/review-test.mp4");
  await assert.rejects(
    () => resolveApprovalVideoUrl({ root, slug: "review-test", videoUrl: "https://media.example.com/old-video.mp4" }),
    /does not match/
  );
  await markApproved({ root, slug: "review-test", reelJobId: "reel-review-test-001" });
  assert.equal(await shouldScheduleReel({ root, slug: "review-test" }), false);

  await markRejected({ root, slug: "review-test", reason: "Cambiar CTA" });
  const queue = JSON.parse(await readFile(path.join(queueDir, "queue.json"), "utf8"));
  assert.equal(queue.items[0].review.status, "rejected");
  assert.equal(queue.items[0].review.reason, "Cambiar CTA");

  const approvalArgs = approvalCommandArgs({
    slug: "review-test",
    caption: "Caption",
    publishAt: "2026-09-22T12:00:00+02:00",
    platforms: "instagram",
    envPath: ".env.n8n"
  });
  assert.match(approvalArgs.join(" "), /--env \.env\.n8n/);

  console.log("review-video-job tests passed");
} finally {
  await rm(root, { recursive: true, force: true });
}
