# HyperFrames Social Video System

Workspace for generating vertical social videos, Data Lab explainers, Instagram Reels, Facebook Reels, and Instagram carousels.

## Current Workflow

- Chat brief or n8n summary intake creates structured queue content.
- `content/video-queue/` is the source of truth for videos.
- `content/carousel-queue/` is the source of truth for carousels.
- `scripts/` contains the local and VPS orchestration scripts.
- Heavy build/check/snapshot/render work runs on the VPS through n8n.
- Generated drafts stay in `needs_review` until explicitly approved.

## Main Docs

- `CHATGPT_PROJECT_CONTEXT.md`: quick entry point for ChatGPT web sessions.
- `AGENTS.md`: operating rules for Codex sessions.
- `content/CONTENT-WORKFLOW.md`: normal content workflow.
- `content/video-queue/README.md`: video queue schema and statuses.
- `content/carousel-queue/README.md`: carousel queue workflow.
- `content/SOCIAL-PUBLISHING.md`: publication and scheduling workflow.
- `docs/runbooks/summary-intake-vps-runtime.md`: VPS runtime and Summary Intake runbook.
- `docs/workflows/eXLSEY7Fzg0kGBit.md`: n8n Summary Intake contract.

## Security Notes

Secrets are intentionally not tracked. Copy `.env.example` and create the local env files required by the scripts. Do not commit `.env local`, n8n secrets, Meta tokens, Cloudflare Access credentials, or generated media outputs.

## Generated Files

The repository ignores generated videos, renders, snapshots, audio, ZIP bundles, n8n backups, and local tool state. Those artifacts can be recreated from queue items, scripts, ElevenLabs credentials, and the VPS render pipeline.

