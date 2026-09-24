# HyperFrames Docs

This folder contains operational docs for the HyperFrames content and remote
rendering setup.

## Workflows

- `docs/workflows/eXLSEY7Fzg0kGBit.md`: n8n Summary Intake workflow for
  summary-to-Data-Lab video generation.

## Runbooks

- `docs/runbooks/summary-intake-vps-runtime.md`: VPS deployment, Docker runtime,
  verification, activation, dry-run, and rollback notes for Summary Intake.
- `docs/superpowers/plans/2026-09-23-update-data-lab-vps-runtime.md`:
  step-by-step runtime deploy plan for updating `data-lab` on the VPS without
  patching n8n or overwriting remote queue/env state.

## Core Project Docs

- `CHATGPT_PROJECT_CONTEXT.md`: compact orientation for ChatGPT web sessions.
- `AGENTS.md`: high-priority operating rules for Codex sessions.
- `content/CONTENT-WORKFLOW.md`: normal content production flow.
- `content/video-queue/README.md`: video queue schema and status rules.
- `content/SOCIAL-PUBLISHING.md`: publication, scheduling, R2, and n8n notes.
- `scripts/README.md`: script-level entry points.

Keep these docs additive. Do not delete historical notes unless they are
actively wrong and replacing them is safer than leaving a correction below.

## Source Of Truth

- Content planning and queues: `content/CONTENT-WORKFLOW.md`.
- Video queue schema and status meanings: `content/video-queue/README.md`.
- Social publication and Meta/n8n scheduling: `content/SOCIAL-PUBLISHING.md`.
- Summary Intake workflow contract: `docs/workflows/eXLSEY7Fzg0kGBit.md`.
- VPS runtime deployment and validation: `docs/runbooks/summary-intake-vps-runtime.md`.
- Session operating rules: `AGENTS.md`.
