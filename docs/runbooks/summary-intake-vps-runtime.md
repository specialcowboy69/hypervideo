# Summary Intake VPS Runtime Runbook

This runbook covers the deployed `summary -> data-lab video -> review` path for
workflow `eXLSEY7Fzg0kGBit`.

## What Changed

The Summary Intake workflow now expects the full HyperFrames project to exist on
the VPS at:

```text
/opt/n8n/hyperframes
```

The workflow does not rely on Node.js being installed on the VPS host. It runs
project scripts inside the existing Docker image:

```text
n8n-hyperframes-renderer
```

This is the important runtime rule to preserve when patching the workflow.

## Deployed Paths

```text
/opt/n8n/hyperframes
/opt/n8n/hyperframes_uploads
/opt/n8n/hyperframes_jobs
/opt/n8n/hyperframes_outputs
/opt/n8n/remotion-service
```

`/opt/n8n/hyperframes` is the deployed project folder used by Summary Intake.
`hyperframes_uploads`, `hyperframes_jobs`, and `hyperframes_outputs` are used by
the existing renderer infrastructure.

## Environment Files

The deployed project uses two env files:

```text
/opt/n8n/hyperframes/.env local
/opt/n8n/hyperframes/.env.n8n
```

Expected key names only:

```text
.env local:
ELEVENLABS_API_KEY
ELEVENLABS_VOICE_ID
ELEVENLABS_MODEL_ID

.env.n8n:
N8N_BASE_URL
CF_ACCESS_CLIENT_ID
CF_ACCESS_CLIENT_SECRET
```

Do not document values. These files should have mode `600`.

## Workflow Patch

Only patch the n8n workflow when the workflow shape changes: prompt text, JSON
schema, node code, Docker command shape, webhook behavior, or review/publication
logic.

Do not patch n8n for template-only or builder-only changes such as `data-lab`
CSS/layout/animation updates. For those, use the runtime deployment path below.

Patch script:

```powershell
node scripts\patch-summary-intake-vps-runtime.mjs
```

The patch:

- backs up the live n8n workflow under `n8n/backups/`;
- keeps workflow `eXLSEY7Fzg0kGBit` inactive unless it was already changed
  elsewhere;
- sets SSH nodes to `continueOnFail`;
- builds Docker commands that mount `/opt/n8n/hyperframes` into `/work`;
- writes a sanitized export to `n8n/hyperframes-summary-intake-workflow.json`.

## Template Or Runtime Deployment Without Workflow Patch

Use this path when updating the `data-lab` template, the video builder, persona
files, or local tests without changing n8n node logic.

Source of truth plan:

```text
docs/superpowers/plans/2026-09-23-update-data-lab-vps-runtime.md
```

Deploy only the files required by the Summary Intake / full build-check-render
path. The usual bundle includes:

```text
scripts/build-social-narrator-video.mjs
scripts/ai-video-intake-schema.mjs
scripts/create-video-from-summary.mjs
scripts/run-data-lab-video-pipeline.mjs
scripts/review-video-job.mjs
scripts/trigger-n8n-build-render.mjs
scripts/schedule-instagram-reel.mjs
scripts/test-*.mjs used by the deployment checks
scripts/vps/build-check-render-with-status.sh
assets/character/personas/*.md
content/video-queue/ai-intake-prompt.md
```

Do not include:

```text
.env local
.env.n8n
content/video-queue/queue.json
videos/
assets/character/audio/generated/
ZIP or MP4 outputs
```

`scripts/vps/render-with-status.sh` is intentionally not required for this
runtime path. It belongs to the render-only fallback endpoint
`/webhook/hyperframes-render`. Summary Intake and `data-lab` use the full
source-bundle wrapper:

```text
scripts/vps/build-check-render-with-status.sh
```

## Local Verification

Run after editing scripts or workflow patch code:

```powershell
node scripts\test-ai-video-intake.mjs
node scripts\test-data-lab-template.mjs
node scripts\test-review-video-job.mjs
node scripts\test-trigger-n8n-build-render.mjs
node scripts\test-schedule-instagram-reel.mjs
node --check scripts\patch-summary-intake-vps-runtime.mjs
node --check scripts\run-data-lab-video-pipeline.mjs
node --check scripts\review-video-job.mjs
node --check scripts\trigger-n8n-build-render.mjs
node --check scripts\schedule-instagram-reel.mjs
```

## Remote Verification Without Rendering

These commands verify runtime availability without creating a real video:

```bash
sudo -n docker run --rm \
  -v /opt/n8n/hyperframes:/work \
  -w /work \
  n8n-hyperframes-renderer \
  node scripts/test-data-lab-template.mjs
```

```bash
sudo -n docker run --rm \
  -v /opt/n8n/hyperframes:/work \
  -w /work \
  n8n-hyperframes-renderer \
  node scripts/test-trigger-n8n-build-render.mjs
```

```bash
sudo -n docker run --rm \
  -v /opt/n8n/hyperframes:/work \
  -w /work \
  n8n-hyperframes-renderer \
  node --check scripts/patch-summary-intake-vps-runtime.mjs
```

To verify env file presence without printing secrets:

```bash
stat -c '%U:%G %a %n' \
  /opt/n8n/hyperframes \
  /opt/n8n/hyperframes/.env.n8n \
  '/opt/n8n/hyperframes/.env local'
```

## Activation Checklist

Before activating `eXLSEY7Fzg0kGBit`:

- Confirm the deployed project exists at `/opt/n8n/hyperframes`.
- Confirm `.env local` and `.env.n8n` exist and are mode `600`.
- Confirm local tests pass.
- Confirm remote Docker smoke checks pass.
- Confirm the n8n workflow is backed up.
- Confirm the user wants to activate the webhook.
- Decide whether the first request should be a real generation or a controlled
  dry run.

Activation exposes the summary intake webhook. A real intake can spend
ElevenLabs/render resources.

## Controlled Test Shape

For the first live test, use a short but valid summary and keep publication out
of scope. The desired outcome is:

```text
summary accepted -> MP4 rendered -> queue item needs_review -> no publication
```

Do not call the approval webhook without explicit user approval. If the approval
path must be tested, pass `dry_run` so `schedule-instagram-reel.mjs` previews
the payload instead of enqueueing a post.

## Approval And Rejection

Approval webhook:

```text
POST /webhook/hyperframes-video-review-approve
```

Rejection webhook:

```text
POST /webhook/hyperframes-video-review-reject
```

Approval can call `schedule-instagram-reel.mjs`. Rejection marks the queue item
as `needs_revision`.

## Rollback

If the workflow patch is wrong:

1. Keep the workflow inactive.
2. Restore the previous workflow JSON from `n8n/backups/`.
3. Re-run structural checks on Code node snippets before reapplying.
4. Do not delete the VPS project folder unless it contains bad secrets or an
   explicitly unsafe deployment.

If the deployed files are wrong:

1. Re-upload the corrected local project to `/opt/n8n/hyperframes`.
2. Reapply permissions:

```bash
find /opt/n8n/hyperframes -type d -exec chmod 755 {} +
find /opt/n8n/hyperframes -type f -exec chmod 644 {} +
chmod 600 '/opt/n8n/hyperframes/.env local' /opt/n8n/hyperframes/.env.n8n
```

3. Re-run remote Docker smoke checks.

## Do Not Do

- Do not print env values.
- Do not assume host-level Node/npm exists.
- Do not publish or schedule from the first activation test.
- Do not update the workflow without a fresh backup.
- Do not mark a generated item `done` before review approval.
